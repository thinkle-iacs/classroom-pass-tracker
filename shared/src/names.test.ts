import { describe, expect, it } from 'vitest';
import { defaultDisplayNames, effectiveName, looksLikeFullName } from './names';

describe('defaultDisplayNames', () => {
  it('uses first name and last initial', () => {
    const names = defaultDisplayNames([{ id: 'a', givenName: 'Maya', familyName: 'Rivera' }]);
    expect(names.get('a')).toBe('Maya R.');
  });
  it('widens colliding surnames', () => {
    const names = defaultDisplayNames([
      { id: 'a', givenName: 'Maya', familyName: 'Rivera' },
      { id: 'b', givenName: 'Maya', familyName: 'Romero' },
    ]);
    expect(names.get('a')).toBe('Maya Ri.');
    expect(names.get('b')).toBe('Maya Ro.');
  });
  it('numbers exact duplicates', () => {
    const names = defaultDisplayNames([
      { id: 'a', givenName: 'Sam', familyName: 'Kim' },
      { id: 'b', givenName: 'Sam', familyName: 'Kim' },
    ]);
    expect(new Set(names.values()).size).toBe(2);
  });
  it('uses only the first given name and handles missing surnames', () => {
    const names = defaultDisplayNames([{ id: 'a', givenName: 'Ana Lucia', familyName: '' }]);
    expect(names.get('a')).toBe('Ana');
  });
});

describe('overrides', () => {
  it('prefers a non-empty override', () => {
    expect(effectiveName({ defaultDisplayName: 'Maya R.', displayNameOverride: 'Mae' })).toBe('Mae');
    expect(effectiveName({ defaultDisplayName: 'Maya R.', displayNameOverride: '  ' })).toBe('Maya R.');
  });
  it('flags overrides containing the full surname', () => {
    expect(looksLikeFullName('Maya Rivera', { givenName: 'Maya', familyName: 'Rivera' })).toBe(true);
    expect(looksLikeFullName('Mae R.', { givenName: 'Maya', familyName: 'Rivera' })).toBe(false);
  });
});
