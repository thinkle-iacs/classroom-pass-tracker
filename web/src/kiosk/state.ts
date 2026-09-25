// Pure kiosk-side derivations from the display doc and the server-corrected clock.
// The display carries absolute block times, so no timezone math happens here.
import { availability, escalation, type Availability, type DisplayDoc, type Escalation } from '@pass/shared';

export interface Millis { toMillis(): number }
export type KioskDisplay = DisplayDoc<Millis>;

export function kioskAvailability(display: KioskDisplay, serverNow: number): Availability {
  const block = display.block;
  const nowMinutes = block ? block.startMinutes + (serverNow - block.startAt) / 60000 : 0;
  return availability({ paused: display.paused, block, manual: display.manual, nowMinutes, settings: display.settings });
}

/** "Everyone's here" counts from the last return, but restarts each class. */
export function togetherSince(display: KioskDisplay): number | null {
  if (display.active || !display.sectionTitle) return null;
  const since = display.togetherSince?.toMillis() ?? null;
  const start = display.block?.startAt ?? null;
  if (since == null) return start;
  return start == null ? since : Math.max(since, start);
}

export interface OutState { name: string; elapsedMs: number; level: Escalation }
export function outState(display: KioskDisplay, serverNow: number): OutState | null {
  if (!display.active) return null;
  const elapsedMs = Math.max(0, serverNow - display.active.departedAt.toMillis());
  return { name: display.active.name, elapsedMs, level: escalation(elapsedMs, display.settings) };
}
