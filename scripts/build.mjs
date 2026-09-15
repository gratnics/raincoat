// icons/line/*.svg と icons/fill/*.svg から Iconify JSON パッケージ（dist/icons.json, dist/info.json）を生成する。
// アイコン名は "<name>-line" / "<name>-fill"（@iconify-json/mingcute と同じ命名）。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupSVG, importDirectory, isEmptyColor, parseColors, runSVGO } from '@iconify/tools';
import { getSVGOPlugins } from '@iconify/tools/lib/optimise/svgo';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prefix = 'raincoat';
const forbidden = /\b(transform|id|style)=|#[0-9a-f]{3,8}\b|rgb\(/i;

// 半透明の色で表示すると、別々の要素が重なる部分だけ2回塗られて濃くなる。
// 同じ属性の図形を1つの path にまとめるため、@iconify/tools の標準の設定から2つだけ変える。
// - convertShapeToPath: 円や楕円も path に変換する（convertArcs）
// - mergePaths: 線どうしが交差していてもまとめる（force）
// SVGO の convertShapeToPath は角丸の rect（rx つき）を変換しないので、先に同じ形の path に置き換える。
function roundedRectsToPaths(code) {
  return code.replace(/<rect\b([^>]*?)\/?>(?:<\/rect>)?/g, (_match, attrText) => {
    const attrs = {};
    for (const [, key, value] of attrText.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[key] = value;
    const x = Number(attrs.x ?? 0), y = Number(attrs.y ?? 0);
    const w = Number(attrs.width), h = Number(attrs.height);
    const rx = Math.min(Number(attrs.rx ?? attrs.ry ?? 0), w / 2);
    const ry = Math.min(Number(attrs.ry ?? attrs.rx ?? 0), h / 2);
    for (const key of ['x', 'y', 'width', 'height', 'rx', 'ry']) delete attrs[key];
    const arc = (ex, ey) => `A${rx} ${ry} 0 0 1 ${ex} ${ey}`;
    const d = rx > 0 && ry > 0
      ? `M${x + rx} ${y}H${x + w - rx}${arc(x + w, y + ry)}V${y + h - ry}${arc(x + w - rx, y + h)}H${x + rx}${arc(x, y + h - ry)}V${y + ry}${arc(x + rx, y)}Z`
      : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    const rest = Object.entries(attrs).map(([key, value]) => ` ${key}="${value}"`).join('');
    return `<path d="${d}"${rest}/>`;
  });
}

const svgoPlugins = getSVGOPlugins({}).map((plugin) => {
  const name = typeof plugin === 'string' ? plugin : plugin.name;
  if (name === 'convertShapeToPath') return { name, params: { convertArcs: true } };
  if (name === 'mergePaths') return { name, params: { force: true, noSpaceAfterFlags: true } };
  return plugin;
});

const iconSet = await importDirectory(join(root, 'icons'), {
  prefix,
  includeSubDirs: true,
  keyword: (file) => `${file.file}-${file.subdir.replace(/\/$/, '')}`,
});

const errors = [];
await iconSet.forEach(async (name, type) => {
  if (type !== 'icon') return;
  const svg = iconSet.toSVG(name);
  if (!svg) return;

  const source = svg.toMinifiedString();
  if (forbidden.test(source)) errors.push(`${name}: transform / id / style / 固定色は使えません`);
  if (svg.viewBox.left !== 0 || svg.viewBox.top !== 0 || svg.viewBox.width !== 24 || svg.viewBox.height !== 24) {
    errors.push(`${name}: viewBox は 0 0 24 24 にしてください`);
  }

  try {
    cleanupSVG(svg);
    parseColors(svg, {
      defaultColor: 'currentColor',
      callback: (_attr, colorStr, color) => (!color || isEmptyColor(color) ? colorStr : 'currentColor'),
    });
    svg.load(roundedRectsToPaths(svg.toString()));
    runSVGO(svg, { plugins: svgoPlugins });
  } catch (err) {
    errors.push(`${name}: ${err.message}`);
    iconSet.remove(name);
    return;
  }
  iconSet.fromSVG(name, svg);
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const icons = iconSet.export();
const names = Object.keys(icons.icons);
const info = {
  prefix,
  name: 'Raincoat',
  total: names.length,
  author: { name: 'Gratnics', url: 'https://github.com/gratnics/raincoat' },
  license: { title: 'Apache License 2.0', spdx: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  height: 24,
  category: 'General',
  palette: false,
};

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist', 'icons.json'), JSON.stringify(icons, null, 2) + '\n');
await writeFile(join(root, 'dist', 'info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`dist/icons.json: ${names.length} icons`);
