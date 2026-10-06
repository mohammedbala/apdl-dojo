// Grading checklist grouped by stage; rows flash when they flip to pass.
import type { CheckResult, Score, Stage } from '../../grader/types';
import { STAGES, STAGE_LABEL } from '../../game/splits';
import { clear, h } from '../dom';

export class Checklist {
  el: HTMLElement;
  private prev = new Map<string, boolean>();

  constructor() {
    this.el = h('div', { class: 'checklist' }, h('div', { class: 'faint' }, 'Run your script (Ctrl+Enter) to see the checklist.'));
  }

  update(score: Score | null, note?: string): void {
    clear(this.el);
    if (!score) {
      this.el.appendChild(h('div', { class: 'faint' }, note ?? 'No score yet.'));
      return;
    }
    const byStage = new Map<Stage, CheckResult[]>();
    for (const c of score.checks) {
      const list = byStage.get(c.stage) ?? [];
      list.push(c);
      byStage.set(c.stage, list);
    }
    for (const st of STAGES) {
      const checks = byStage.get(st);
      const info = score.stages[st];
      if (!checks?.length && !info?.present) continue;
      this.el.appendChild(h('div', { class: `ck-stage ${info?.pass ? 'pass' : ''}` }, h('span', { class: 'dot' }), STAGE_LABEL[st], h('span', { class: 'spacer' }), info ? `${Math.round(info.score * 100)}%` : ''));
      for (const c of checks ?? []) {
        const was = this.prev.get(c.id);
        const row = h('div', { class: `ck-row ${c.pass ? 'pass' : ''}`, title: c.hint ?? '' },
          h('span', { class: 'mk' }, c.pass ? '✓' : '✗'),
          h('span', null, c.label),
          h('span', { class: 'ea' }, c.pass ? c.actual : `${c.actual} → ${c.expected}`),
        );
        if (c.pass && was === false) row.classList.add('flash');
        this.el.appendChild(row);
        this.prev.set(c.id, c.pass);
      }
    }
    if (note) this.el.appendChild(h('div', { class: 'faint', style: 'margin-top:6px' }, note));
  }

  reset(): void {
    this.prev.clear();
  }
}
