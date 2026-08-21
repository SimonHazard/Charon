#!/usr/bin/env bun
/**
 * Renders `plans/execution/*.md` into one self-contained HTML report.
 *
 * Deterministic on purpose: no model runs here, so the report can only contain
 * what the executing sessions actually wrote.
 *
 * Usage: bun scripts/execution-report.ts [--out <path>]
 */
import { readdir } from 'node:fs/promises';

const ENTRY_DIR = 'plans/execution';
const STATUS_LABELS: Record<string, string> = {
  done: 'Fait',
  partial: 'Partiel',
  blocked: 'Bloqué',
  'awaiting-operator': 'Attend toi',
  failed: 'Échoué',
};

type Entry = {
  id: string;
  title: string;
  status: string;
  sections: Map<string, string[]>;
  run: { costUsd: number; durationMs: number; commit: string | null } | null;
};

function frontmatter(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  const block = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  for (const line of block?.[1]?.split('\n') ?? []) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, '');
    fields.set(line.slice(0, separator).trim(), value);
  }
  return fields;
}

function sectionsOf(text: string): Map<string, string[]> {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '');
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of body.split('\n')) {
    const heading = /^##\s+(.*)$/u.exec(line.trim());
    if (heading?.[1]) {
      current = heading[1].trim();
      sections.set(current, []);
      continue;
    }
    if (!current) continue;
    const item = line.trim();
    const bullets = sections.get(current);
    if (!bullets) continue;
    if (item.startsWith('- ')) {
      bullets.push(item.slice(2).trim());
      continue;
    }
    // A wrapped bullet: fold the continuation line back into the bullet above it.
    if (item.length > 0 && bullets.length > 0)
      bullets[bullets.length - 1] = `${bullets.at(-1)} ${item}`;
  }
  return sections;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
}

async function loadEntries(): Promise<Entry[]> {
  const files = (await readdir(ENTRY_DIR)).filter(
    (name) => name.endsWith('.md') && name !== 'README.md',
  );
  const entries: Entry[] = [];
  for (const file of files.sort()) {
    const text = await Bun.file(`${ENTRY_DIR}/${file}`).text();
    const fields = frontmatter(text);
    const id = fields.get('plan') ?? file.replace('.md', '');
    const runFile = Bun.file(`${ENTRY_DIR}/${id}.run.json`);
    const run = (await runFile.exists()) ? await runFile.json() : null;
    entries.push({
      id,
      title: fields.get('title') ?? '(sans titre)',
      status: fields.get('status') ?? 'failed',
      sections: sectionsOf(text),
      run: run
        ? { costUsd: run.costUsd ?? 0, durationMs: run.durationMs ?? 0, commit: run.commit ?? null }
        : null,
    });
  }
  return entries;
}

function groupedList(entries: Entry[], section: string, empty: string): string {
  const blocks = entries
    .filter((entry) => (entry.sections.get(section) ?? []).some((item) => item !== 'Rien.'))
    .map((entry) => {
      const items = (entry.sections.get(section) ?? [])
        .filter((item) => item !== 'Rien.')
        .map((item) => `<li>${inline(item)}</li>`)
        .join('');
      return `<div class="group"><h3><span class="tag">${entry.id}</span> ${escapeHtml(
        entry.title,
      )}</h3><ul>${items}</ul></div>`;
    });
  return blocks.length > 0 ? blocks.join('') : `<p class="empty">${empty}</p>`;
}

function summaryTable(entries: Entry[]): string {
  const rows = entries
    .map((entry) => {
      const minutes = entry.run ? `${(entry.run.durationMs / 60_000).toFixed(0)} min` : '—';
      const cost = entry.run ? `$${entry.run.costUsd.toFixed(2)}` : '—';
      const commit = entry.run?.commit ? `<code>${escapeHtml(entry.run.commit)}</code>` : '—';
      return `<tr><td><span class="tag">${entry.id}</span></td><td>${escapeHtml(
        entry.title,
      )}</td><td><span class="status status-${entry.status}">${
        STATUS_LABELS[entry.status] ?? entry.status
      }</span></td><td>${commit}</td><td>${minutes}</td><td>${cost}</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>Plan</th><th>Ce qui a été fait</th><th>Statut</th><th>Commit</th><th>Durée</th><th>Coût</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const entries = await loadEntries();
const outIndex = Bun.argv.indexOf('--out');
const outPath = outIndex > 0 ? Bun.argv[outIndex + 1] : `${ENTRY_DIR}/report.html`;
if (!outPath) throw new Error('--out needs a path');

const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
const totalCost = entries.reduce((total, entry) => total + (entry.run?.costUsd ?? 0), 0);
const questionCount = entries.reduce(
  (total, entry) =>
    total + (entry.sections.get('Questions') ?? []).filter((item) => item !== 'Rien.').length,
  0,
);
const doneCount = entries.filter((entry) => entry.status === 'done').length;

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Charon — exécution des plans</title>
<style>
:root {
  --bg: #fdfcfa; --panel: #ffffff; --ink: #1c1b19; --muted: #6b6862;
  --line: #e6e2db; --accent: #7a5c2e;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #161513; --panel: #1e1d1a; --ink: #eceae5;
          --muted: #9d9a93; --line: #2e2c28; --accent: #d8b878; }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 2.5rem 1.25rem 6rem; background: var(--bg); color: var(--ink);
  font: 16px/1.6 ui-sans-serif, -apple-system, 'Segoe UI', sans-serif; }
main { max-width: 62rem; margin: 0 auto; }
h1 { font-size: 1.9rem; margin: 0 0 .25rem; letter-spacing: -.02em; }
h2 { font-size: 1.25rem; margin: 3rem 0 1rem; padding-bottom: .5rem;
  border-bottom: 1px solid var(--line); }
h3 { font-size: .95rem; margin: 1.5rem 0 .4rem; font-weight: 600; }
p.lede { color: var(--muted); margin: 0 0 2rem; }
ul { margin: .25rem 0 0; padding-left: 1.1rem; }
li { margin: .3rem 0; }
code { font: .85em ui-monospace, SFMono-Regular, Menlo, monospace;
  background: color-mix(in srgb, var(--line) 60%, transparent); padding: .1em .35em;
  border-radius: 4px; }
.cards { display: flex; flex-wrap: wrap; gap: .75rem; margin-bottom: 1rem; }
.card { flex: 1 1 8rem; background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; padding: .85rem 1rem; }
.card b { display: block; font-size: 1.5rem; line-height: 1.2; }
.card span { color: var(--muted); font-size: .8rem; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th, td { text-align: left; padding: .6rem .5rem; border-bottom: 1px solid var(--line);
  vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: .78rem; text-transform: uppercase;
  letter-spacing: .04em; }
.tag { font: .78rem ui-monospace, Menlo, monospace; color: var(--accent); }
.status { font-size: .78rem; padding: .1rem .45rem; border-radius: 999px;
  border: 1px solid var(--line); white-space: nowrap; }
.status-done { border-color: #4a7c59; color: #4a7c59; }
.status-partial, .status-awaiting-operator { border-color: #9a7326; color: #9a7326; }
.status-blocked, .status-failed { border-color: #a4453a; color: #a4453a; }
.group { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: .5rem 1rem 1rem; margin-bottom: .75rem; }
.empty { color: var(--muted); font-style: italic; }
footer { max-width: 62rem; margin: 4rem auto 0; color: var(--muted); font-size: .8rem; }
</style>
</head>
<body>
<main>
<h1>Charon — exécution des plans</h1>
<p class="lede">Généré le ${generatedAt} · un contexte neuf par plan · rien ici n'a été poussé.</p>

<div class="cards">
  <div class="card"><b>${entries.length}</b><span>plans lancés</span></div>
  <div class="card"><b>${doneCount}</b><span>terminés</span></div>
  <div class="card"><b>${questionCount}</b><span>questions pour toi</span></div>
  <div class="card"><b>$${totalCost.toFixed(2)}</b><span>coût total</span></div>
</div>
<div class="scroll">${summaryTable(entries)}</div>

<h2>Décisions prises</h2>
${groupedList(entries, 'Décisions', 'Aucune décision notée.')}

<h2>Changements</h2>
${groupedList(entries, 'Fait', 'Aucun changement noté.')}

<h2>Dérives par rapport aux plans</h2>
${groupedList(entries, 'Dérives', 'Aucune dérive notée.')}

<h2>Reste à faire</h2>
${groupedList(entries, 'Reste à faire', 'Rien en attente.')}

<h2>Questions à répondre</h2>
${groupedList(entries, 'Questions', 'Aucune question.')}

<h2>Vérifications lancées</h2>
${groupedList(entries, 'Vérifications', 'Aucune vérification notée.')}
</main>
<footer>Source : plans/execution/*.md · logs bruts : plans/execution/logs/*.jsonl</footer>
</body>
</html>
`;

await Bun.write(outPath, html);
console.log(`report written to ${outPath} (${entries.length} entries)`);
