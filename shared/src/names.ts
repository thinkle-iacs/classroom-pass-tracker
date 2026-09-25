// Kiosk-safe display names. Default is "First L."; collisions widen the surname
// prefix one letter at a time ("Maya Ro." / "Maya Ri."), and true duplicates get a
// number. Teacher overrides live separately and always win (see effectiveName).

export interface NameSource { id: string; givenName: string; familyName: string }

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

function candidate(given: string, family: string, letters: number): string {
  const first = clean(given).split(' ')[0] || '?';
  const last = clean(family).replace(/[^\p{L}]/gu, '');
  if (!last) return first;
  const prefix = last.slice(0, letters);
  return `${first} ${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}.`;
}

export function defaultDisplayNames(students: readonly NameSource[]): Map<string, string> {
  const result = new Map<string, string>();
  const pending = [...students].sort((a, b) => a.id.localeCompare(b.id));
  // Group by the one-letter form, then widen only inside colliding groups.
  const groups = new Map<string, NameSource[]>();
  for (const s of pending) {
    const key = candidate(s.givenName, s.familyName, 1).toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const group of groups.values()) {
    if (group.length === 1) { result.set(group[0]!.id, candidate(group[0]!.givenName, group[0]!.familyName, 1)); continue; }
    const longest = Math.max(...group.map((s) => clean(s.familyName).length));
    let letters = 2;
    for (; letters <= longest; letters++) {
      const names = group.map((s) => candidate(s.givenName, s.familyName, letters).toLowerCase());
      if (new Set(names).size === names.length) break;
    }
    const seen = new Map<string, number>();
    for (const s of group) {
      const base = candidate(s.givenName, s.familyName, Math.min(letters, longest));
      const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
      seen.set(base.toLowerCase(), n);
      result.set(s.id, n === 1 ? base : `${base} (${n})`);
    }
  }
  return result;
}

export function effectiveName(student: { defaultDisplayName: string; displayNameOverride?: string | null }): string {
  return student.displayNameOverride?.trim() || student.defaultDisplayName;
}

export const DISPLAY_NAME_MAX = 24;
export const DISPLAY_NAME_WARNING =
  'This name is visible on the classroom display. Use the minimum identifying information necessary; avoid full student names.';

/** Soft check: does an override look like a full legal name? Used to nudge, not block. */
export function looksLikeFullName(override: string, source: Pick<NameSource, 'givenName' | 'familyName'>): boolean {
  const o = override.toLowerCase();
  const family = clean(source.familyName).toLowerCase();
  return family.length > 1 && o.includes(family);
}
