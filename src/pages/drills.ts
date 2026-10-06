// #/drills (setup + history) and #/drills/session (Monkeytype-style command drills + results).
import type { RouteCtx } from '../app/router';
import { drills, tracks } from '../content';
import { FAMILIES, getCommandInfo } from '../content/commands';
import type { DrillTemplate } from '../content/types';
import { canonEqual, strictEqual, abbrevStats } from '../game/canon';
import { createRng } from '../game/rng';
import { drillXp, drillParMs, type DrillItemResult } from '../game/xp';
import { recordCommandStat, recordDrillSession } from '../game/progress';
import { isoDate } from '../game/streak';
import { isDue } from '../game/leitner';
import { getSave, getSettings, updateSave, updateSettings } from '../app/persist';
import type { DrillSessionRecord } from '../app/schema';
import { hotkeys } from '../app/hotkeys';
import { navigate } from '../app/router';
import { play } from '../app/sfx';
import { clear, h, pct, fmtDate } from '../ui/dom';
import { sparkline } from '../ui/components/sparkline';
import { achievementToast } from '../ui/components/toast';
import { pbConfetti } from '../ui/confetti';
import { pageHead } from './common';

const FORMATS: [string, string][] = [['30c', '30 commands'], ['60c', '60 commands'], ['60s', '60 seconds'], ['120s', '120 seconds']];
const STRICT: [string, string, string][] = [
  ['relaxed', 'Relaxed', 'Canonical match: abbreviations, blank-zero fields and number formats accepted.'],
  ['strict', 'Strict', 'Exact text (case and spaces ignored).'],
  ['abbrev', 'Abbrev-only', 'Canonical match, and every command longer than 4 characters must be typed as its 4-char abbreviation.'],
];

export function templatesForSet(set: string): { list: DrillTemplate[]; label: string } {
  const s = getSave();
  const [kind, arg] = set.split(':');
  if (kind === 'track') return { list: drills.filter((d) => d.track === arg), label: tracks.find((t) => t.id === arg)?.title ?? arg };
  if (kind === 'family') return { list: drills.filter((d) => d.family === arg), label: FAMILIES.find((f) => f.id === arg)?.label ?? arg };
  if (kind === 'cmd') return { list: drills.filter((d) => d.command === arg), label: arg };
  if (kind === 'weak') {
    const weak = Object.entries(s.drills.commandStats)
      .filter(([, st]) => st.attempts >= 3)
      .sort(([, a], [, b]) => a.firstTry / a.attempts - b.firstTry / b.attempts || b.totalMs / b.attempts - a.totalMs / a.attempts)
      .slice(0, 8)
      .map(([c]) => c);
    const list = drills.filter((d) => weak.includes(d.command));
    return list.length ? { list, label: 'Weak spots' } : { list: drills, label: 'Weak spots (not enough data yet: all)' };
  }
  if (kind === 'due') {
    const today = isoDate();
    const due = Object.entries(s.drills.cards).filter(([, c]) => isDue(c, today)).map(([id]) => id.split(':').slice(1).join(':'));
    let list = drills.filter((d) => due.includes(d.command));
    if (!list.length) {
      const stale = new Set(drills.map((d) => d.command).filter((c) => !s.drills.commandStats[c] || Date.now() - s.drills.commandStats[c].lastAt > 3 * 86400000));
      list = drills.filter((d) => stale.has(d.command));
    }
    return list.length ? { list, label: 'Due' } : { list: drills, label: 'Due (nothing due: all)' };
  }
  return { list: drills, label: 'All commands' };
}

export function drillsPage({ root }: RouteCtx) {
  const st = getSettings();
  let set = st.drillSet;
  let format = st.drillFormat;
  let strict = st.drillStrict;
  root.appendChild(pageHead('Command drills', 'Read the prompt, type the command, Enter. Numbers change every time.'));
  const body = h('div');
  root.appendChild(body);
  const render = () => {
    clear(body);
    const setBtn = (id: string, label: string) => h('button', { class: `small ${set === id ? 'active' : ''}`, onclick: () => { set = id; render(); } }, label);
    const n = templatesForSet(set).list.length;
    body.append(
      h('div', { class: 'grid c2', style: 'margin-bottom:16px' },
        h('div', { class: 'card stack' },
          h('div', { class: 'kicker' }, 'Set'),
          h('div', { class: 'row' }, setBtn('all', 'All'), setBtn('weak', 'Weak spots'), setBtn('due', 'Due')),
          h('div', { class: 'row' }, ...FAMILIES.filter((f) => drills.some((d) => d.family === f.id)).map((f) => setBtn(`family:${f.id}`, f.label))),
          h('div', { class: 'row' }, ...tracks.filter((t) => drills.some((d) => d.track === t.id)).map((t) => setBtn(`track:${t.id}`, `${t.id.toUpperCase()} ${t.title}`))),
          h('div', { class: 'faint small' }, `${n} templates in this set.`),
        ),
        h('div', { class: 'card stack' },
          h('div', { class: 'kicker' }, 'Format'),
          h('div', { class: 'seg' }, ...FORMATS.map(([id, l]) => h('button', { class: format === id ? 'active' : '', onclick: () => { format = id; render(); } }, l))),
          h('div', { class: 'kicker', style: 'margin-top:8px' }, 'Strictness'),
          h('div', { class: 'seg' }, ...STRICT.map(([id, l]) => h('button', { class: strict === id ? 'active' : '', onclick: () => { strict = id; render(); } }, l))),
          h('div', { class: 'faint small' }, STRICT.find((s) => s[0] === strict)?.[2] ?? ''),
          h('div', { class: 'row', style: 'margin-top:8px' },
            h('button', { class: 'primary', onclick: () => { updateSettings({ drillSet: set, drillFormat: format, drillStrict: strict }); navigate(`#/drills/session?set=${encodeURIComponent(set)}&format=${format}&strict=${strict}`); } }, 'Start  ↵'),
            h('span', { class: 'faint small' }, 'Enter submit · Tab restart · Esc end')),
        ),
      ),
      history(),
    );
  };
  render();
  return hotkeys({ enter: () => { if ((document.activeElement as HTMLElement | null)?.tagName === 'BUTTON') return false; (body.querySelector('button.primary') as HTMLButtonElement)?.click(); } }, { inInputs: false });
}

function history(): HTMLElement {
  const sessions = getSave().drills.sessions.slice(-30);
  if (!sessions.length) return h('div', { class: 'empty' }, 'No drill sessions yet.');
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('div', { class: 'kicker' }, 'CPM — last 30 sessions'), h('span', { class: 'faint small' }, `best ${Math.max(...sessions.map((s) => s.cpm)).toFixed(1)} CPM`)),
    h('div', { class: 'chart' }, sparkline(sessions.map((s) => s.cpm), { width: 600, height: 60, min: 0 })),
    h('table', { class: 'tbl', style: 'margin-top:12px' },
      h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Set'), h('th', null, 'Format'), h('th', { class: 'r' }, 'Cmds'), h('th', { class: 'r' }, 'CPM'), h('th', { class: 'r' }, 'Accuracy'), h('th', { class: 'r' }, 'First try'), h('th', { class: 'r' }, 'XP'))),
      h('tbody', null, ...sessions.slice(-8).reverse().map((s) => h('tr', null, h('td', { class: 'faint' }, fmtDate(s.t)), h('td', null, s.set), h('td', null, `${s.format} · ${s.strict}`), h('td', { class: 'r' }, String(s.commands)), h('td', { class: 'r accent' }, s.cpm.toFixed(1)), h('td', { class: 'r' }, pct(s.accuracy)), h('td', { class: 'r' }, pct(s.firstTry)), h('td', { class: 'r' }, String(s.xp)))))),
  );
}

interface Item {
  tpl: DrillTemplate;
  prompt: string;
  answer: string;
  variants: string[];
  shownAt: number;
  wrong: boolean;
}

interface Done extends DrillItemResult {
  command: string;
}

export function drillSessionPage({ root, query }: RouteCtx) {
  const set = query.get('set') ?? 'all';
  const format = query.get('format') ?? '30c';
  const strict = query.get('strict') ?? 'relaxed';
  const { list, label } = templatesForSet(set);
  const goal = format.endsWith('c') ? Number(format.slice(0, -1)) : Infinity;
  const limitMs = format.endsWith('s') ? Number(format.slice(0, -1)) * 1000 : Infinity;
  const rng = createRng(Date.now() >>> 0);

  let startedAt: number | null = null;
  let done: Done[] = [];
  let keyOk = 0;
  let keyAll = 0;
  let item: Item;
  let finished = false;
  let lastTpl = '';

  const stage = h('div', { class: 'drill-stage' });
  root.appendChild(stage);
  const meta = h('div', { class: 'drill-meta' });
  const promptEl = h('div', { class: 'drill-prompt' });
  const mirror = h('div', { class: 'type-mirror', 'aria-hidden': 'true' });
  const input = h('input', { class: 'type-input', autocomplete: 'off', spellcheck: false, 'aria-label': 'Type the command' }) as HTMLInputElement;
  input.setAttribute('autocapitalize', 'off');
  const wrap = h('div', { class: 'type-wrap' }, mirror, input);
  const feedback = h('div', { class: 'drill-feedback' });
  const keysEl = h('div', { class: 'drill-keys' }, h('span', null, h('kbd', null, 'Enter'), ' submit'), h('span', null, h('kbd', null, 'Tab'), ' restart'), h('span', null, h('kbd', null, 'Esc'), ' end'), h('span', { class: 'spacer' }), h('span', null, `${label} · ${format} · ${strict}`));

  const showPlaying = () => {
    clear(stage);
    stage.append(meta, promptEl, wrap, feedback, keysEl);
  };

  const nextItem = () => {
    let tpl = rng.pick(list);
    if (list.length > 1) for (let i = 0; i < 4 && tpl.id === lastTpl; i++) tpl = rng.pick(list);
    lastTpl = tpl.id;
    const g = tpl.gen(rng);
    item = { tpl, prompt: g.prompt, answer: g.answer, variants: [g.answer, ...(g.accepted ?? [])], shownAt: performance.now(), wrong: false };
    const fam = FAMILIES.find((f) => f.id === tpl.family)?.label ?? tpl.family;
    clear(promptEl);
    promptEl.append(h('span', { class: 'fam' }, fam), g.prompt);
    input.value = '';
    renderMirror();
    clear(feedback);
    wrap.classList.remove('bad', 'good');
  };

  const closest = (typed: string): string => {
    const t = typed.toUpperCase();
    let best = item.variants[0];
    let bestN = -1;
    for (const v of item.variants) {
      const V = v.toUpperCase();
      let n = 0;
      while (n < t.length && n < V.length && t[n] === V[n]) n++;
      if (n > bestN) { bestN = n; best = v; }
    }
    return best;
  };

  const renderMirror = () => {
    clear(mirror);
    const typed = input.value;
    const v = closest(typed).toUpperCase();
    // relaxed mode: once the prefix diverges we still colour, but the canonical check decides
    for (let i = 0; i < typed.length; i++) {
      const c = typed[i];
      const cls = i >= v.length ? 'c-extra' : c.toUpperCase() === v[i] ? 'c-ok' : 'c-bad';
      mirror.appendChild(h('span', { class: cls }, c));
    }
  };

  const renderMeta = () => {
    const t = startedAt === null ? 0 : performance.now() - startedAt;
    const mins = Math.max(t / 60000, 1 / 60);
    const cpm = startedAt === null ? 0 : done.length / mins;
    clear(meta);
    meta.append(
      h('span', null, h('b', null, limitMs < Infinity ? `${Math.max(0, Math.ceil((limitMs - t) / 1000))}s` : `${done.length}/${goal}`)),
      h('span', null, 'CPM ', h('b', null, cpm.toFixed(1))),
      h('span', null, 'acc ', h('b', null, keyAll ? pct(keyOk / keyAll) : '—')),
      h('span', null, 'first-try ', h('b', null, done.length ? pct(done.filter((d) => d.firstTry).length / done.length) : '—')),
    );
    if (startedAt !== null && t >= limitMs) end();
  };

  const accepts = (typed: string): boolean => {
    if (!typed.trim()) return false;
    if (strict === 'strict') return item.variants.some((v) => strictEqual(typed, v));
    const ok = item.variants.some((v) => { try { return canonEqual(typed, v); } catch { return false; } });
    if (!ok) return false;
    if (strict === 'abbrev') {
      const a = abbrevStats(typed);
      return a.abbreviated === a.longCommands;
    }
    return true;
  };

  input.addEventListener('beforeinput', () => {
    if (startedAt === null && !finished) {
      startedAt = performance.now();
      item.shownAt = startedAt;
    }
  });
  input.addEventListener('input', (e) => {
    const ie = e as InputEvent;
    if (ie.inputType?.startsWith('insert')) {
      keyAll++;
      const t = input.value.toUpperCase().replace(/\s+/g, '');
      if (item.variants.some((v) => v.toUpperCase().replace(/\s+/g, '').startsWith(t))) keyOk++;
    }
    wrap.classList.remove('bad');
    renderMirror();
  });
  input.addEventListener('paste', (e) => e.preventDefault());

  const submit = () => {
    if (finished) return;
    const typed = input.value;
    if (!typed.trim()) return;
    if (startedAt === null) startedAt = performance.now();
    if (accepts(typed)) {
      const ms = performance.now() - item.shownAt;
      done.push({ answer: item.answer, firstTry: !item.wrong, ms, command: item.tpl.command });
      play('ok');
      if (done.length >= goal) {
        end();
        return;
      }
      nextItem();
      wrap.classList.add('good');
      setTimeout(() => wrap.classList.remove('good'), 180);
    } else {
      item.wrong = true;
      play('err');
      wrap.classList.add('bad');
      clear(feedback);
      const info = getCommandInfo(item.tpl.command);
      feedback.append(
        h('div', null, h('span', { class: 'err' }, '✗ '), 'Expected ', h('span', { class: 'ans' }, item.answer), item.variants.length > 1 ? h('span', { class: 'faint' }, `  (also: ${item.variants.slice(1).join('  ')})`) : null),
        h('div', { class: 'faint small' }, info?.signature ?? '', ' — ', item.tpl.explain),
      );
    }
  };

  const restart = () => {
    finished = false;
    startedAt = null;
    done = [];
    keyOk = 0;
    keyAll = 0;
    showPlaying();
    nextItem();
    renderMeta();
    input.focus();
  };

  const end = () => {
    if (finished) return;
    finished = true;
    const durationMs = startedAt === null ? 0 : Math.min(performance.now() - startedAt, limitMs);
    if (!done.length) {
      navigate('#/drills');
      return;
    }
    const acc = keyAll ? keyOk / keyAll : 1;
    const firstTry = done.filter((d) => d.firstTry).length / done.length;
    const cpm = done.length / Math.max(durationMs / 60000, 1 / 60);
    const rec: DrillSessionRecord = { t: Date.now(), set: label, format, strict, commands: done.length, cpm: Number(cpm.toFixed(2)), accuracy: acc, firstTry, durationMs, xp: 0 };
    const prevBest = Math.max(0, ...getSave().drills.sessions.filter((s) => s.format === format).map((s) => s.cpm));
    let res!: ReturnType<typeof recordDrillSession>;
    updateSave((s) => {
      for (const d of done) recordCommandStat(s, d.command, d.firstTry, d.ms);
      res = recordDrillSession(s, rec, drillXp(done, acc), isoDate());
    });
    const isPB = prevBest > 0 && cpm > prevBest && done.length >= 10;
    if (isPB) pbConfetti();
    res.achievements.forEach((a, i) => setTimeout(() => achievementToast(a.title, a.desc), 400 + i * 400));
    showResults(rec, res.xp, isPB);
  };

  const showResults = (rec: DrillSessionRecord, xp: number, isPB: boolean) => {
    clear(stage);
    const per = new Map<string, { n: number; miss: number; ms: number }>();
    for (const d of done) {
      const p = per.get(d.command) ?? { n: 0, miss: 0, ms: 0 };
      p.n++;
      if (!d.firstTry) p.miss++;
      p.ms += d.ms / drillParMs(d.answer);
      per.set(d.command, p);
    }
    const worst = [...per.entries()].sort(([, a], [, b]) => b.miss / b.n - a.miss / a.n || b.ms / b.n - a.ms / a.n).slice(0, 5);
    stage.append(
      h('div', { class: 'grid c4', style: 'margin-bottom:16px' },
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'CPM'), h('div', { class: 'big-num accent' }, rec.cpm.toFixed(1)), isPB ? h('div', { class: 'accent small' }, 'Personal best') : null),
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Keystroke accuracy'), h('div', { class: 'big-num' }, pct(rec.accuracy))),
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'First try'), h('div', { class: 'big-num' }, pct(rec.firstTry))),
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'XP'), h('div', { class: 'big-num' }, `+${xp}`), h('div', { class: 'faint small' }, `${rec.commands} commands · ${(rec.durationMs / 1000).toFixed(0)} s`)),
      ),
      h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'kicker' }, 'Time per command (s)'), h('div', { class: 'chart' }, sparkline(done.map((d) => d.ms / 1000), { width: 800, height: 60, min: 0, color: 'var(--accent-2)' }))),
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Worst commands'),
        h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Command'), h('th', { class: 'r' }, 'Seen'), h('th', { class: 'r' }, 'Missed'), h('th', { class: 'r' }, 'Time vs par'), h('th', null, ''))),
          h('tbody', null, ...worst.map(([c, p]) => h('tr', null, h('td', { class: 'accent' }, c), h('td', { class: 'r' }, String(p.n)), h('td', { class: 'r' }, String(p.miss)), h('td', { class: 'r' }, `${(p.ms / p.n).toFixed(2)}×`),
            h('td', null, h('a', { href: `#/drills/session?set=${encodeURIComponent('cmd:' + c)}&format=30c&strict=${strict}` }, 'drill this')))))),
      ),
      h('div', { class: 'row', style: 'margin-top:16px' }, h('button', { class: 'primary', onclick: () => restart() }, 'Again  (Tab)'), h('a', { class: 'btn', href: '#/drills' }, 'Setup'), h('a', { class: 'btn ghost', href: '#/stats' }, 'Stats')),
    );
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  const offKeys = hotkeys({
    tab: () => { restart(); },
    escape: () => { if (finished) navigate('#/drills'); else end(); },
  }, { inInputs: true });
  const tick = setInterval(() => { if (!finished) renderMeta(); }, 200);
  restart();
  return () => {
    clearInterval(tick);
    offKeys();
  };
}
