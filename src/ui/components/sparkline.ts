// Hand-written SVG sparkline / line chart.
import { svg } from '../dom';

export function sparkline(values: number[], opts: { width?: number; height?: number; color?: string; dots?: boolean; min?: number } = {}): SVGElement {
  const w = opts.width ?? 240;
  const ht = opts.height ?? 48;
  const s = svg('svg', { viewBox: `0 0 ${w} ${ht}`, width: w, height: ht, class: 'spark', preserveAspectRatio: 'none' });
  if (values.length === 0) {
    s.append(svg('line', { x1: 0, y1: ht - 1, x2: w, y2: ht - 1, stroke: 'var(--line)', 'stroke-dasharray': '3 3' }));
    return s;
  }
  const lo = opts.min ?? Math.min(...values);
  const hi = Math.max(...values, lo + 1e-9);
  const pad = 3;
  const x = (i: number) => (values.length === 1 ? w / 2 : pad + (i / (values.length - 1)) * (w - 2 * pad));
  const y = (v: number) => ht - pad - ((v - lo) / (hi - lo)) * (ht - 2 * pad);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  s.append(svg('path', { d, fill: 'none', stroke: opts.color ?? 'var(--accent)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
  if (opts.dots !== false) {
    const i = values.length - 1;
    s.append(svg('circle', { cx: x(i), cy: y(values[i]), r: 2.5, fill: opts.color ?? 'var(--accent)' }));
  }
  return s;
}

/** Line chart with axes and labels. */
export function lineChart(points: { x: number; y: number; label?: string }[], opts: { width?: number; height?: number; yLabel?: (v: number) => string; xLabel?: (v: number) => string; color?: string } = {}): SVGElement {
  const w = opts.width ?? 560;
  const ht = opts.height ?? 160;
  const ml = 40, mb = 20, mt = 8, mr = 8;
  const s = svg('svg', { viewBox: `0 0 ${w} ${ht}`, width: '100%' });
  if (points.length === 0) {
    s.append(svg('text', { x: w / 2, y: ht / 2, 'text-anchor': 'middle' }, 'No data yet'));
    return s;
  }
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
  const y0 = Math.min(0, ...ys), y1 = Math.max(...ys, y0 + 1);
  const X = (v: number) => ml + ((v - x0) / (x1 - x0)) * (w - ml - mr);
  const Y = (v: number) => ht - mb - ((v - y0) / (y1 - y0)) * (ht - mb - mt);
  s.append(svg('line', { x1: ml, y1: ht - mb, x2: w - mr, y2: ht - mb, class: 'axis' }));
  s.append(svg('line', { x1: ml, y1: mt, x2: ml, y2: ht - mb, class: 'axis' }));
  for (const v of [y0, (y0 + y1) / 2, y1]) {
    s.append(svg('text', { x: ml - 4, y: Y(v) + 3, 'text-anchor': 'end' }, opts.yLabel ? opts.yLabel(v) : String(Math.round(v))));
    s.append(svg('line', { x1: ml, y1: Y(v), x2: w - mr, y2: Y(v), stroke: 'var(--line)', 'stroke-dasharray': '2 4' }));
  }
  if (opts.xLabel) {
    s.append(svg('text', { x: ml, y: ht - 4, 'text-anchor': 'start' }, opts.xLabel(x0)));
    s.append(svg('text', { x: w - mr, y: ht - 4, 'text-anchor': 'end' }, opts.xLabel(x1)));
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  s.append(svg('path', { d, fill: 'none', stroke: opts.color ?? 'var(--accent)', 'stroke-width': 1.5 }));
  for (const p of points) {
    const c = svg('circle', { cx: X(p.x), cy: Y(p.y), r: 2.5, fill: opts.color ?? 'var(--accent)' });
    if (p.label) c.append(svg('title', {}, p.label));
    s.append(c);
  }
  return s;
}
