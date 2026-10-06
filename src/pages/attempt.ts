// The core timed-attempt screen shared by challenges, the daily, speedruns and error hunts.
//   editor (45%) | viewport (target / yours / split / overlay) + checklist
//   bottom panel: Log / Errors / Brief      HUD: timer, lines vs par, star preview, ghost, chips, hints
import { runScript, createLiveRunner, grade, countScriptLines, formatDiagnostic } from '../engine';
import type { RunResult, Score, GradeOptions } from '../engine';
import type { Hint } from '../content/types';
import { ApdlEditor } from '../editor/editor';
import { AttemptSession, ghostAt, type GhostPoint } from '../game/session';
import { computeStars, starBlockers, type Stars } from '../game/stars';
import { stagesPassed, presentStages } from '../game/splits';
import { abbrevStats, countFamily, maxDollarChain } from '../game/canon';
import type { XpAward } from '../game/xp';
import type { Achievement } from '../game/achievements';
import { clear, fmtTime, h } from '../ui/dom';
import { Checklist } from '../ui/components/checklist';
import { starsEl, animatedStars } from '../ui/components/stars';
import { toast, achievementToast } from '../ui/components/toast';
import { openModal, modalOpen } from '../ui/components/modal';
import { renderMarkdown } from '../ui/markdown';
import { SafeViewer, type Mode } from '../ui/viewer';
import { toggleReferenceDrawer, closeReferenceDrawer } from '../ui/reference';
import { pbConfetti } from '../ui/confetti';
import { hotkeys } from '../app/hotkeys';
import { getDraft, setDraft } from '../app/persist';
import { navigate } from '../app/router';
import { play } from '../app/sfx';

export interface ClearCtx {
  timeMs: number;
  lines: number;
  script: string;
  stars: Stars;
  score: Score;
  result: RunResult;
  session: AttemptSession;
  /** canonical commands executed */
  commands: string[];
  etypes: string[];
  ghost: GhostPoint[];
  abbrevLong: number;
  abbrevDone: number;
  dollarChain: number;
  selectCount: number;
}

export interface ClearSummary {
  title?: string;
  stars?: Stars;
  xp: XpAward;
  achievements: Achievement[];
  isPB: boolean;
  extra?: Node;
}

export interface AttemptConfig {
  key: string;
  mode: 'challenge' | 'daily' | 'speedrun' | 'errorhunt';
  title: string;
  /** markdown, parameters already substituted */
  brief: string;
  targetScript: string;
  parLines: number;
  parTimeSeconds: number;
  required: string[];
  forbidden: string[];
  hints: Hint[];
  grading?: { elemTolerance?: number; nodeTolerance?: number; volumeTolerance?: number; ignore?: string[] };
  starter?: string;
  solution?: string;
  pasteBlocked: boolean;
  drafts: boolean;
  ghost?: GhostPoint[] | null;
  /** win also requires zero warnings/errors (error hunts) */
  requireNoDiagnostics?: boolean;
  /** hide the star preview (speedrun shows splits instead) */
  noStars?: boolean;
  /** extra element shown above the checklist (speedrun splits) */
  side?: HTMLElement;
  onStart?: () => void;
  onRun?: (score: Score | null, tMs: number, session: AttemptSession) => void;
  onReset?: () => void;
  onClear: (c: ClearCtx) => ClearSummary;
  nextHref?: string;
  nextLabel?: string;
  backHref?: string;
}

interface Req {
  explicit: boolean;
  requestedAt: number;
  src: string;
}

export function mountAttempt(root: HTMLElement, cfg: AttemptConfig): () => void {
  const session = new AttemptSession();
  const runner = createLiveRunner(400);
  let target: RunResult | null = null;
  let targetError: string | null = null;
  let lastScore: Score | null = null;
  let lastResult: RunResult | null = null;
  let lastReq: Req | null = null;
  let modeTouched = false;
  let disposed = false;
  let hintsShown = 0;
  let draftTimer: ReturnType<typeof setTimeout> | null = null;

  // ---------------------------------------------------------------- DOM
  const timerEl = h('span', { class: 'timer idle', title: 'Starts on your first keystroke' }, fmtTime(0));
  const linesEl = h('span', { class: 'stat' });
  const starPrev = h('span', { class: 'stat', title: 'Stars if you matched right now' });
  const ghostYou = h('div', { class: 'progress bar-thin', title: 'Stages passed' }, h('i', { style: 'width:0%' }));
  const ghostG = h('div', { class: 'progress bar-thin g', title: 'Ghost (your best clear)' }, h('i', { style: 'width:0%' }));
  const ghostBars = h('div', { class: 'ghostbars', title: 'Top: you · bottom: your ghost' }, ghostYou, cfg.ghost?.length ? ghostG : null);
  const chipsEl = h('div', { class: 'chips' });
  const hintBtn = h('button', { class: 'small', title: 'Ctrl+H — each hint costs 15% XP and caps you at 2★', onclick: () => useHint() }, 'Hint 0/3');
  const refBtn = h('button', { class: 'small ghost', title: 'Ctrl+R — opening it while timed counts as a peek (−10% XP)', onclick: () => openRef() }, 'Ref');
  const runBtn = h('button', { class: 'small primary', title: 'Ctrl+Enter', onclick: () => runNow(true) }, 'Run');
  const statusEl = h('span', { class: 'stat' });
  const hud = h('div', { class: 'hud' },
    cfg.backHref ? h('a', { href: cfg.backHref, class: 'faint', title: 'Back' }, '←') : null,
    h('span', { class: 'title', title: cfg.title }, cfg.title),
    timerEl,
    h('span', { class: 'stat faint' }, `par ${fmtTime(cfg.parTimeSeconds * 1000, false)}`),
    linesEl,
    cfg.noStars ? null : starPrev,
    ghostBars,
    chipsEl,
    statusEl,
    h('span', { class: 'spacer' }),
    cfg.hints.length ? hintBtn : null,
    refBtn,
    runBtn,
  );

  const editorHost = h('div', { class: 'editor-host' });
  const vpHost = h('div', { class: 'vp-host', tabindex: '0', title: 'F6 to focus · 1-6 views · F fit' });
  const checklist = new Checklist();
  const rightCol = h('div', { class: 'right' }, vpHost, h('div', null, cfg.side ?? null, checklist.el));
  const work = h('div', { class: 'work' }, h('div', { class: 'left' }, editorHost), rightCol);

  const logBody = h('div');
  const errBody = h('div');
  const briefBody = h('div', { class: 'md' });
  const hintBody = h('div');
  const errCount = h('span', { class: 'count' });
  const tabBtns = {
    log: h('button', { onclick: () => tab('log') }, 'Log'),
    errors: h('button', { onclick: () => tab('errors') }, 'Errors', errCount),
    brief: h('button', { onclick: () => tab('brief') }, 'Brief'),
  };
  const panelBody = h('div', { class: 'panel-body' });
  const bottom = h('div', { class: 'bottom' },
    h('div', { class: 'tabs' }, tabBtns.brief, tabBtns.log, tabBtns.errors, h('span', { class: 'spacer' }),
      h('button', { class: 'small ghost', title: 'Ctrl+L', onclick: () => toggleBottom() }, '▾')),
    panelBody,
  );
  const page = h('div', { class: 'attempt' }, hud, work, bottom);
  root.appendChild(page);

  briefBody.innerHTML = renderMarkdown(cfg.brief);
  const briefWrap = h('div', null, hintBody, briefBody);
  let curTab: 'log' | 'errors' | 'brief' = 'brief';
  function tab(t: 'log' | 'errors' | 'brief') {
    curTab = t;
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('active', k === t);
    clear(panelBody);
    panelBody.appendChild(t === 'log' ? logBody : t === 'errors' ? errBody : briefWrap);
    bottom.classList.remove('collapsed');
  }
  function toggleBottom() {
    bottom.classList.toggle('collapsed');
    setTimeout(() => viewer.resize(), 0);
  }
  tab('brief');

  // ---------------------------------------------------------------- viewer + editor
  const viewer = new SafeViewer(vpHost, 'target');
  viewer.onUserMode = () => { modeTouched = true; };
  function setMode(m: Mode, manual = false) {
    if (manual) modeTouched = true;
    viewer.setMode(m);
  }
  setMode('target');

  const starter = cfg.starter ?? '';
  const draft = cfg.drafts ? getDraft(cfg.key) : null;
  const editor = new ApdlEditor(editorHost, {
    value: draft ?? starter,
    blockPaste: cfg.pasteBlocked,
    placeholder: cfg.mode === 'speedrun' ? '! Blank editor. Timer starts on your first keystroke.' : '! Type APDL here. Ctrl+Enter runs; edits re-run automatically.',
    onPasteBlocked: () => toast('Paste is disabled in timed modes.', { kind: 'err', ms: 2000 }),
    onKeystroke: () => startIfIdle(),
    onChange: (v) => {
      startIfIdle();
      if (cfg.drafts) {
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(() => setDraft(cfg.key, v), 500);
      }
      runNow(false);
    },
    onRun: () => runNow(true),
    onEscape: () => resetAttempt(),
  });
  if (draft && draft !== starter) toast('Draft restored.', { ms: 1800 });

  function startIfIdle() {
    if (session.state !== 'idle') return;
    session.keystroke(performance.now());
    timerEl.classList.remove('idle');
    if (!modeTouched) setMode('split');
    cfg.onStart?.();
  }

  // ---------------------------------------------------------------- HUD
  function renderChips(used: string[] | null) {
    clear(chipsEl);
    for (const r of cfg.required) chipsEl.appendChild(h('span', { class: `chip req ${used?.includes(r) ? 'hit' : ''}`, title: 'Required command' }, `+${r}`));
    const shown = cfg.forbidden.length > 8 && !used ? cfg.forbidden.slice(0, 8) : cfg.forbidden;
    for (const f of shown) {
      const hit = used?.includes(f);
      if (cfg.forbidden.length > 8 && !hit && used) continue;
      chipsEl.appendChild(h('span', { class: `chip forb ${hit ? 'hit' : ''}`, title: 'Forbidden command' }, `−${f}`));
    }
    if (cfg.forbidden.length > 8 && !used) chipsEl.appendChild(h('span', { class: 'chip forb', title: cfg.forbidden.join(', ') }, `+${cfg.forbidden.length - 8} forbidden`));
    if (cfg.forbidden.length > 8 && used && !cfg.forbidden.some((f) => used.includes(f))) chipsEl.appendChild(h('span', { class: 'chip ok', title: cfg.forbidden.join(', ') }, `${cfg.forbidden.length} forbidden · clean`));
  }
  renderChips(null);

  function hudTick() {
    if (disposed) return;
    const now = performance.now();
    const t = session.elapsed(now);
    timerEl.textContent = fmtTime(t);
    timerEl.classList.toggle('done', session.state === 'cleared');
    if (session.running) timerEl.classList.toggle('over', t > cfg.parTimeSeconds * 1000);
    const lines = countLines(editor.getValue());
    clear(linesEl);
    linesEl.append('lines ', h('b', { class: lines > cfg.parLines ? 'over' : '' }, String(lines)), ` / ${cfg.parLines}`);
    if (!cfg.noStars && session.state !== 'cleared') {
      const inp = { match: true, timeMs: t, lines, parTimeSeconds: cfg.parTimeSeconds, parLines: cfg.parLines, errorsAcrossRuns: session.errorsAcrossRuns, hints: session.hints };
      const s = computeStars(inp);
      clear(starPrev);
      starPrev.append(starsEl(s));
      starPrev.title = `Stars if you matched now${starBlockers(inp).length ? ' · ' + starBlockers(inp).join(', ') : ''}`;
    }
    const nStages = Math.max(1, presentStages(lastScore).length);
    (ghostYou.firstChild as HTMLElement).style.width = `${(stagesPassed(lastScore) / nStages) * 100}%`;
    if (cfg.ghost?.length) {
      const g = ghostAt(cfg.ghost, t);
      (ghostG.firstChild as HTMLElement).style.width = `${((g?.stages ?? 0) / nStages) * 100}%`;
    }
  }
  const interval = setInterval(hudTick, 100);
  hudTick();

  function countLines(src: string): number {
    try {
      return countScriptLines(src);
    } catch {
      return src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('!')).length;
    }
  }

  // ---------------------------------------------------------------- running
  const gradeOpts: GradeOptions = {
    elemTolerance: cfg.grading?.elemTolerance,
    nodeTolerance: cfg.grading?.nodeTolerance,
    volumeTolerance: cfg.grading?.volumeTolerance,
    ignore: cfg.grading?.ignore,
    requiredCommands: cfg.required,
    forbiddenCommands: cfg.forbidden,
  };

  function runNow(explicit: boolean) {
    if (disposed) return;
    const src = editor.getValue();
    const req: Req = { explicit, requestedAt: performance.now(), src };
    lastReq = req;
    if (!target) {
      if (explicit) toast(targetError ? 'Target failed to build — see log.' : 'Target is still building…', { ms: 1500 });
      return;
    }
    if (explicit) statusEl.textContent = 'running…';
    runner.run(src, (r) => onResult(r, req), undefined, explicit);
  }

  function renderLog(r: RunResult | null, extra?: string) {
    clear(logBody);
    if (targetError) logBody.appendChild(h('div', { class: 'log-line error' }, `[target] ${targetError}`));
    if (extra) logBody.appendChild(h('div', { class: 'log-line error' }, extra));
    if (!r) return;
    for (const e of r.log.slice(-600)) {
      logBody.appendChild(h('div', { class: `log-line ${e.kind}`, onclick: () => e.line > 0 && editor.gotoLine(e.line) }, e.text));
    }
    if (r.truncated) logBody.appendChild(h('div', { class: 'log-line warning' }, 'Run truncated (command / iteration limit).'));
    if (curTab === 'log') panelBody.scrollTop = panelBody.scrollHeight;
  }

  function renderErrors(r: RunResult) {
    clear(errBody);
    const ds = r.diagnostics.filter((d) => d.severity !== 'note');
    errCount.textContent = ds.length ? String(ds.length) : '';
    if (!ds.length) {
      errBody.appendChild(h('div', { class: 'faint' }, 'No warnings or errors.'));
      return;
    }
    for (const d of ds) {
      const [head, ...rest] = formatDiagnostic(d).split('\n');
      errBody.appendChild(h('div', { class: `diag ${d.severity}`, onclick: () => editor.gotoLine(d.line) }, h('div', { class: 'h' }, head), h('div', { class: 'muted' }, rest.join('\n'))));
    }
  }

  function onResult(r: RunResult, req: Req) {
    if (disposed || !target) return;
    if (req !== lastReq && !req.explicit) return;
    statusEl.textContent = '';
    lastResult = r;
    viewer.setModel(r.model, r.viewHints);
    editor.setDiagnostics(r.diagnostics.map((d) => ({ line: d.line, severity: d.severity, text: d.text })));
    renderErrors(r);
    let score: Score | null = null;
    let gradeErr: string | undefined;
    try {
      score = grade(target, r, gradeOpts);
    } catch (e) {
      gradeErr = `Grader error: ${e instanceof Error ? e.message : String(e)}`;
      console.error(e);
    }
    renderLog(r, gradeErr);
    lastScore = score;
    checklist.update(score, gradeErr);
    renderChips(r.model.commandsUsed ?? []);
    const lines = countLines(req.src);
    const errors = r.diagnostics.filter((d) => d.severity === 'error').length;
    const diagCount = r.diagnostics.filter((d) => d.severity !== 'note').length;
    const match = !!score?.match && (!cfg.requireNoDiagnostics || diagCount === 0);
    const tMs = session.startedAt !== null ? Math.max(0, req.requestedAt - session.startedAt) : 0;
    session.recordRun(req.requestedAt, { lines, errors, match, total: score?.total ?? 0, stagesPassed: stagesPassed(score), explicit: req.explicit });
    cfg.onRun?.(score, tMs, session);
    if (req.explicit) play(match ? 'ok' : errors ? 'err' : 'tick');
    if (match && session.running && score) finish(req, r, score, lines);
    hudTick();
  }

  function finish(req: Req, r: RunResult, score: Score, lines: number) {
    const timeMs = session.clear(req.requestedAt);
    const stars = computeStars({ match: true, timeMs, lines, parTimeSeconds: cfg.parTimeSeconds, parLines: cfg.parLines, errorsAcrossRuns: session.errorsAcrossRuns, hints: session.hints });
    const ab = abbrevStats(req.src);
    const usedTypes = new Set<number>();
    for (const e of r.model.elems.values()) usedTypes.add(e.type);
    const etypes = [...r.model.etypes.values()].filter((t) => usedTypes.has(t.id)).map((t) => t.ename);
    if (draftTimer) clearTimeout(draftTimer);
    if (cfg.drafts) setDraft(cfg.key, '');
    let summary: ClearSummary;
    try {
      summary = cfg.onClear({
        timeMs, lines, script: req.src, stars, score, result: r, session, commands: r.model.commandsUsed ?? [], etypes,
        ghost: session.ghost, abbrevLong: ab.longCommands, abbrevDone: ab.abbreviated, dollarChain: maxDollarChain(req.src), selectCount: countFamily(req.src, 'select'),
      });
    } catch (e) {
      console.error(e);
      summary = { xp: { total: 0, parts: [] }, achievements: [], isPB: false };
    }
    play(summary.isPB ? 'pb' : 'clear');
    if (summary.isPB) pbConfetti();
    summary.achievements.forEach((a, i) => setTimeout(() => achievementToast(a.title, a.desc), 600 + i * 400));
    showClearModal(timeMs, lines, summary);
  }

  function showClearModal(timeMs: number, lines: number, s: ClearSummary) {
    const row = (k: string, v: string, good: boolean | null) => [h('span', { class: 'muted' }, k), h('span', { class: good === null ? '' : good ? 'ok' : 'warn' }, v)];
    const solutionBtn = cfg.solution ? h('button', { onclick: () => showSolution() }, 'Solution') : null;
    const retryBtn = h('button', { onclick: () => { m.close(); resetAttempt(true); } }, 'Retry');
    const nextBtn = cfg.nextHref ? h('button', { class: 'primary', onclick: () => { m.close(); navigate(cfg.nextHref!); } }, cfg.nextLabel ?? 'Next') : null;
    const m = openModal(h('div', null,
      h('div', { class: 'row between' }, h('h1', { style: 'margin:0' }, s.title ?? 'Cleared'), s.stars !== undefined ? animatedStars(s.stars) : null),
      s.isPB ? h('p', { class: 'accent' }, 'Personal best.') : null,
      h('div', { class: 'xp-lines', style: 'margin:16px 0' },
        ...row('Time', `${fmtTime(timeMs)}  (par ${fmtTime(cfg.parTimeSeconds * 1000, false)})`, timeMs <= cfg.parTimeSeconds * 1000),
        ...row('Lines', `${lines}  (par ${cfg.parLines})`, lines <= cfg.parLines),
        ...row('Errors in runs', String(session.errorsAcrossRuns), session.errorsAcrossRuns === 0),
        ...row('Hints / peeks', `${session.hints} / ${session.peeks}`, session.hints + session.peeks === 0),
      ),
      s.xp.parts.length ? h('div', null, h('h3', null, 'XP'), h('div', { class: 'xp-lines' },
        ...s.xp.parts.flatMap((p) => [h('span', null, p.label), h('span', { class: 'mono-num' }, `${p.amount >= 0 ? '+' : ''}${p.amount}`)]),
        h('span', { class: 'tot' }, 'Total'), h('span', { class: 'tot mono-num' }, `+${s.xp.total}`),
      )) : h('p', { class: 'faint small' }, 'No XP this time (already counted, or practice run).'),
      s.achievements.length ? h('div', { style: 'margin-top:16px' }, h('h3', null, 'Achievements unlocked'),
        ...s.achievements.map((a) => h('div', null, h('span', { class: 'accent' }, '★ '), h('b', null, a.title), h('span', { class: 'muted' }, ` — ${a.desc}`)))) : null,
      s.extra ?? null,
      h('div', { class: 'actions' }, solutionBtn, retryBtn, nextBtn),
    ));
    (nextBtn ?? retryBtn).focus();
  }

  function showSolution() {
    openModal(h('div', null, h('h1', null, 'Reference solution'), h('pre', null, h('code', null, cfg.solution ?? '')),
      h('div', { class: 'actions' }, h('button', { onclick: () => { void navigator.clipboard?.writeText(cfg.solution ?? ''); toast('Copied.', { ms: 1200 }); } }, 'Copy'))), { wide: true });
  }

  // ---------------------------------------------------------------- hints / reference / reset
  function useHint() {
    if (session.state === 'cleared') return;
    const sorted = [...cfg.hints].sort((a, b) => a.level - b.level);
    if (hintsShown >= sorted.length) {
      toast('No more hints.', { ms: 1500 });
      return;
    }
    if (!session.useHint()) return;
    hintsShown = session.hints;
    hintBtn.textContent = `Hint ${hintsShown}/3`;
    clear(hintBody);
    for (const hi of sorted.slice(0, hintsShown)) {
      const box = h('div', { class: 'hintbox md' });
      box.innerHTML = `<span class="faint xs">HINT ${hi.level}</span> ` + renderMarkdown(hi.text).replace(/^<p>|<\/p>$/g, '');
      hintBody.appendChild(box);
    }
    tab('brief');
  }

  function openRef() {
    toggleReferenceDrawer(() => {
      if (session.running) {
        session.peek();
        toast(`Peek counted (${session.peeks}) — −10% XP${cfg.mode === 'speedrun' ? ', not 100%' : ''}.`, { ms: 1800 });
      }
    });
  }

  function resetAttempt(fromRetry = false) {
    if (modalOpen()) return;
    const prevText = editor.getValue();
    const snap = session.snapshot();
    const prevScore = lastScore;
    session.reset();
    hintsShown = 0;
    hintBtn.textContent = 'Hint 0/3';
    clear(hintBody);
    editor.setValue(starter);
    editor.setDiagnostics([]);
    lastScore = null;
    checklist.reset();
    checklist.update(null, 'Reset. Timer starts on your first keystroke.');
    timerEl.classList.add('idle');
    timerEl.classList.remove('done', 'over');
    modeTouched = false;
    setMode('target');
    viewer.setModel(null);
    renderChips(null);
    cfg.onReset?.();
    hudTick();
    editor.focus();
    if (!fromRetry && prevText.trim()) {
      toast('Attempt reset.', {
        ms: 3000,
        action: {
          label: 'Undo',
          run: () => {
            session.restore(snap);
            hintsShown = snap.hints;
            hintBtn.textContent = `Hint ${hintsShown}/3`;
            editor.setValue(prevText, false);
            lastScore = prevScore;
            if (session.state !== 'idle') timerEl.classList.remove('idle');
            setMode('split');
            runNow(false);
          },
        },
      });
    }
  }

  // ---------------------------------------------------------------- shortcuts
  const offKeys = hotkeys({
    'mod+1': () => setMode('target', true),
    'mod+2': () => setMode('yours', true),
    'mod+3': () => setMode('split', true),
    'mod+4': () => setMode('ghost', true),
    'ctrl+h': () => useHint(),
    'mod+l': () => toggleBottom(),
    'mod+r': () => openRef(),
    'mod+enter': () => { if (modalOpen()) return false; runNow(true); },
    f6: () => vpHost.focus(),
  });
  const offEsc = hotkeys({ escape: () => { if (modalOpen()) return false; if (vpHost.contains(document.activeElement)) { editor.focus(); return; } resetAttempt(); } }, { inInputs: false });
  // The viewport handles 1-4 (iso/front/top/right) and F itself while focused; add 5/6 and a way back.
  vpHost.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '5') { viewer.setView('back'); e.preventDefault(); }
    else if (e.key === '6') { viewer.setView('bottom'); e.preventDefault(); }
    else if (e.key === 'Escape' || e.key === 'Enter') { editor.focus(); e.preventDefault(); e.stopPropagation(); }
  });

  // ---------------------------------------------------------------- target
  renderLog(null);
  checklist.update(null, 'Building target…');
  runScript(cfg.targetScript).then((r) => {
    if (disposed) return;
    target = r;
    const errs = r.diagnostics.filter((d) => d.severity === 'error');
    if (errs.length) {
      targetError = `target script has ${errs.length} error(s): ${errs.slice(0, 3).map((d) => `line ${d.line}: ${d.text}`).join(' | ')}`;
      renderLog(null);
    }
    viewer.setTarget(r.model);
    setTimeout(() => viewer.fit(), 50);
    checklist.update(null, 'Target ready. Start typing — the timer starts on your first keystroke.');
    if (editor.getValue().trim()) runNow(false);
  }).catch((e) => {
    if (disposed) return;
    targetError = `Target failed to build: ${e instanceof Error ? e.message : String(e)}`;
    renderLog(null);
    tab('log');
    checklist.update(null, 'Target unavailable — the interpreter may still be under construction.');
  });

  editor.focus();

  return () => {
    disposed = true;
    clearInterval(interval);
    if (draftTimer) {
      clearTimeout(draftTimer);
      if (cfg.drafts && session.state !== 'cleared') setDraft(cfg.key, editor.getValue());
    }
    runner.cancel();
    offKeys();
    offEsc();
    closeReferenceDrawer();
    editor.destroy();
    viewer.dispose();
    void lastResult;
  };
}
