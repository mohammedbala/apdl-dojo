// #/flashcards — Describe→Command (typed) and Command→Meaning (4-choice), Leitner scheduling.
import type { RouteCtx } from '../app/router';
import { COMMAND_INFO, GLOSSARY, COMMANDS } from '../content/commands';
import { buildQueue, review, newCard, MAX_NEW_PER_DAY, INTERVALS, isMastered } from '../game/leitner';
import { flashReviewXp, rollCaps, markActive } from '../game/progress';
import { evaluateAchievements } from '../game/achievements';
import { isoDate } from '../game/streak';
import { createRng } from '../game/rng';
import { resolveCommandName } from '../engine';
import { getSave, updateSave } from '../app/persist';
import { hotkeys } from '../app/hotkeys';
import { play } from '../app/sfx';
import { clear, h } from '../ui/dom';
import { achievementToast } from '../ui/components/toast';
import { pageHead } from './common';

export const CARD_IDS: string[] = GLOSSARY.flatMap((n) => [`d2c:${n}`, `c2m:${n}`]);

function boxCounts(): number[] {
  const cards = getSave().drills.cards;
  const counts = [0, 0, 0, 0, 0, 0];
  for (const id of CARD_IDS) if (cards[id]) counts[cards[id].box]++;
  return counts;
}

export function flashcardsPage({ root }: RouteCtx) {
  const today = isoDate();
  const rng = createRng(Date.now() >>> 0);
  root.appendChild(pageHead('Flashcards', `${GLOSSARY.length} glossary commands × 2 directions. Leitner boxes, intervals ${INTERVALS.join(' / ')} days; box 5 = mastered.`));
  const stage = h('div', { class: 'drill-stage', style: 'margin-top:0' });
  root.appendChild(stage);
  const save = getSave();
  const caps = save.dailyCaps.date === today ? save.dailyCaps : { newCards: 0 };
  const queue = buildQueue(CARD_IDS, save.drills.cards, today, MAX_NEW_PER_DAY - caps.newCards);
  let i = 0;
  let reviewed = 0;
  let correctN = 0;
  let answered = false;
  let cleanupKeys: (() => void) | null = null;

  const summary = () => {
    cleanupKeys?.();
    clear(stage);
    const counts = boxCounts();
    stage.append(
      h('div', { class: 'card' },
        h('h2', null, queue.length ? 'Session complete' : 'Nothing due'),
        h('p', { class: 'muted' }, queue.length ? `${reviewed} reviews · ${correctN} correct.` : 'No cards are due and today\'s new-card allowance is used. Come back tomorrow, or drill commands instead.'),
        h('div', { class: 'grid c3', style: 'grid-template-columns:repeat(6,1fr);margin-top:12px' }, ...counts.map((n, b) => h('div', { class: 'card', style: 'padding:8px' }, h('div', { class: 'kicker' }, b === 5 ? 'Mastered' : `Box ${b}`), h('div', { class: 'big-num', style: 'font-size:22px' }, String(n))))),
        h('p', { class: 'faint small', style: 'margin-top:12px' }, `${CARD_IDS.length - counts.reduce((a, b) => a + b, 0)} cards not seen yet (max ${MAX_NEW_PER_DAY} new per day).`),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/drills' }, 'Command drills'), h('a', { class: 'btn ghost', href: '#/' }, 'Home')),
      ),
    );
  };

  const grade = (id: string, isNew: boolean, ok: boolean) => {
    reviewed++;
    if (ok) correctN++;
    play(ok ? 'ok' : 'err');
    const unlocked = [] as ReturnType<typeof evaluateAchievements>;
    updateSave((s) => {
      const c = s.drills.cards[id] ?? newCard(today);
      s.drills.cards[id] = review(c, ok, today);
      const capsNow = rollCaps(s, today);
      if (isNew) capsNow.newCards++;
      flashReviewXp(s, today);
      if (capsNow.flashcard >= 10) markActive(s, today);
      unlocked.push(...evaluateAchievements(s, { kind: 'flashcard' }));
    });
    unlocked.forEach((a) => achievementToast(a.title, a.desc));
  };

  const show = () => {
    cleanupKeys?.();
    cleanupKeys = null;
    if (i >= queue.length) return summary();
    answered = false;
    const { id, isNew } = queue[i];
    const [mode, name] = [id.slice(0, 3), id.slice(4)];
    const info = COMMAND_INFO.get(name)!;
    clear(stage);
    const head = h('div', { class: 'drill-meta' }, h('span', null, h('b', null, `${i + 1}/${queue.length}`)), h('span', null, isNew ? 'new card' : `box ${getSave().drills.cards[id]?.box ?? 0}`), h('span', null, mode === 'd2c' ? 'Describe → Command' : 'Command → Meaning'));
    const fb = h('div', { class: 'drill-feedback' });
    const next = () => { i++; show(); };
    if (mode === 'd2c') {
      const input = h('input', { class: 'type-input', style: 'position:static;color:var(--fg);font-size:24px;padding:8px 0;border-bottom:1px solid var(--line-2)', autocomplete: 'off', spellcheck: false, placeholder: 'command name' }) as HTMLInputElement;
      stage.append(head, h('div', { class: 'drill-prompt' }, h('span', { class: 'fam' }, info.family), info.summary), input, fb, h('div', { class: 'drill-keys' }, h('span', null, h('kbd', null, 'Enter'), ' check / next')));
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (answered) return next();
        const typed = input.value.trim().split(/[,\s$]/)[0].toUpperCase();
        if (!typed) return;
        const ok = typed === name || resolveCommandName(typed) === name;
        answered = true;
        grade(id, isNew, ok);
        clear(fb);
        fb.append(h('div', null, h('span', { class: ok ? 'ok' : 'err' }, ok ? '✓ ' : '✗ '), h('span', { class: 'ans' }, info.signature)), info.abbrev ? h('div', { class: 'faint small' }, `abbreviation ${info.abbrev}`) : '');
      });
      input.focus();
    } else {
      const pool = COMMANDS.filter((c) => c.name !== name && c.summary !== info.summary);
      const same = pool.filter((c) => c.family === info.family);
      const opts = new Set<string>([info.summary]);
      let guard = 0;
      while (opts.size < 4 && guard++ < 50) opts.add(rng.pick(same.length >= 3 && guard < 20 ? same : pool).summary);
      const choices = [...opts].sort(() => rng.next() - 0.5);
      const list = h('div', { class: 'choice-list' });
      const pick = (k: number) => {
        if (answered) return next();
        answered = true;
        const ok = choices[k] === info.summary;
        grade(id, isNew, ok);
        [...list.children].forEach((b, j) => {
          if (choices[j] === info.summary) b.classList.add('right');
          else if (j === k) b.classList.add('wrong');
        });
        clear(fb);
        fb.append(h('div', { class: 'faint small' }, 'Enter / any number for the next card.'));
      };
      choices.forEach((c, k) => list.appendChild(h('button', { onclick: () => pick(k) }, h('kbd', null, String(k + 1)), ' ', c)));
      stage.append(head, h('div', { class: 'drill-prompt' }, h('span', { class: 'fam' }, info.family), h('span', { class: 'accent' }, info.signature)), list, fb);
      cleanupKeys = hotkeys({
        '1': () => pick(0), '2': () => pick(1), '3': () => pick(2), '4': () => pick(3),
        enter: () => { if (answered) next(); },
      }, { inInputs: false });
    }
  };
  show();
  return () => cleanupKeys?.();
}

export function masteredCount(): number {
  const cards = getSave().drills.cards;
  return CARD_IDS.filter((id) => cards[id] && isMastered(cards[id])).length;
}
