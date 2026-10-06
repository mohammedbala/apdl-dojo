// Leitner spaced repetition: 6 boxes, intervals [0,1,3,7,14,30] days, box 5 = mastered.
import { addDays } from './streak';

export const INTERVALS = [0, 1, 3, 7, 14, 30] as const;
export const MASTERED_BOX = 5;
export const MAX_REVIEWS_PER_SESSION = 40;
export const MAX_NEW_PER_DAY = 10;

export interface LeitnerCard {
  box: number;
  /** ISO date when due */
  due: string;
  reviews: number;
  lapses: number;
  lastReview?: string;
}

export function newCard(today: string): LeitnerCard {
  return { box: 0, due: today, reviews: 0, lapses: 0 };
}

export function review(card: LeitnerCard, correct: boolean, today: string): LeitnerCard {
  const box = correct ? Math.min(MASTERED_BOX, card.box + 1) : 0;
  return {
    box,
    due: addDays(today, INTERVALS[box]),
    reviews: card.reviews + 1,
    lapses: card.lapses + (correct ? 0 : 1),
    lastReview: today,
  };
}

export function isDue(card: LeitnerCard, today: string): boolean {
  return card.due <= today;
}

export function isMastered(card: LeitnerCard): boolean {
  return card.box >= MASTERED_BOX;
}

/**
 * Build a review queue: due cards first (lowest box, oldest due), then up to `newAllowance` unseen ids.
 */
export function buildQueue(
  allIds: readonly string[],
  cards: Record<string, LeitnerCard>,
  today: string,
  newAllowance: number,
  max = MAX_REVIEWS_PER_SESSION,
): { id: string; isNew: boolean }[] {
  const due = allIds
    .filter((id) => cards[id] && isDue(cards[id], today))
    .sort((a, b) => cards[a].box - cards[b].box || cards[a].due.localeCompare(cards[b].due));
  const fresh = allIds.filter((id) => !cards[id]).slice(0, Math.max(0, newAllowance));
  return [...due.map((id) => ({ id, isNew: false })), ...fresh.map((id) => ({ id, isNew: true }))].slice(0, max);
}
