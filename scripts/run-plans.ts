#!/usr/bin/env bun
/**
 * Sequential plan executor.
 *
 * Runs one `claude -p` session per plan, in order, each with a fresh context.
 * The only link between sessions is `plans/execution/*.md`, which every session
 * reads first and writes to last.
 *
 * Usage: bun scripts/run-plans.ts [options]
 *   --plans 021,025        run exactly these, in this order
 *   --from 025             start at this plan and continue to the end
 *   --to 028               stop after this plan
 *   --branch <name>        create/switch to this branch before running
 *   --no-commit            do not commit after each plan
 *   --keep-going           continue after a blocked or failed plan
 *   --model <alias>        model for every session (default: opus)
 *   --budget <usd>         hard spend cap per plan (default: 10)
 *   --permission-mode <m>  default: bypassPermissions (unattended)
 *   --dry-run              print the queue and exit
 *   --yes                  skip the confirmation prompt
 */
import { readdir } from 'node:fs/promises';

const ENTRY_DIR = 'plans/execution';
const LOG_DIR = 'plans/execution/logs';
const RULES_PATH = 'scripts/plan-executor-rules.md';

/** Execution order from `plans/README.md` ("Recommended execution order"). */
const DEFAULT_ORDER = [
  '021',
  '022',
  '023',
  '024',
  '025',
  '026',
  '027',
  '028',
  '029',
  '030',
  '031',
  '032',
  '033',
];

const STOP_STATUSES = new Set(['blocked', 'failed']);

type RunRecord = {
  plan: string;
  status: string;
  exitCode: number;
  costUsd: number;
  durationMs: number;
  turns: number;
  sessionId: string;
  commit: string | null;
  startedAt: string;
  finishedAt: string;
};

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  const bare = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags.set(name, next);
      index += 1;
    } else bare.add(name);
  }
  return { flags, bare };
}

const { flags, bare } = parseArgs(Bun.argv.slice(2));
const model = flags.get('model') ?? 'opus';
const budget = flags.get('budget') ?? '10';
const permissionMode = flags.get('permission-mode') ?? 'bypassPermissions';
const shouldCommit = !bare.has('no-commit');
const keepGoing = bare.has('keep-going');
const dryRun = bare.has('dry-run');

async function sh(command: string[]): Promise<{ code: number; out: string }> {
  const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(child.stdout).text();
  const err = await new Response(child.stderr).text();
  await child.exited;
  return { code: child.exitCode ?? 1, out: `${out}${err}`.trim() };
}

async function planPath(id: string): Promise<string | null> {
  const entries = await readdir('plans');
  const match = entries.find((name) => name.startsWith(`${id}-`) && name.endsWith('.md'));
  return match ? `plans/${match}` : null;
}

function selectQueue(): string[] {
  const explicit = flags.get('plans');
  if (explicit) return explicit.split(',').map((id) => id.trim());
  let queue = [...DEFAULT_ORDER];
  const from = flags.get('from');
  const to = flags.get('to');
  if (from && queue.includes(from)) queue = queue.slice(queue.indexOf(from));
  if (to && queue.includes(to)) queue = queue.slice(0, queue.indexOf(to) + 1);
  return queue;
}

function frontmatterField(text: string, field: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  if (!block?.[1]) return null;
  const line = block[1]
    .split('\n')
    .find((candidate) => candidate.trimStart().startsWith(`${field}:`));
  if (!line) return null;
  return line
    .slice(line.indexOf(':') + 1)
    .trim()
    .replace(/^['"]|['"]$/gu, '');
}

function buildPrompt(id: string, planFile: string, history: string[]): string {
  const historyLine =
    history.length > 0
      ? `Earlier runs in this loop, in order: ${history.join(', ')}. Their entries are in ${ENTRY_DIR}/.`
      : 'You are the first run of this loop. There are no earlier entries yet.';
  return [
    `Execute plan ${id}: ${planFile}`,
    '',
    historyLine,
    '',
    'Follow the plan executor rules in your system prompt exactly.',
    `Start by reading every file in ${ENTRY_DIR}/, then AGENTS.md, then ${planFile} in full.`,
    `Finish by updating the plan's status row in plans/README.md and writing ${ENTRY_DIR}/${id}.md.`,
    'Do not commit and do not push.',
  ].join('\n');
}

function fallbackEntry(id: string): string {
  return [
    '---',
    `plan: '${id}'`,
    'title: Session terminée sans compte rendu',
    'status: failed',
    '---',
    '',
    '## Fait',
    "- Rien de confirmé : la session s'est arrêtée sans écrire son entrée.",
    '',
    '## Questions',
    `- Relire \`${LOG_DIR}/${id}.jsonl\` pour savoir où la session s'est arrêtée.`,
    '',
    '## Reste à faire',
    '- Tout le plan.',
    '',
  ].join('\n');
}

/** Streams one `claude -p` session, printing a compact activity line as it works. */
async function runPlan(id: string, planFile: string, history: string[]): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const rules = await Bun.file(RULES_PATH).text();
  const child = Bun.spawn(
    [
      'claude',
      '-p',
      buildPrompt(id, planFile, history),
      '--append-system-prompt',
      rules,
      '--model',
      model,
      '--permission-mode',
      permissionMode,
      '--max-budget-usd',
      budget,
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' },
  );

  const log = Bun.file(`${LOG_DIR}/${id}.jsonl`).writer();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: Record<string, unknown> | null = null;
  let toolCount = 0;

  for await (const chunk of child.stdout) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      log.write(`${line}\n`);
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (event.type === 'result') result = event;
      if (event.type !== 'assistant') continue;
      const message = event.message as { content?: { type: string; name?: string }[] } | undefined;
      for (const block of message?.content ?? []) {
        if (block.type !== 'tool_use') continue;
        toolCount += 1;
        if (toolCount % 10 === 0) console.log(`      … ${toolCount} actions (${block.name})`);
      }
    }
  }
  const stderr = await new Response(child.stderr).text();
  await child.exited;
  await log.end();
  if (stderr.trim()) console.log(`      stderr: ${stderr.trim().slice(0, 400)}`);

  if (result?.is_error === true)
    console.log(`      session error: ${String(result.result ?? '').slice(0, 300)}`);

  const entryPath = `${ENTRY_DIR}/${id}.md`;
  let status = 'failed';
  if (await Bun.file(entryPath).exists())
    status = frontmatterField(await Bun.file(entryPath).text(), 'status') ?? 'failed';
  else await Bun.write(entryPath, fallbackEntry(id));

  return {
    plan: id,
    status,
    exitCode: child.exitCode ?? 1,
    costUsd: Number(result?.total_cost_usd ?? 0),
    durationMs: Number(result?.duration_ms ?? 0),
    turns: Number(result?.num_turns ?? 0),
    sessionId: String(result?.session_id ?? ''),
    commit: null,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

async function commitPlan(id: string): Promise<string | null> {
  const entry = await Bun.file(`${ENTRY_DIR}/${id}.md`).text();
  const subject = frontmatterField(entry, 'commit_subject') ?? `chore(plans): apply plan ${id}`;
  await sh(['git', 'add', '-A']);
  const staged = await sh(['git', 'diff', '--cached', '--quiet']);
  if (staged.code === 0) return null;
  const message = [
    subject,
    '',
    `Plan ${id}. See plans/execution/${id}.md.`,
    '',
    'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  ].join('\n');
  const committed = await sh(['git', 'commit', '-m', message]);
  if (committed.code !== 0) {
    console.log(`      commit failed: ${committed.out.slice(0, 300)}`);
    return null;
  }
  return (await sh(['git', 'rev-parse', '--short', 'HEAD'])).out.trim();
}

/** Fails fast on a CLI that cannot run, instead of burning the whole queue on it. */
async function preflight(): Promise<void> {
  const probe = await sh(['claude', '-p', 'OK', '--tools', '', '--output-format', 'json']);
  let payload: { is_error?: boolean; result?: string } = {};
  try {
    payload = JSON.parse(probe.out) as typeof payload;
  } catch {
    throw new Error(`the claude CLI did not return JSON:\n${probe.out.slice(0, 300)}`);
  }
  if (probe.code !== 0 || payload.is_error)
    throw new Error(`the claude CLI cannot run headless: ${payload.result ?? probe.out}`);
}

const queue = selectQueue();
const resolved: { id: string; file: string }[] = [];
for (const id of queue) {
  const file = await planPath(id);
  if (!file) throw new Error(`no plan file found for ${id}`);
  resolved.push({ id, file });
}

console.log(`Queue (${resolved.length}): ${resolved.map((plan) => plan.id).join(' → ')}`);
console.log(`Model ${model} · budget $${budget}/plan · permissions ${permissionMode}`);
console.log(`Commit per plan: ${shouldCommit ? 'yes (never pushed)' : 'no'}`);
if (dryRun) process.exit(0);

if (shouldCommit) {
  const dirty = await sh(['git', 'status', '--porcelain']);
  if (dirty.out.length > 0)
    throw new Error(
      'the worktree is not clean; commit or stash first, or pass --no-commit. ' +
        'Otherwise the first plan commit would swallow your current changes.',
    );
  const branch = flags.get('branch');
  if (branch) {
    const switched = await sh(['git', 'switch', branch]);
    if (switched.code !== 0) await sh(['git', 'switch', '-c', branch]);
    console.log(`Branch: ${(await sh(['git', 'branch', '--show-current'])).out.trim()}`);
  }
}

if (!bare.has('yes')) {
  console.log('\nEach session runs unattended with elevated permissions. Continue? [y/N]');
  const answer = (await Bun.stdin.text()).trim().toLowerCase();
  if (answer !== 'y' && answer !== 'yes') process.exit(1);
}

await preflight();
await sh(['mkdir', '-p', LOG_DIR]);

const records: RunRecord[] = [];
const history: string[] = [];
for (const [index, plan] of resolved.entries()) {
  console.log(`\n── [${index + 1}/${resolved.length}] plan ${plan.id} ──────────────`);
  const record = await runPlan(plan.id, plan.file, history);
  if (shouldCommit && !STOP_STATUSES.has(record.status)) record.commit = await commitPlan(plan.id);
  records.push(record);
  history.push(`${plan.id} (${record.status})`);
  await Bun.write(`${ENTRY_DIR}/${plan.id}.run.json`, `${JSON.stringify(record, null, 2)}\n`);
  const minutes = (record.durationMs / 60_000).toFixed(1);
  const commitNote = record.commit ? ` · ${record.commit}` : '';
  console.log(`   ${record.status} · ${minutes} min · $${record.costUsd.toFixed(2)}${commitNote}`);
  if (STOP_STATUSES.has(record.status) && !keepGoing) {
    console.log(`\nStopped at plan ${plan.id} (${record.status}). Pass --keep-going to continue.`);
    break;
  }
}

const spent = records.reduce((total, record) => total + record.costUsd, 0);
console.log(`\nRan ${records.length} plan(s) · $${spent.toFixed(2)} total`);
await sh(['bun', 'scripts/execution-report.ts']);
console.log(`Report: ${ENTRY_DIR}/report.html`);
