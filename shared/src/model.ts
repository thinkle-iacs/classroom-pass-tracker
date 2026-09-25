// Firestore document shapes. `T` is the timestamp type: Firestore Timestamp on
// the wire, millis once converted. Collections and who may read them:
//
//   teachers/{uid}                           teacher (own)      -- profile, settings, roomId
//   teachers/{uid}/sections/{sectionKey}     teacher (own)      -- synced from Aspen
//   teachers/{uid}/students/{appStudentId}   teacher (own)      -- names + display override
//   rooms/{roomId}                           teacher (owner)    -- private live state
//   displays/{roomId}                        paired kiosk, teacher -- kiosk-safe projection ONLY
//   kiosks/{kioskId}                         teacher (owner)    -- paired devices
//   passes/{passId}                          teacher (owner)    -- the historical record
//   studentIdentities/{hash}                 nobody (Functions) -- Aspen id -> app id
//   pairingCodes/{code}                      nobody (Functions)
//
// Every write goes through a callable Function. Clients only read.
import { z } from 'zod';

/** Kiosk screensaver drawings (everyone-present state). */
export const SCREENSAVERS = {
  sierpinski: 'Sierpiński tetrahedron (3D)',
  triangle: 'Sierpiński triangle',
  stitching: 'Curve stitching (lines between axes)',
  koch: 'Koch snowflake',
  tree: 'Fractal tree',
} as const;
export type Screensaver = keyof typeof SCREENSAVERS;
const screensaverIds = Object.keys(SCREENSAVERS) as [Screensaver, ...Screensaver[]];

export const settingsSchema = z.object({
  warningAfterMinutes: z.number().min(1).max(60),
  attendanceThresholdMinutes: z.number().min(2).max(120),
  noPassFirstMinutes: z.number().min(0).max(40),
  noPassLastMinutes: z.number().min(0).max(40),
  // Optional on input so settings saved before this existed still parse.
  screensaver: z.enum(screensaverIds).default('sierpinski'),
}).refine((s) => s.attendanceThresholdMinutes > s.warningAfterMinutes, { message: 'The attendance threshold must be later than the warning.' });
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  warningAfterMinutes: 5,
  attendanceThresholdMinutes: 15,
  noPassFirstMinutes: 10,
  noPassLastMinutes: 10,
  screensaver: 'sierpinski',
};

/** Stored settings may predate newer fields; fill them from the defaults. */
export function withDefaults(settings: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...settings };
}

export interface TeacherDoc<T = number> {
  email: string;
  name: string;
  roomId: string;
  settings: Settings;
  lastSyncAt: T | null;
  /** Denormalized from sections/* at sync so heartbeats can resolve the block in one read. */
  sections: SectionSummary[];
}

export interface SectionSummary { key: string; title: string; grades: string[]; meetings: { day: number; periodId: string }[] }

export interface SectionDoc<T = number> {
  title: string;
  classCode: string | null;
  grades: string[];
  periods: string[];
  meetings: { day: number; periodId: string }[];
  studentIds: string[]; // app student ids
  aspenClassId: string; // teacher-only; never copied to displays/*
  syncedAt: T;
}

export interface RosterStudentDoc {
  givenName: string;
  familyName: string;
  defaultDisplayName: string;
  displayNameOverride: string | null;
  sectionKeys: string[];
}

export interface CurrentSection {
  sectionKey: string;
  label: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  /** Absolute millis for the block's start/end (null when manual with no scheduled block). */
  startAt: number | null;
  endAt: number | null;
  dateKey: string;
  manual: boolean;
}

export interface ActivePassRef<T = number> {
  passId: string;
  appStudentId: string;
  sectionKey: string;
  departedAt: T;
}

export interface RoomDoc<T = number> {
  teacherUid: string;
  paused: boolean;
  /** Teacher override, valid only on manualDateKey (school-local date). */
  manualSectionKey: string | null;
  manualDateKey: string | null;
  current: CurrentSection | null;
  activePass: ActivePassRef<T> | null;
  togetherSince: T | null;
  /** Rotated on every roster change and re-pair; kiosk student keys derive from it. */
  displaySalt: string;
  updatedAt: T;
}

/** What a kiosk may see. Nothing here may identify a student outside the room. */
export interface DisplayDoc<T = number> {
  sectionTitle: string | null;
  blockLabel: string | null;
  block: { startMinutes: number; endMinutes: number; startAt: number; endAt: number } | null;
  manual: boolean;
  paused: boolean;
  roster: { k: string; name: string }[];
  active: { k: string; name: string; departedAt: T } | null;
  togetherSince: T | null;
  settings: Settings;
  updatedAt: T;
}

export interface KioskDoc<T = number> {
  roomId: string;
  teacherUid: string;
  label: string;
  pairedAt: T;
  lastSeenAt: T | null;
  revokedAt: T | null;
}

export type PassStatus = 'active' | 'completed' | 'invalidated';
export type PassSource = 'kiosk' | 'teacher' | 'system';

export interface Correction<T = number> {
  at: T;
  by: string; // teacher uid, or "system"
  action: 'ended' | 'invalidated' | 'reassigned' | 'flagged-stale';
  note: string | null;
  previous: Record<string, unknown>;
}

export interface PassDoc<T = number> {
  roomId: string;
  teacherUid: string;
  sectionKey: string;
  sectionTitle: string;
  appStudentId: string;
  studentName: string; // display-name snapshot at departure
  departedAt: T;
  returnedAt: T | null;
  status: PassStatus;
  startSource: PassSource;
  endSource: PassSource | null;
  kioskId: string | null;
  /** Set when a pass went stale (e.g. left open overnight) and needs the teacher. */
  needsReview: boolean;
  corrections: Correction<T>[];
  createdAt: T;
  updatedAt: T;
}
