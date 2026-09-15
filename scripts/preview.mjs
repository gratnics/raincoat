// 監査用の確認HTML（preview/index.html）を生成する。依存パッケージなしで動く。
// 各アイコンを 14/16/18/24/48/64px、ライト/ダーク、線画/塗りつぶしで並べる。
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sizes = [14, 16, 18, 24, 48, 64];
const weights = ['line', 'fill'];

async function load(weight) {
  const dir = join(root, 'icons', weight);
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.svg'));
  const map = new Map();
  for (const f of files) map.set(f.slice(0, -4), (await readFile(join(dir, f), 'utf8')).trim());
  return map;
}

const sets = Object.fromEntries(await Promise.all(weights.map(async (w) => [w, await load(w)])));
const names = [...new Set(weights.flatMap((w) => [...sets[w].keys()]))].sort();

// sets.json の作業セットごとに区切って並べる。どのセットにも無い名前は「その他」にまとめる。
const batches = Object.entries(JSON.parse(await readFile(join(root, 'sets.json'), 'utf8')))
  .map(([id, list]) => [`セット ${id}`, list.filter((n) => names.includes(n))]);
const listed = new Set(batches.flatMap(([, list]) => list));
const rest = names.filter((n) => !listed.has(n));
if (rest.length) batches.push(['その他', rest]);

const sized = (svg, size) => svg.replace('<svg ', `<svg width="${size}" height="${size}" `);

function cells(name, weight) {
  const svg = sets[weight].get(name);
  if (!svg) return sizes.map(() => '<td class="none">–</td>').join('');
  return sizes.map((s) => `<td>${sized(svg, s)}</td>`).join('');
}

// 半透明の色で描く列。要素どうしが重なる部分だけ濃くならないかを確認する。
const alphaSizes = [18, 48];

function alphaCells(name) {
  return weights
    .map((w) => {
      const svg = sets[w].get(name);
      if (!svg) return alphaSizes.map(() => '<td class="none">–</td>').join('');
      return alphaSizes.map((s) => `<td class="alpha">${sized(svg, s)}</td>`).join('');
    })
    .join('');
}

function table(theme) {
  const head =
    weights.map((w) => sizes.map((s) => `<th>${w}<br>${s}</th>`).join('')).join('<th class="sep"></th>') +
    '<th class="sep"></th>' +
    weights.map((w) => alphaSizes.map((s) => `<th>${w} α<br>${s}</th>`).join('')).join('');
  const span = (sizes.length + alphaSizes.length) * weights.length + 3;
  const bodies = batches
    .map(([label, list]) => {
      const rows = list
        .map((n) => `<tr><th class="name">${n}</th>${cells(n, 'line')}<td class="sep"></td>${cells(n, 'fill')}<td class="sep"></td>${alphaCells(n)}</tr>`)
        .join('\n');
      return `<tbody><tr class="batch"><th colspan="${span}">${label}（${list.length}）</th></tr>${rows}</tbody>`;
    })
    .join('\n');
  return `<section class="${theme}"><h2>${theme}</h2><div class="scroll"><table>
<thead><tr><th></th>${head}</tr></thead>${bodies}</table></div></section>`;
}

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>Raincoat Preview</title>
<style>
  body { margin: 0; padding: 24px; font: 13px/1.4 system-ui, sans-serif; background: #e9e9ec; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  section { border-radius: 12px; padding: 16px; margin-bottom: 24px; }
  section.light { background: #ffffff; color: #1f2328; }
  section.dark { background: #1c1d21; color: #e6e7ea; }
  h2 { font-size: 14px; margin: 0 0 8px; text-transform: uppercase; opacity: .6; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; }
  th, td { padding: 6px 10px; text-align: center; vertical-align: middle; }
  thead th { font-weight: 500; font-size: 11px; opacity: .55; }
  th.name { text-align: left; font-weight: 500; font-family: ui-monospace, monospace; white-space: nowrap; }
  tbody tr + tr { border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
  td.sep, th.sep { width: 16px; border-left: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
  td.none { opacity: .25; }
  section.light td.alpha { color: rgba(20, 20, 20, 0.35); }
  section.dark td.alpha { color: rgba(228, 232, 237, 0.35); }
  tr.batch th { text-align: left; font-size: 12px; font-weight: 600; padding-top: 20px;
    border-bottom: 2px solid color-mix(in srgb, currentColor 30%, transparent); }
  svg { display: block; margin: auto; }
</style></head><body>
<h1>Raincoat —${names.length} names (line ${sets.line.size} / fill ${sets.fill.size})</h1>
${table('light')}
${table('dark')}
</body></html>
`;

await mkdir(join(root, 'preview'), { recursive: true });
await writeFile(join(root, 'preview', 'index.html'), html);
console.log(`preview/index.html: ${names.length} names`);
