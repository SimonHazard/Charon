import { readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const desktopAssets = 'apps/desktop/dist/assets';
const files = await readdir(desktopAssets);
const scripts = files.filter((file) => file.endsWith('.js'));
let gzipBytes = 0;
for (const script of scripts)
  gzipBytes += gzipSync(await Bun.file(`${desktopAssets}/${script}`).bytes()).byteLength;
const desktopBudget = 230 * 1024;
if (gzipBytes > desktopBudget)
  throw new Error(`desktop JS gzip ${gzipBytes} exceeds ${desktopBudget}`);

const notes = Array.from({ length: 20_000 }, (_, index) => ({
  body: `Synthetic note ${index} agent handoff`,
  tags: index % 7 === 0 ? ['Research'] : [],
  attachments: index % 11 === 0 ? [{ fileName: `brief-${index}.pdf` }] : [],
}));
const samples: number[] = [];
for (let run = 0; run < 9; run += 1) {
  const start = performance.now();
  notes.filter((note) =>
    `${note.body} ${note.tags.join(' ')} ${note.attachments.map((item) => item.fileName).join(' ')}`
      .toLocaleLowerCase()
      .includes('brief-19998'),
  );
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const median = samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
if (median >= 50) throw new Error(`20k search median ${median.toFixed(1)}ms exceeds 50ms`);
console.log(
  JSON.stringify({ desktopJsGzipBytes: gzipBytes, search20kMedianMs: Number(median.toFixed(2)) }),
);
