// #/sandbox — free play: type any APDL and see the model, log and statistics live. No timer, no grading.
import type { RouteCtx } from '../app/router';
import { createLiveRunner, formatDiagnostic, type RunResult } from '../engine';
import { h, clear } from '../ui/dom';
import { SafeViewer } from '../ui/viewer';
import { ApdlEditor } from '../editor/editor';
import tgfA from '../../models/reference/TGF36_A.inp?raw';
import tgfB from '../../models/reference/TGF36_B.inp?raw';
import tgfC from '../../models/reference/TGF36_C.inp?raw';
import tgfD from '../../models/reference/TGF36_D.inp?raw';

const DRAFT_KEY = 'apdl-dojo:sandbox';

const EXAMPLES: { id: string; label: string; script: string }[] = [
  { id: 'blank', label: 'Blank', script: '/PREP7\n' },
  {
    id: 'column', label: 'Meshed column', script: `/PREP7
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
BLOCK,0,2,0,3,0,8
ESIZE,1 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL
ACEL,0,0,9.81
/VIEW,1,1,1,1 $ EPLOT
`,
  },
  { id: 'tgfA', label: 'TGF-36 A · primitives + Booleans', script: tgfA },
  { id: 'tgfB', label: 'TGF-36 B · bottom-up', script: tgfB },
  { id: 'tgfC', label: 'TGF-36 C · extrude / drag', script: tgfC },
  { id: 'tgfD', label: 'TGF-36 D · beam / shell / spring frame', script: tgfD },
];

function readDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}
function writeDraft(v: string) {
  try {
    localStorage.setItem(DRAFT_KEY, v);
  } catch {
    /* storage unavailable */
  }
}

export function sandboxPage({ root, query }: RouteCtx) {
  const pick = query.get('example');
  const initial = EXAMPLES.find((e) => e.id === pick)?.script ?? readDraft() ?? EXAMPLES[1].script;

  const stats = h('div', { class: 'sb-stats' });
  const logBody = h('pre', { class: 'sb-log' });
  const errBody = h('div', { class: 'sb-errs' });
  const select = h('select', { class: 'sb-select', 'aria-label': 'Load an example' },
    h('option', { value: '' }, 'Load example…'),
    ...EXAMPLES.map((e) => h('option', { value: e.id }, e.label)));
  const status = h('span', { class: 'faint small' }, '');
  const head = h('div', { class: 'sb-head' },
    h('strong', {}, 'Sandbox'),
    h('span', { class: 'faint small' }, 'Free play: no timer, no grading. Ctrl+Enter runs now; edits re-run automatically.'),
    h('span', { style: 'flex:1' }),
    status,
    select);
  const edHost = h('div', { class: 'sb-editor' });
  const vpHost = h('div', { class: 'sb-viewport vp-host' });
  const tabs = h('div', { class: 'sb-tabs' });
  const bottom = h('div', { class: 'sb-bottom' }, tabs, h('div', { class: 'sb-panels' }, errBody, logBody));
  const layout = h('div', { class: 'sb-layout' }, head, edHost, h('div', { class: 'sb-right' }, vpHost, stats), bottom);
  root.appendChild(layout);
  root.appendChild(h('style', {}, SANDBOX_CSS));

  let showLog = false;
  const renderTabs = (r?: RunResult) => {
    clear(tabs);
    const nErr = r ? r.diagnostics.filter((d) => d.severity !== 'note').length : 0;
    tabs.append(
      h('button', { class: `sb-tab ${!showLog ? 'on' : ''}`, onclick: () => { showLog = false; sync(); } }, `Messages${nErr ? ` (${nErr})` : ''}`),
      h('button', { class: `sb-tab ${showLog ? 'on' : ''}`, onclick: () => { showLog = true; sync(); } }, 'Output log'),
    );
  };
  const sync = () => {
    errBody.style.display = showLog ? 'none' : '';
    logBody.style.display = showLog ? '' : 'none';
    renderTabs(last ?? undefined);
  };

  const viewer = new SafeViewer(vpHost, 'yours');
  const runner = createLiveRunner(300);
  let last: RunResult | null = null;
  let firstFit = true;

  const onResult = (r: RunResult) => {
    last = r;
    viewer.setModel(r.model, r.viewHints);
    if (firstFit) { firstFit = false; setTimeout(() => viewer.fit(), 30); }
    editor.setDiagnostics(r.diagnostics.map((d) => ({ line: d.line, severity: d.severity, text: d.text })));
    const m = r.model;
    const byType = new Map<string, number>();
    for (const e of m.elems.values()) {
      const n = m.etypes.get(e.type)?.ename ?? `TYPE ${e.type}`;
      byType.set(n, (byType.get(n) ?? 0) + 1);
    }
    let vol = 0;
    for (const v of m.volus.values()) vol += v.volume;
    clear(stats);
    const cell = (k: string, v: string | number) => h('div', { class: 'sb-stat' }, h('span', { class: 'faint' }, k), h('b', {}, String(v)));
    stats.append(
      cell('KP', m.kps.size), cell('Lines', m.lines.size), cell('Areas', m.areas.size), cell('Volumes', m.volus.size),
      cell('Volume', vol ? +vol.toPrecision(6) : 0), cell('Nodes', m.nodes.size), cell('Elements', m.elems.size),
      ...[...byType].map(([k, v]) => cell(k, v)),
      cell('Run', `${Math.round(r.timings.execMs)} ms`),
    );
    clear(errBody);
    const ds = r.diagnostics.filter((d) => d.severity !== 'note');
    if (!ds.length) errBody.appendChild(h('div', { class: 'faint' }, 'No warnings or errors.'));
    for (const d of ds) {
      const [hd, ...rest] = formatDiagnostic(d).split('\n');
      errBody.appendChild(h('div', { class: `sb-diag ${d.severity}`, onclick: () => editor.gotoLine(d.line) }, h('div', {}, hd), h('div', { class: 'faint' }, rest.join('\n'))));
    }
    logBody.textContent = r.log.map((l) => (l.kind === 'echo' ? ` ${l.text}` : l.kind === 'output' ? l.text : `*** ${l.kind.toUpperCase()} *** ${l.text}`)).join('\n');
    status.textContent = '';
    renderTabs(r);
  };

  const run = (immediate = false) => {
    status.textContent = 'Running…';
    runner.run(editor.getValue(), onResult, undefined, immediate);
  };

  const editor = new ApdlEditor(edHost, {
    value: initial,
    onChange: (v) => { writeDraft(v); run(); },
    onRun: () => run(true),
    placeholder: 'Type APDL here. Ctrl+Enter runs.',
  });
  select.addEventListener('change', () => {
    const ex = EXAMPLES.find((e) => e.id === select.value);
    if (!ex) return;
    editor.setValue(ex.script);
    writeDraft(ex.script);
    firstFit = true;
    run(true);
    select.value = '';
  });
  sync();
  run(true);
  editor.focus();

  return () => {
    runner.cancel();
    editor.destroy();
    viewer.dispose();
  };
}

const SANDBOX_CSS = `
.sb-layout{display:grid;grid-template-columns:minmax(320px,42%) 1fr;grid-template-rows:auto minmax(0,1fr) 190px;height:calc(100vh - var(--header-h));min-height:560px;gap:0}
.sb-head{grid-column:1/3;display:flex;gap:12px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--line);background:var(--bg-1)}
.sb-editor{min-height:0;overflow:hidden;border-right:1px solid var(--line)}
.sb-editor .cm-editor{height:100%}
.sb-right{display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0}
.sb-viewport{min-height:0;position:relative}
.sb-stats{display:flex;flex-wrap:wrap;gap:4px 14px;padding:6px 12px;border-top:1px solid var(--line);font-size:12px}
.sb-stat{display:flex;gap:6px;align-items:baseline}
.sb-bottom{grid-column:1/3;display:grid;grid-template-rows:auto 1fr;border-top:1px solid var(--line);min-height:0;background:var(--bg-1)}
.sb-tabs{display:flex;gap:2px;padding:4px 8px 0}
.sb-tab{background:none;border:0;border-bottom:2px solid transparent;color:var(--fg-muted);padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}
.sb-tab.on{color:var(--fg);border-bottom-color:var(--accent)}
.sb-panels{min-height:0;overflow:auto;padding:6px 12px}
.sb-log{margin:0;font-size:12px;white-space:pre-wrap;color:var(--fg-muted)}
.sb-diag{padding:4px 0;border-bottom:1px solid var(--line);cursor:pointer;font-size:12px;white-space:pre-wrap}
.sb-diag.error>div:first-child{color:var(--err)}
.sb-diag.warning>div:first-child{color:var(--warn,var(--accent))}
.sb-select{background:var(--bg-2);color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:4px 8px;font:inherit;font-size:12px}
`;
