// icons/line/*.svg と icons/fill/*.svg から Iconify JSON パッケージ（dist/icons.json, dist/info.json）を生成する。
// アイコン名は "<name>-line" / "<name>-fill"（@iconify-json/mingcute と同じ命名）。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupSVG, importDirectory, isEmptyColor, parseColors, runSVGO } from '@iconify/tools';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prefix = 'raincoat';
const forbidden = /\b(transform|id|style)=|#[0-9a-f]{3,8}\b|rgb\(/i;

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
    runSVGO(svg);
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
