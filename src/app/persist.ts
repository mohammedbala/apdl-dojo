// localStorage persistence: versioned SaveV1, corrupt-blob backup, debounced save, export/import.
import { createStore, type Store } from './store';
import { migrate, normalizeSave } from './migrations';
import { defaultSettings, emptySave, LIMITS, type SaveV1, type Settings, type SpeedrunRecord, XP_SOURCES } from './schema';

export const KEY_SAVE = 'apdl-dojo:save';
export const KEY_SETTINGS = 'apdl-dojo:settings';
export const KEY_DRAFT = (id: string) => `apdl-dojo:draft:${id}`;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const memory = new Map<string, string>();
const memoryKV: KV = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

function kv(): KV {
  try {
    const ls = (globalThis as { localStorage?: KV }).localStorage;
    if (ls) return ls;
  } catch {
    /* blocked */
  }
  return memoryKV;
}

function safeSet(k: string, v: string): boolean {
  try {
    kv().setItem(k, v);
    return true;
  } catch (e) {
    console.warn('APDL Dojo: could not write', k, e);
    return false;
  }
}

export interface LoadResult {
  save: SaveV1;
  /** key the corrupt blob was copied to, if any */
  corruptBackup?: string;
}

export function loadSaveFrom(store: KV = kv(), now = Date.now()): LoadResult {
  let raw: string | null = null;
  try {
    raw = store.getItem(KEY_SAVE);
  } catch {
    raw = null;
  }
  if (!raw) return { save: emptySave(now) };
  try {
    return { save: migrate(JSON.parse(raw)) };
  } catch (e) {
    const backup = `${KEY_SAVE}.corrupt-${now}`;
    try {
      store.setItem(backup, raw);
    } catch {
      /* ignore */
    }
    console.warn('APDL Dojo: save could not be read, backed up to', backup, e);
    return { save: emptySave(now), corruptBackup: backup };
  }
}

/** Trim unbounded arrays before writing. */
export function compact(s: SaveV1): SaveV1 {
  if (s.xp.log.length > LIMITS.xpLog) s.xp.log = s.xp.log.slice(-LIMITS.xpLog);
  if (s.drills.sessions.length > LIMITS.drillSessions) s.drills.sessions = s.drills.sessions.slice(-LIMITS.drillSessions);
  for (const cat of ['any', 'hundred'] as const) s.speedruns[cat] = trimRuns(s.speedruns[cat]);
  return s;
}

function trimRuns(runs: SpeedrunRecord[]): SpeedrunRecord[] {
  const sorted = [...runs].sort((a, b) => a.timeMs - b.timeMs);
  const keep = new Set(sorted.slice(0, LIMITS.speedruns).map((r) => r.id));
  const top = new Set(sorted.slice(0, LIMITS.speedrunScripts).map((r) => r.id));
  return runs.filter((r) => keep.has(r.id)).map((r) => (top.has(r.id) ? r : { ...r, script: undefined }));
}

// ------------------------------------------------------------------ live store
let saveStore: Store<SaveV1> | null = null;
let settingsStore: Store<Settings> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastCorrupt: string | undefined;

export function initPersistence(): { corruptBackup?: string } {
  const { save, corruptBackup } = loadSaveFrom();
  lastCorrupt = corruptBackup;
  saveStore = createStore(save);
  settingsStore = createStore(loadSettings());
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
  }
  return { corruptBackup };
}

export function saveState(): Store<SaveV1> {
  if (!saveStore) saveStore = createStore(loadSaveFrom().save);
  return saveStore;
}

export function getSave(): SaveV1 {
  return saveState().get();
}

/** Mutate the save in place; schedules a debounced write and notifies subscribers. */
export function updateSave(fn: (s: SaveV1) => void): void {
  saveState().update((s) => {
    fn(s);
    return s;
  });
  scheduleSave();
}

export function scheduleSave(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

export function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!saveStore) return;
  safeSet(KEY_SAVE, JSON.stringify(compact(saveStore.get())));
}

export function corruptBackupKey(): string | undefined {
  return lastCorrupt;
}

// ------------------------------------------------------------------ settings
export function loadSettings(): Settings {
  try {
    const raw = kv().getItem(KEY_SETTINGS);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultSettings();
}

export function settingsState(): Store<Settings> {
  if (!settingsStore) settingsStore = createStore(loadSettings());
  return settingsStore;
}

export function getSettings(): Settings {
  return settingsState().get();
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsState().update((s) => ({ ...s, ...patch }));
  safeSet(KEY_SETTINGS, JSON.stringify(settingsState().get()));
}

// ------------------------------------------------------------------ drafts
export function getDraft(id: string): string | null {
  try {
    return kv().getItem(KEY_DRAFT(id));
  } catch {
    return null;
  }
}
export function setDraft(id: string, text: string): void {
  if (!text.trim()) {
    try { kv().removeItem(KEY_DRAFT(id)); } catch { /* ignore */ }
    return;
  }
  safeSet(KEY_DRAFT(id), text);
}

// ------------------------------------------------------------------ export / import
export function exportFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `apdl-dojo-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export function exportJson(): string {
  flush();
  return JSON.stringify({ app: 'apdl-dojo', exportedAt: new Date().toISOString(), save: getSave(), settings: getSettings() }, null, 2);
}

function maxNull(a: number | null, b: number | null, pick: (x: number, y: number) => number): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return pick(a, b);
}

/** Merge two saves: max XP/stars, min times, union of achievements/runs/daily, max Leitner box. */
export function mergeSaves(a: SaveV1, b: SaveV1): SaveV1 {
  const out = normalizeSave(JSON.parse(JSON.stringify(a)));
  // XP: keep the larger total per source; log is the union by (t, source, amount)
  for (const src of XP_SOURCES) out.xp.bySource[src] = Math.max(a.xp.bySource[src] ?? 0, b.xp.bySource[src] ?? 0);
  out.xp.total = Math.max(a.xp.total, b.xp.total, XP_SOURCES.reduce((s, k) => s + out.xp.bySource[k], 0));
  const logKey = (e: { t: number; source: string; amount: number }) => `${e.t}|${e.source}|${e.amount}`;
  const logs = new Map([...a.xp.log, ...b.xp.log].map((e) => [logKey(e), e]));
  out.xp.log = [...logs.values()].sort((x, y) => x.t - y.t);
  // challenges
  for (const [id, rb] of Object.entries(b.challenges)) {
    const ra = out.challenges[id];
    if (!ra) { out.challenges[id] = rb; continue; }
    const bTimeBetter = rb.bestTimeMs != null && (ra.bestTimeMs == null || rb.bestTimeMs < ra.bestTimeMs);
    out.challenges[id] = {
      attempts: Math.max(ra.attempts, rb.attempts),
      clears: Math.max(ra.clears, rb.clears),
      firstClearAt: maxNull(ra.firstClearAt, rb.firstClearAt, Math.min),
      bestStars: Math.max(ra.bestStars, rb.bestStars) as 0 | 1 | 2 | 3,
      bestTimeMs: maxNull(ra.bestTimeMs, rb.bestTimeMs, Math.min),
      bestLines: maxNull(ra.bestLines, rb.bestLines, Math.min),
      ghost: bTimeBetter ? rb.ghost : ra.ghost,
      lastAttemptAt: Math.max(ra.lastAttemptAt ?? 0, rb.lastAttemptAt ?? 0) || undefined,
      commands: [...new Set([...(ra.commands ?? []), ...(rb.commands ?? [])])],
      etypes: [...new Set([...(ra.etypes ?? []), ...(rb.etypes ?? [])])],
    };
  }
  // drills
  for (const [id, cb] of Object.entries(b.drills.cards)) {
    const ca = out.drills.cards[id];
    if (!ca || cb.box > ca.box || (cb.box === ca.box && cb.due > ca.due)) out.drills.cards[id] = cb;
  }
  const sess = new Map([...a.drills.sessions, ...b.drills.sessions].map((s) => [`${s.t}|${s.commands}`, s]));
  out.drills.sessions = [...sess.values()].sort((x, y) => x.t - y.t);
  for (const [cmd, sb] of Object.entries(b.drills.commandStats)) {
    const sa = out.drills.commandStats[cmd];
    if (!sa || sb.attempts > sa.attempts) out.drills.commandStats[cmd] = sb;
  }
  // speedruns
  for (const cat of ['any', 'hundred'] as const) {
    const m = new Map([...a.speedruns[cat], ...b.speedruns[cat]].map((r) => [r.id, r]));
    out.speedruns[cat] = [...m.values()].sort((x, y) => x.t - y.t);
  }
  // daily
  for (const [d, rb] of Object.entries(b.daily)) {
    const ra = out.daily[d];
    if (!ra || rb.stars > ra.stars) out.daily[d] = rb;
  }
  // streak
  const hist = [...new Set([...a.streak.history, ...b.streak.history])].sort();
  const frozen = [...new Set([...a.streak.frozen, ...b.streak.frozen])].sort();
  const sb = (b.streak.lastActiveDate ?? '') > (a.streak.lastActiveDate ?? '') ? b.streak : a.streak;
  out.streak = { ...sb, longest: Math.max(a.streak.longest, b.streak.longest), history: hist, frozen };
  // achievements: union, earliest unlock wins
  for (const [id, t] of Object.entries(b.achievements)) out.achievements[id] = Math.min(out.achievements[id] ?? Infinity, t);
  // error hunts
  for (const [id, rb] of Object.entries(b.errorHunt)) {
    const ra = out.errorHunt[id];
    out.errorHunt[id] = !ra ? rb : {
      attempts: Math.max(ra.attempts, rb.attempts),
      clears: Math.max(ra.clears, rb.clears),
      bestTimeMs: maxNull(ra.bestTimeMs, rb.bestTimeMs, Math.min),
    };
  }
  out.createdAt = Math.min(a.createdAt, b.createdAt);
  return compact(out);
}

/** Parse an export file (or a raw SaveV1 blob). Throws with a readable message. */
export function parseImport(json: string): { save: SaveV1; settings?: Partial<import('./schema').Settings> } {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const raw = data && typeof data === 'object' && 'save' in data ? data.save : data;
  return { save: migrate(raw), settings: data?.settings };
}

export function importJson(json: string, mode: 'replace' | 'merge'): void {
  const { save, settings } = parseImport(json);
  const next = mode === 'replace' ? save : mergeSaves(getSave(), save);
  saveState().set(next);
  if (mode === 'replace' && settings) updateSettings(settings);
  flush();
}

export function resetSave(): void {
  flush();
  const cur = kv().getItem(KEY_SAVE);
  if (cur) safeSet(`${KEY_SAVE}.reset-${Date.now()}`, cur);
  saveState().set(emptySave());
  flush();
}
