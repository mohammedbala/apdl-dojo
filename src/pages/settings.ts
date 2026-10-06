// #/settings — sound, unlock-all, export / import (Replace or Merge) / reset.
import type { RouteCtx } from '../app/router';
import { getSettings, updateSettings, exportJson, exportFileName, importJson, resetSave, corruptBackupKey, getSave } from '../app/persist';
import { h, downloadText, pickFile, clear } from '../ui/dom';
import { confirmModal, choiceModal } from '../ui/components/modal';
import { toast } from '../ui/components/toast';
import { play } from '../app/sfx';
import { pageHead } from './common';

export function settingsPage({ root }: RouteCtx) {
  root.appendChild(pageHead('Settings', 'Progress lives in this browser (localStorage). Export regularly if it matters to you.'));
  const body = h('div', { class: 'stack', style: 'max-width:720px' });
  root.appendChild(body);
  const render = () => {
    clear(body);
    const st = getSettings();
    const toggle = (label: string, desc: string, on: boolean, set: (v: boolean) => void) => h('div', { class: 'card row between' },
      h('div', null, h('div', null, label), h('div', { class: 'faint small' }, desc)),
      h('button', { class: on ? 'active' : '', onclick: () => { set(!on); render(); } }, on ? 'On' : 'Off'));
    const s = getSave();
    body.append(
      toggle('Sound', 'Muted blips on run, error and clear (WebAudio).', st.sound, (v) => { updateSettings({ sound: v }); if (v) play('ok'); }),
      toggle('Unlock all tracks', 'Ignore unlock rules for t7–t10.', st.unlockAll, (v) => updateSettings({ unlockAll: v })),
      toggle('Argument hints', 'While typing a command, show its fields, what the current one means and its allowed values.', st.argHints, (v) => updateSettings({ argHints: v })),
      h('div', { class: 'card stack' },
        h('div', null, 'Save data'),
        h('div', { class: 'faint small' }, `${s.xp.total} XP · ${Object.keys(s.challenges).length} challenges touched · ${s.drills.sessions.length} drill sessions · ${s.speedruns.any.length} speedruns · created ${new Date(s.createdAt).toLocaleDateString()}`),
        corruptBackupKey() ? h('div', { class: 'warn small' }, `A corrupt save was found at startup and kept as ${corruptBackupKey()}.`) : null,
        h('div', { class: 'row' },
          h('button', { onclick: () => { downloadText(exportFileName(), exportJson()); toast('Exported.', { kind: 'ok' }); } }, 'Export JSON'),
          h('button', { onclick: () => void doImport().then(render) }, 'Import JSON…'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'danger', onclick: () => void doReset().then(render) }, 'Reset progress…'),
        ),
      ),
    );
  };
  render();
}

async function doImport() {
  const text = await pickFile();
  if (!text) return;
  const mode = await choiceModal('Import save', 'Replace discards current progress. Merge keeps the best of both (max XP and stars, min times, union of achievements and runs).', [
    { id: 'merge', label: 'Merge', primary: true },
    { id: 'replace', label: 'Replace' },
  ]);
  if (!mode) return;
  try {
    importJson(text, mode);
    toast(mode === 'merge' ? 'Merged.' : 'Replaced.', { kind: 'ok' });
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Import failed.', { kind: 'err' });
  }
}

async function doReset() {
  const ok = await confirmModal('Reset all progress?', 'XP, records, streak, cards and achievements will be cleared. A backup copy is kept in localStorage.', 'Reset', true);
  if (!ok) return;
  resetSave();
  toast('Progress reset.', { kind: 'ok' });
}
