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

/** A tap the server hasn't confirmed yet. The kiosk shows its result right away. */
export type PendingTap = { kind: 'out'; k: string; name: string; at: number } | { kind: 'in'; k: string; at: number };

const millis = (ms: number): Millis => ({ toMillis: () => ms });

/** The display as it will look once the pending tap lands. */
export function withPending(display: KioskDisplay, pending: PendingTap | null): KioskDisplay {
  if (!pending || pendingSettled(display, pending)) return display;
  return pending.kind === 'out'
    ? { ...display, active: { k: pending.k, name: pending.name, departedAt: millis(pending.at) } }
    : { ...display, active: null, togetherSince: millis(pending.at) };
}

/** Has the server's display caught up with the tap? */
export function pendingSettled(display: KioskDisplay, pending: PendingTap): boolean {
  return pending.kind === 'out' ? display.active?.k === pending.k : display.active?.k !== pending.k;
}
