import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@pass/shared';
import { kioskAvailability, outState, togetherSince, type KioskDisplay } from './state';

const ms = (n: number) => ({ toMillis: () => n });
const START = 1_000_000_000_000;
const MIN = 60_000;
const display = (over: Partial<KioskDisplay> = {}): KioskDisplay => ({
  sectionTitle: 'English 10', blockLabel: 'B Block',
  block: { startMinutes: 580, endMinutes: 662, startAt: START, endAt: START + 82 * MIN },
  manual: false, paused: false, roster: [], active: null, togetherSince: ms(START - 30 * MIN),
  settings: DEFAULT_SETTINGS, updatedAt: ms(START), ...over,
});

describe('kiosk state', () => {
  it('opens passes between the first and last ten minutes', () => {
    expect(kioskAvailability(display(), START + 5 * MIN).reason).toBe('start-of-class');
    expect(kioskAvailability(display(), START + 10 * MIN).allowed).toBe(true);
    expect(kioskAvailability(display(), START + 75 * MIN).reason).toBe('end-of-class');
    expect(kioskAvailability(display({ paused: true }), START + 30 * MIN).reason).toBe('paused');
    expect(kioskAvailability(display({ block: null, manual: true }), START).allowed).toBe(true);
    expect(kioskAvailability(display({ block: null, sectionTitle: null }), START).reason).toBe('no-class');
  });
  it('together time restarts with each class', () => {
    expect(togetherSince(display())).toBe(START);
    expect(togetherSince(display({ togetherSince: ms(START + 20 * MIN) }))).toBe(START + 20 * MIN);
    expect(togetherSince(display({ block: null, manual: true }))).toBe(START - 30 * MIN);
    expect(togetherSince(display({ sectionTitle: null }))).toBeNull();
  });
  it('escalates by elapsed time from the stored departure', () => {
    const out = display({ active: { k: 'abc', name: 'Maya R.', departedAt: ms(START) } });
    expect(outState(out, START + 4 * MIN)?.level).toBe('normal');
    expect(outState(out, START + 5 * MIN)?.level).toBe('warning');
    expect(outState(out, START + 15 * MIN)?.level).toBe('critical');
    expect(outState(out, START - 5000)?.elapsedMs).toBe(0);
    expect(outState(display(), START)).toBeNull();
  });
});
