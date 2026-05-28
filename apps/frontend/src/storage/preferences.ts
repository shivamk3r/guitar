export const TIMED_PRACTICE_COUNT_IN_OPTIONS = [0, 2, 4, 8] as const;

export type TimedPracticeCountInBeats = (typeof TIMED_PRACTICE_COUNT_IN_OPTIONS)[number];

export const DEFAULT_TIMED_PRACTICE_COUNT_IN_BEATS: TimedPracticeCountInBeats = 4;

export function normalizeTimedPracticeCountInBeats(value: unknown): TimedPracticeCountInBeats {
  return TIMED_PRACTICE_COUNT_IN_OPTIONS.includes(value as TimedPracticeCountInBeats)
    ? (value as TimedPracticeCountInBeats)
    : DEFAULT_TIMED_PRACTICE_COUNT_IN_BEATS;
}
