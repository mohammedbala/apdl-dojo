// Safe wrapper around the teammate-owned Viewport: never throws, shows a fallback message instead.
import { Viewport } from '../engine';
import type { ModelState, ViewHint, ViewMode, ViewPreset } from '../engine';
import { h } from './dom';

export type Mode = 'yours' | 'target' | 'split' | 'ghost';

export class SafeViewer {
  vp: InstanceType<typeof Viewport> | null = null;
  private fallback: HTMLElement | null = null;
  mode: Mode;
  /** called when the mode changes from the viewport's own toolbar (not from setMode) */
  onUserMode?: (m: Mode) => void;
  private programmatic = false;

  constructor(readonly host: HTMLElement, mode: Mode = 'yours', toolbar = true) {
    this.mode = mode;
    try {
      this.vp = new Viewport(host, { toolbar, mode: mode as ViewMode });
      this.vp.onModeChange = (m: ViewMode) => {
        this.mode = m as Mode;
        if (!this.programmatic) this.onUserMode?.(m as Mode);
      };
    } catch (e) {
      console.error('Viewport failed to start', e);
      this.fallback = h('div', { class: 'vp-fallback' }, `3-D viewer unavailable: ${e instanceof Error ? e.message : String(e)}`);
      host.appendChild(this.fallback);
    }
  }

  private call(fn: (v: InstanceType<typeof Viewport>) => void): void {
    if (!this.vp) return;
    try {
      fn(this.vp);
    } catch (e) {
      console.error('Viewport error', e);
    }
  }

  setModel(m: ModelState | null, hints?: ViewHint[]): void {
    this.call((v) => v.setModel(m, hints));
  }
  setTarget(m: ModelState | null): void {
    this.call((v) => v.setTarget(m));
  }
  setMode(mode: Mode): void {
    this.mode = mode;
    this.programmatic = true;
    this.call((v) => v.setMode(mode as ViewMode));
    this.programmatic = false;
  }
  setView(p: string): void {
    this.call((v) => v.setView(p as ViewPreset));
  }
  fit(): void {
    this.call((v) => v.fit());
  }
  resize(): void {
    this.call((v) => v.resize());
  }
  dispose(): void {
    this.call((v) => v.dispose());
    this.vp = null;
  }
}
