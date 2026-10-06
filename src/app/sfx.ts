// Muted WebAudio blips. OFF by default (settings.sound).
import { getSettings } from './persist';

let ctx: AudioContext | null = null;

type Sound = 'ok' | 'err' | 'clear' | 'tick' | 'pb';

const SOUNDS: Record<Sound, [number, number, number][]> = {
  // [frequency Hz, start s, duration s]
  ok: [[880, 0, 0.05]],
  err: [[220, 0, 0.08]],
  tick: [[1320, 0, 0.02]],
  clear: [[660, 0, 0.07], [880, 0.08, 0.07], [1100, 0.16, 0.1]],
  pb: [[880, 0, 0.06], [1175, 0.07, 0.06], [1568, 0.14, 0.12]],
};

export function play(s: Sound): void {
  if (!getSettings().sound) return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    for (const [f, st, d] of SOUNDS[s]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + st);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + st + d);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + st);
      o.stop(t0 + st + d + 0.02);
    }
  } catch {
    /* audio unavailable */
  }
}
