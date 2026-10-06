// Subtle confetti, personal bests only: 40 particles, ~900 ms.
import confetti from 'canvas-confetti';

export function pbConfetti(): void {
  try {
    void confetti({
      particleCount: 40,
      spread: 55,
      startVelocity: 28,
      ticks: 54,
      gravity: 1.1,
      scalar: 0.8,
      origin: { x: 0.5, y: 0.35 },
      colors: ['#ffb000', '#4cc9f0', '#3ddc97', '#d7dee9'],
      disableForReducedMotion: true,
    });
  } catch {
    /* no canvas */
  }
}
