// Radar, donut and stacked bars (hand-written SVG).
import { svg } from '../dom';

export function radarChart(axes: { label: string; value: number; color?: string }[], size = 220, labels = true): SVGElement {
  const pad = labels ? 34 : 6;
  const s = svg('svg', { viewBox: `0 0 ${size + 2 * pad} ${size + 2 * pad}`, width: '100%', class: 'radar' });
  const cx = size / 2 + pad, cy = size / 2 + pad, R = size / 2;
  const n = axes.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  for (const f of [0.25, 0.5, 0.75, 1]) {
    s.append(svg('polygon', { points: axes.map((_, i) => pt(i, R * f).join(',')).join(' '), fill: 'none', stroke: 'var(--line)', 'stroke-width': 1 }));
  }
  axes.forEach((a, i) => {
    const [x, y] = pt(i, R);
    s.append(svg('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'var(--line)' }));
    if (labels) {
      const [lx, ly] = pt(i, R + 16);
      s.append(svg('text', { x: lx, y: ly + 3, 'text-anchor': 'middle', fill: a.color ? `var(${a.color})` : 'var(--fg-faint)' }, a.label));
    }
  });
  const poly = axes.map((a, i) => pt(i, R * Math.max(0.02, Math.min(1, a.value))).join(',')).join(' ');
  s.append(svg('polygon', { points: poly, fill: 'rgba(255,176,0,0.18)', stroke: 'var(--accent)', 'stroke-width': 1.5 }));
  return s;
}

export function donut(parts: { label: string; value: number; color: string }[], size = 140): SVGElement {
  const s = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = size / 2 - 10, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  s.append(svg('circle', { cx, cy, r, fill: 'none', stroke: 'var(--bg-3)', 'stroke-width': 14 }));
  let off = 0;
  if (total > 0) {
    for (const p of parts) {
      if (p.value <= 0) continue;
      const len = (p.value / total) * C;
      const c = svg('circle', { cx, cy, r, fill: 'none', stroke: p.color, 'stroke-width': 14, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${cx} ${cy})` });
      c.append(svg('title', {}, `${p.label}: ${p.value}`));
      s.append(c);
      off += len;
    }
  }
  s.append(svg('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', fill: 'var(--fg)', 'font-size': 14 }, String(total)));
  return s;
}

export function stackedBar(segments: { label: string; value: number; color: string }[], width = 320, height = 14): SVGElement {
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, preserveAspectRatio: 'none' });
  const total = segments.reduce((a, p) => a + p.value, 0) || 1;
  let x = 0;
  for (const seg of segments) {
    const w = (seg.value / total) * width;
    const r = svg('rect', { x, y: 0, width: Math.max(0, w - 1), height, fill: seg.color });
    r.append(svg('title', {}, `${seg.label}: ${(seg.value / 1000).toFixed(1)} s`));
    s.append(r);
    x += w;
  }
  return s;
}
