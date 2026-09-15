// 斜めに傾けたアイコンを、回転前の座標から計算して生成する（SVG に transform は使えないため）。
// 角度・中心・大きさを変えるときは下の icons の設定を書き換えて `node scripts/gen-rotated.mjs` を実行する。
//
// 要素は次のどちらかで書く（fill を付けると塗りになる。線の太さは 24 グリッドで 2、strokeWidth で要素ごとに変えられる）:
//   { d: [...コマンド] }       パス。コマンドは絶対座標: ['M', x, y] ['L', x, y] ['Q', x1, y1, x, y]
//                              ['C', x1, y1, x2, y2, x, y] ['A', r, large, sweep, x, y]（円弧のみ） ['Z']
//   { circle: [cx, cy, r] }    円
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Seirein の ThinkingUmbrellaIcon.tsx（viewBox 0 0 52 56）の縦向きの座標をそのまま使う
const UMBRELLA_CANOPY = [
  ['M', 24, 5],
  ['C', 14, 6, 5, 14, 3, 24],
  ['Q', 8, 19, 13.5, 24],
  ['Q', 19, 19, 24, 24],
  ['Q', 29, 19, 34.5, 24],
  ['Q', 40, 19, 45, 24],
  ['C', 43, 14, 34, 6, 24, 5],
  ['Z'],
];
const UMBRELLA_HANDLE = [['M', 24, 23.5], ['L', 24, 38], ['L', 24, 41], ['A', 5.5, 1, 1, 13, 41], ['L', 13, 38.5]];
const UMBRELLA_TIP = [24, 3.4, 1.8];
const UMBRELLA = { angle: 36, pivot: [24, 26], fit: 20, center: true }; // ロゴと同じ rotate(36 24 26)

// 縦向き（頭が上・針が下）の押しピン
const PIN_HEAD = [['M', 9.5, 3.5], ['L', 14.5, 3.5], ['L', 14.5, 9], ['L', 17.5, 13.5], ['L', 6.5, 13.5], ['L', 9.5, 9], ['Z']];
const PIN_NEEDLE = [['M', 12, 13.5], ['L', 12, 20.5]];
const PIN = {
  angle: 45, // 時計回り（度）。頭が右上・針が左下
  pivot: [12, 12], // 回転の中心
  scale: 1.15, // pivot を中心にした倍率
  center: true, // 回転後の外接矩形の中心を (12, 12) に合わせる
};

// 縦向き（頭が上・柄が下）のレンチ。頭は半径4.5の円に幅4・深さ3.5の口、柄は幅4で下端を丸める。
const WRENCH = [
  ['M', 10, 2.97],
  ['L', 10, 6.5],
  ['L', 14, 6.5],
  ['L', 14, 2.97],
  ['A', 4.5, 0, 1, 14, 11.03],
  ['L', 14, 19],
  ['A', 2, 0, 1, 10, 19],
  ['L', 10, 11.03],
  ['A', 4.5, 0, 1, 10, 2.97],
  ['Z'],
];
const TOOL = { angle: 45, pivot: [12, 12], fit: 18, center: true }; // 時計回り。頭が右上・柄が左下

const icons = [
  {
    file: 'icons/line/pin.svg',
    elements: [{ d: PIN_HEAD }, { d: PIN_NEEDLE }],
    ...PIN,
  },
  {
    // 塗りつぶし版: 頭を塗り（塗り＋太さ2の線で外形は線画と同じ）、針は太さ3の線。
    file: 'icons/fill/pin.svg',
    elements: [{ d: PIN_HEAD, fill: true }, { d: PIN_NEEDLE, strokeWidth: 3 }],
    ...PIN,
  },
  {
    file: 'icons/line/tool.svg',
    elements: [{ d: WRENCH }],
    ...TOOL,
  },
  {
    // 塗りつぶし版: レンチ全体を塗る（塗り＋太さ2の線で外形と口の切り欠きは線画と同じ）。
    file: 'icons/fill/tool.svg',
    elements: [{ d: WRENCH, fill: true }],
    ...TOOL,
  },
  {
    // 線画版: 布は輪郭線、先端の円は線だと点に潰れるので塗る。
    file: 'icons/line/umbrella.svg',
    elements: [
      { d: UMBRELLA_CANOPY },
      { circle: UMBRELLA_TIP, fill: true },
      { d: UMBRELLA_HANDLE },
    ],
    ...UMBRELLA,
  },
  {
    // 塗りつぶし版: ロゴと同じく布と先端を塗り、柄だけ線にする。
    // 布と先端にも線（太さ2）を重ねて、輪郭の丸みを他のアイコンと揃える。骨は塗りで隠れるので描かない。
    file: 'icons/fill/umbrella.svg',
    elements: [
      { d: UMBRELLA_CANOPY, fill: true },
      { circle: UMBRELLA_TIP, fill: true },
      { d: UMBRELLA_HANDLE },
    ],
    ...UMBRELLA,
  },
];
// fit: 回転後の外接矩形（線の中心で測る）の長い辺をこの長さに合わせる倍率を自動で決める
// scale: 倍率を直接指定する（fit と同時には使わない）

const points = (seg) => {
  const [cmd, ...v] = seg;
  if (cmd === 'A') return [[v[3], v[4]]];
  const out = [];
  for (let i = 0; i < v.length; i += 2) out.push([v[i], v[i + 1]]);
  return out;
};

// 点の変換 fn と半径の変換 radius を要素に適用する
function mapElement(el, fn, radius) {
  if (el.circle) {
    const [cx, cy, r] = el.circle;
    return { ...el, circle: [...fn([cx, cy]), radius(r)] };
  }
  const d = el.d.map((seg) => {
    const [cmd, ...v] = seg;
    if (cmd === 'Z') return seg;
    if (cmd === 'A') return ['A', radius(v[0]), v[1], v[2], ...fn([v[3], v[4]])];
    return [cmd, ...points(seg).flatMap(fn)];
  });
  return { ...el, d };
}

// 外接矩形を求めるため、曲線・円弧・円を細かく分けて点を取る
function sample(el) {
  const steps = 32;
  const out = [];
  if (el.circle) {
    const [cx, cy, r] = el.circle;
    for (let i = 0; i < steps; i++) {
      const a = (2 * Math.PI * i) / steps;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
  }
  let p = [0, 0];
  let start = p;
  for (const seg of el.d) {
    const [cmd, ...v] = seg;
    if (cmd === 'M') { p = start = [v[0], v[1]]; out.push(p); continue; }
    if (cmd === 'Z') { p = start; continue; }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      if (cmd === 'L') out.push([p[0] + (v[0] - p[0]) * t, p[1] + (v[1] - p[1]) * t]);
      if (cmd === 'Q') out.push([0, 1].map((k) => u * u * p[k] + 2 * u * t * v[k] + t * t * v[2 + k]));
      if (cmd === 'C') out.push([0, 1].map((k) => u ** 3 * p[k] + 3 * u * u * t * v[k] + 3 * u * t * t * v[2 + k] + t ** 3 * v[4 + k]));
    }
    if (cmd === 'A') {
      const [r0, large, sweep, x, y] = v;
      const hx = (p[0] - x) / 2, hy = (p[1] - y) / 2;
      const d2 = hx * hx + hy * hy;
      const r = Math.max(r0, Math.sqrt(d2));
      const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (r * r - d2) / d2));
      const cx = coef * hy + (p[0] + x) / 2, cy = -coef * hx + (p[1] + y) / 2;
      const a0 = Math.atan2(p[1] - cy, p[0] - cx);
      let da = Math.atan2(y - cy, x - cx) - a0;
      if (sweep && da < 0) da += 2 * Math.PI;
      if (!sweep && da > 0) da -= 2 * Math.PI;
      for (let i = 1; i <= steps; i++) {
        const a = a0 + (da * i) / steps;
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
    const pts = points(seg);
    p = pts[pts.length - 1];
  }
  return out;
}

const bbox = (elements) => {
  const all = elements.flatMap(sample);
  const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

const f = (v) => String(Math.round(v * 100) / 100);
const toD = (d) =>
  d.map(([cmd, ...v]) => (cmd === 'A' ? `A${f(v[0])} ${f(v[0])} 0 ${v[1]} ${v[2]} ${f(v[3])} ${f(v[4])}` : cmd + v.map(f).join(' '))).join('');
const toSVG = (el) => {
  const fill = (el.fill ? ' fill="currentColor"' : '') + (el.strokeWidth ? ` stroke-width="${el.strokeWidth}"` : '');
  if (el.circle) return `<circle cx="${f(el.circle[0])}" cy="${f(el.circle[1])}" r="${f(el.circle[2])}"${fill}/>`;
  return `<path d="${toD(el.d)}"${fill}/>`;
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const icon of icons) {
  const rad = (icon.angle * Math.PI) / 180;
  const [px, py] = icon.pivot;
  const rotate = ([x, y]) => {
    const dx = x - px, dy = y - py;
    return [px + dx * Math.cos(rad) - dy * Math.sin(rad), py + dx * Math.sin(rad) + dy * Math.cos(rad)];
  };
  let elements = icon.elements.map((el) => mapElement(el, rotate, (r) => r));

  let k = icon.scale ?? 1;
  if (icon.fit) {
    const b = bbox(elements);
    k = icon.fit / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  }
  elements = elements.map((el) => mapElement(el, ([x, y]) => [px + (x - px) * k, py + (y - py) * k], (r) => r * k));

  if (icon.center) {
    const b = bbox(elements);
    const ox = 12 - (b.minX + b.maxX) / 2, oy = 12 - (b.minY + b.maxY) / 2;
    elements = elements.map((el) => mapElement(el, ([x, y]) => [x + ox, y + oy], (r) => r));
  }

  // 線の太さは縮小後の 24 グリッドで 2（元の座標系の太さを倍率で縮めない）
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${elements.map(toSVG).join('')}</svg>\n`;
  await writeFile(join(root, icon.file), svg);
  const b = bbox(elements);
  console.log(`${icon.file}  scale ${f(k)}  x ${f(b.minX)}..${f(b.maxX)}  y ${f(b.minY)}..${f(b.maxY)}`);
}
