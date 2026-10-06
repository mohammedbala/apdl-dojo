// #/speedrun (categories, PB, local leaderboard, export/import) and #/speedrun/run?cat=any|hundred.
import type { RouteCtx } from '../app/router';
import { getChallenge, SPEEDRUN_TARGET_ID } from '../content';
import { defaultParams, fillBrief, withParams } from '../game/params';
import { recordSpeedrun, speedrunPB, techniqueTag } from '../game/progress';
import { isoDate } from '../game/streak';
import { STAGE_LABEL, splitRows, updateSplits, presentStages, type Splits } from '../game/splits';
import { getSave, updateSave } from '../app/persist';
import type { SpeedrunRecord } from '../app/schema';
import { mountAttempt } from './attempt';
import { comingSoon, padded, pageHead } from './common';
import { clear, h, fmtTime, fmtDelta, fmtDate, downloadText, pickFile } from '../ui/dom';
import { toast } from '../ui/components/toast';
import { stackedBar } from '../ui/components/charts';
import type { Stage } from '../grader/types';

type Cat = 'any' | 'hundred';
const CAT_LABEL: Record<Cat, string> = { any: 'any%', hundred: '100%' };
const STAGE_COLOR: Record<Stage, string> = { geometry: 'var(--accent-2)', attributes: 'var(--trk-5)', mesh: 'var(--accent)', bcs: 'var(--ok)' };

export function speedrunPage({ root, query }: RouteCtx) {
  const target = getChallenge(SPEEDRUN_TARGET_ID);
  let cat: Cat = query.get('cat') === 'hundred' ? 'hundred' : 'any';
  root.appendChild(pageHead('Speedrun · TGF-36 tabletop foundation', 'Blank editor, canonical target, paste disabled. Splits at geometry, attributes, mesh and BCs.'));
  if (!target) {
    comingSoon(root, '', 'The canonical TGF-36 speedrun target is being authored. Until then, sharpen up in the tracks and drills.', { href: '#/tracks/t10', label: 'Boss track' });
    return;
  }
  const body = h('div');
  root.appendChild(body);
  const render = () => {
    clear(body);
    const s = getSave();
    const pb = speedrunPB(s, cat);
    const runs = [...s.speedruns[cat]].sort((a, b) => a.timeMs - b.timeMs).slice(0, 20);
    const seg = h('div', { class: 'seg' }, ...(['any', 'hundred'] as Cat[]).map((c) => h('button', { class: c === cat ? 'active' : '', onclick: () => { cat = c; render(); } }, CAT_LABEL[c])));
    body.append(
      h('div', { class: 'grid c3', style: 'margin-bottom:16px' },
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Category'), seg,
          h('p', { class: 'muted small', style: 'margin-top:8px' }, cat === 'any' ? 'any%: match the target. Nothing else matters.' : `100%: match ∧ lines ≤ par (${target.parLines}) ∧ zero errors ∧ no reference peeks.`)),
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, `Personal best ${CAT_LABEL[cat]}`), h('div', { class: 'big-num' }, pb ? fmtTime(pb.timeMs) : '—'),
          pb ? h('div', { class: 'faint small' }, `${pb.technique} · ${pb.lines} lines · ${fmtDate(pb.t)}`) : h('div', { class: 'faint small' }, `par ${fmtTime(target.parTimeSeconds * 1000, false)}`)),
        h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Go'),
          h('a', { class: 'btn primary', href: `#/speedrun/run?cat=${cat}` }, `Start ${CAT_LABEL[cat]} run`),
          h('div', { class: 'row' },
            h('button', { class: 'small', onclick: () => exportRuns() }, 'Export runs'),
            h('button', { class: 'small', onclick: () => void importRuns().then(render) }, 'Import runs'))),
      ),
      pb ? h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'kicker' }, 'PB splits'), splitBar(pb.splits, pb.timeMs),
        h('div', { class: 'row small', style: 'margin-top:6px' }, ...(['geometry', 'attributes', 'mesh', 'bcs'] as Stage[]).map((st) => h('span', null, h('span', { style: `color:${STAGE_COLOR[st]}` }, '■ '), `${STAGE_LABEL[st]} ${fmtTime(pb.splits[st])}`)))) : '',
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, `Local leaderboard · ${CAT_LABEL[cat]} · top 20`),
        runs.length ? h('table', { class: 'tbl' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Time'), h('th', null, 'Technique'), h('th', { class: 'r' }, 'Lines'), h('th', { class: 'r' }, 'Errors'), h('th', { class: 'r' }, 'Peeks'), h('th', null, 'Date'), h('th', null, ''))),
          h('tbody', null, ...runs.map((r, i) => h('tr', null,
            h('td', null, String(i + 1)), h('td', { class: i === 0 ? 'accent' : '' }, fmtTime(r.timeMs)), h('td', null, h('span', { class: 'chip' }, r.technique)),
            h('td', { class: 'r' }, String(r.lines)), h('td', { class: 'r' }, String(r.errors)), h('td', { class: 'r' }, String(r.peeks)), h('td', { class: 'faint' }, fmtDate(r.t)),
            h('td', null, r.script ? h('button', { class: 'small ghost', onclick: () => { void navigator.clipboard?.writeText(r.script!); toast('Script copied.', { ms: 1200 }); } }, 'copy script') : null),
          )))) : h('div', { class: 'empty' }, 'No runs yet.')),
    );
  };
  render();
}

function splitBar(splits: Splits, total: number): SVGElement {
  const order: Stage[] = ['geometry', 'attributes', 'mesh', 'bcs'];
  let prev = 0;
  const segs: { label: string; value: number; color: string }[] = [];
  for (const st of order) {
    const t = splits[st];
    if (t === undefined) continue;
    segs.push({ label: STAGE_LABEL[st], value: Math.max(0, t - prev), color: STAGE_COLOR[st] });
    prev = Math.max(prev, t);
  }
  if (total > prev) segs.push({ label: 'finish', value: total - prev, color: 'var(--fg-faint)' });
  return stackedBar(segs, 600, 12);
}

function exportRuns() {
  const s = getSave();
  downloadText(`apdl-dojo-speedruns-${isoDate()}.json`, JSON.stringify({ app: 'apdl-dojo', kind: 'speedruns', speedruns: s.speedruns }, null, 2));
}

async function importRuns() {
  const text = await pickFile();
  if (!text) return;
  try {
    const data = JSON.parse(text);
    const sr = data.speedruns ?? data.save?.speedruns;
    if (!sr || !Array.isArray(sr.any)) throw new Error('No speedruns in file.');
    let added = 0;
    updateSave((s) => {
      for (const cat of ['any', 'hundred'] as Cat[]) {
        const ids = new Set(s.speedruns[cat].map((r) => r.id));
        for (const r of (sr[cat] ?? []) as SpeedrunRecord[]) {
          if (typeof r?.timeMs !== 'number' || ids.has(r.id)) continue;
          s.speedruns[cat].push(r);
          added++;
        }
      }
    });
    toast(`Imported ${added} run(s).`, { kind: 'ok' });
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Import failed.', { kind: 'err' });
  }
}

export function speedrunRunPage({ root, query }: RouteCtx) {
  const target = getChallenge(SPEEDRUN_TARGET_ID);
  if (!target) {
    comingSoon(padded(root), 'Speedrun', 'The speedrun target has not been authored yet.', { href: '#/speedrun', label: 'Back' });
    return;
  }
  const cat: Cat = query.get('cat') === 'hundred' ? 'hundred' : 'any';
  const prm = defaultParams(target.params);
  const pbRec = speedrunPB(getSave(), cat);
  let splits: Splits = {};
  let stages: Stage[] = ['geometry', 'attributes', 'mesh', 'bcs'];
  const side = h('div', { class: 'splits', style: 'padding:6px 12px;border-top:1px solid var(--line)' });
  const renderSplits = (t: number) => {
    clear(side);
    side.appendChild(h('div', { class: 'sp faint xs' }, h('span', null, `SPLITS · ${CAT_LABEL[cat]}`), h('span', null, 'time'), h('span', null, pbRec ? 'vs PB' : '')));
    for (const r of splitRows(splits, pbRec?.splits, stages)) {
      const live = r.time === undefined && r.pb !== undefined && t > 0 ? t - r.pb : undefined;
      const d = r.delta ?? (live !== undefined && live > 0 ? live : undefined);
      side.appendChild(h('div', { class: `sp ${r.time !== undefined ? 'done' : ''}` },
        h('span', { class: 'n' }, STAGE_LABEL[r.stage]),
        h('span', null, r.time !== undefined ? fmtTime(r.time) : '—'),
        h('span', { class: `d ${d === undefined ? '' : d <= 0 ? 'ahead' : 'behind'}` }, fmtDelta(d)),
      ));
    }
  };
  renderSplits(0);
  let tick: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;
  const cleanup = mountAttempt(root, {
    key: `speedrun:${cat}`,
    mode: 'speedrun',
    title: `Speedrun ${CAT_LABEL[cat]} · ${target.title}`,
    brief: fillBrief(target.brief, prm),
    targetScript: withParams(target.targetScript, prm),
    parLines: target.parLines,
    parTimeSeconds: target.parTimeSeconds,
    required: [],
    forbidden: [],
    hints: [],
    grading: target.grading,
    solution: target.solution,
    pasteBlocked: true,
    drafts: false,
    noStars: true,
    side,
    backHref: `#/speedrun?cat=${cat}`,
    nextHref: `#/speedrun?cat=${cat}`,
    nextLabel: 'Leaderboard',
    onStart: () => {
      startedAt = performance.now();
      tick = setInterval(() => renderSplits(performance.now() - startedAt), 250);
    },
    onReset: () => {
      splits = {};
      if (tick) clearInterval(tick);
      tick = null;
      renderSplits(0);
    },
    onRun: (score, tMs, session) => {
      if (!score || !session.running) return;
      stages = presentStages(score);
      splits = updateSplits(splits, score, tMs);
      renderSplits(tMs);
    },
    onClear: (x) => {
      if (tick) clearInterval(tick);
      splits = updateSplits(splits, x.score, x.timeMs);
      for (const st of stages) if (splits[st] === undefined) splits[st] = x.timeMs;
      renderSplits(x.timeMs);
      const hundredOk = x.lines <= target.parLines && x.session.errorsAcrossRuns === 0 && x.session.peeks === 0 && x.result.diagnostics.every((d) => d.severity !== 'error');
      const rec: SpeedrunRecord = {
        id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        t: Date.now(), category: 'any', timeMs: x.timeMs, lines: x.lines, errors: x.session.errorsAcrossRuns, peeks: x.session.peeks,
        splits, technique: techniqueTag(x.commands), commands: x.commands, script: x.script,
      };
      let r!: ReturnType<typeof recordSpeedrun>;
      updateSave((s) => { r = recordSpeedrun(s, rec, hundredOk, isoDate()); });
      const reasons: string[] = [];
      if (x.lines > target.parLines) reasons.push(`lines ${x.lines} > par ${target.parLines}`);
      if (x.session.errorsAcrossRuns > 0) reasons.push('errors in runs');
      if (x.session.peeks > 0) reasons.push('reference peeks');
      return {
        title: cat === 'hundred' && !hundredOk ? 'Finished (any% only)' : `Finished ${hundredOk ? '100%' : 'any%'}`,
        xp: r.xp, achievements: r.achievements, isPB: r.isPB,
        extra: h('div', { style: 'margin-top:16px' },
          h('h3', null, `Technique: ${rec.technique}`),
          cat === 'hundred' && !hundredOk ? h('p', { class: 'warn small' }, `Not 100%: ${reasons.join(', ')}.`) : null,
          splitBar(splits, x.timeMs)),
      };
    },
  });
  return () => {
    if (tick) clearInterval(tick);
    cleanup();
  };
}
