// Content registries. Lessons/challenges live in per-track modules so authors can work in parallel.
import type { Challenge, ErrorHunt, Lesson, Track, TrackId } from './types';
import { TRACKS } from './tracks';
import { drills as allDrills } from './drills';
import { errorHunts as allErrorHunts } from './errorhunt';
import { lessons as l1 } from './lessons/t1';
import { challenges as c1 } from './challenges/t1';
import { lessons as l2 } from './lessons/t2';
import { challenges as c2 } from './challenges/t2';
import { lessons as l3 } from './lessons/t3';
import { challenges as c3 } from './challenges/t3';
import { lessons as l4 } from './lessons/t4';
import { challenges as c4 } from './challenges/t4';
import { lessons as l5 } from './lessons/t5';
import { challenges as c5 } from './challenges/t5';
import { lessons as l6 } from './lessons/t6';
import { challenges as c6 } from './challenges/t6';
import { lessons as l7 } from './lessons/t7';
import { challenges as c7 } from './challenges/t7';
import { lessons as l8 } from './lessons/t8';
import { challenges as c8 } from './challenges/t8';
import { lessons as l9 } from './lessons/t9';
import { challenges as c9 } from './challenges/t9';
import { lessons as l10 } from './lessons/t10';
import { challenges as c10 } from './challenges/t10';

export const SPEEDRUN_TARGET_ID = 't10-speedrun';

export const lessons: Lesson[] = [l1, l2, l3, l4, l5, l6, l7, l8, l9, l10].flat().sort((a, b) => a.order - b.order);
export const challenges: Challenge[] = [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10].flat();
export const drills = allDrills;
export const errorHunts: ErrorHunt[] = allErrorHunts;

/** Tracks with lessonIds filled from the lesson registry (plus any ids already declared). */
export const tracks: Track[] = TRACKS.map((t) => ({
  ...t,
  lessonIds: [...new Set([...t.lessonIds, ...lessons.filter((l) => l.track === t.id).map((l) => l.id)])],
}));

const challengeById = new Map(challenges.map((c) => [c.id, c]));
const lessonById = new Map(lessons.map((l) => [l.id, l]));
const trackById = new Map(tracks.map((t) => [t.id, t]));
const huntById = new Map(errorHunts.map((h) => [h.id, h]));

export function getChallenge(id: string): Challenge | undefined {
  return challengeById.get(id);
}
export function getLesson(id: string): Lesson | undefined {
  return lessonById.get(id);
}
export function getTrack(id: string): Track | undefined {
  return trackById.get(id as TrackId);
}
export function getErrorHunt(id: string): ErrorHunt | undefined {
  return huntById.get(id);
}

/** Challenges of a track in order. The speedrun target is excluded (it has its own page). */
export function challengesForTrack(t: TrackId | string): Challenge[] {
  return challenges.filter((c) => c.track === t && c.id !== SPEEDRUN_TARGET_ID).sort((a, b) => a.order - b.order);
}

export function lessonsForTrack(t: TrackId | string): Lesson[] {
  return lessons.filter((l) => l.track === t).sort((a, b) => a.order - b.order);
}

/** Lesson that lists a challenge, if any. */
export function lessonForChallenge(id: string): Lesson | undefined {
  return lessons.find((l) => l.challengeIds.includes(id));
}

/** Effective forbidden/required lists: challenge overrides track defaults. */
export function effectiveRules(c: Challenge): { forbidden: string[]; required: string[] } {
  const t = getTrack(c.track);
  return {
    forbidden: c.forbiddenCommands ?? t?.defaultForbidden ?? [],
    required: c.requiredCommands ?? t?.defaultRequired ?? [],
  };
}

/** Next challenge in the same track (by order), then the first of the next track. */
export function nextChallenge(id: string): Challenge | undefined {
  const c = getChallenge(id);
  if (!c) return undefined;
  const list = challengesForTrack(c.track);
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0 && i < list.length - 1) return list[i + 1];
  const ti = tracks.findIndex((t) => t.id === c.track);
  for (const t of tracks.slice(ti + 1)) {
    const l = challengesForTrack(t.id);
    if (l.length) return l[0];
  }
  return undefined;
}

export function dailyPool(): Challenge[] {
  const tagged = challenges.filter((c) => c.tags.includes('daily') && c.id !== SPEEDRUN_TARGET_ID);
  return tagged.length ? tagged : challenges.filter((c) => c.id !== SPEEDRUN_TARGET_ID);
}
