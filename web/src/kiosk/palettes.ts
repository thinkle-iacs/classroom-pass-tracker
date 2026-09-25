// Screensaver color palettes, all chosen to glow on the kiosk's dark navy.
// One is picked per school day (hash of the date key), so the room sees
// something new each day but the same one all day, reloads included.

export interface Palette { name: string; colors: readonly string[] }

export const PALETTES: readonly Palette[] = [
  { name: 'Lagoon', colors: ['#4cc9f0', '#4895ef', '#4361ee', '#7209b7', '#f72585'] },
  { name: 'Sunset', colors: ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'] },
  { name: 'Meadow', colors: ['#d9ed92', '#b5e48c', '#99d98c', '#76c893', '#52b69a', '#34a0a4'] },
  { name: 'Ember', colors: ['#ffe8d6', '#ffd166', '#f4a261', '#e76f51', '#ef476f'] },
  { name: 'Aurora', colors: ['#80ffdb', '#64dfdf', '#48bfe3', '#5390d9', '#6930c3', '#7400b8'] },
  { name: 'Citrus', colors: ['#f94144', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590'] },
  { name: 'Sherbet', colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff'] },
  { name: 'Moonlight', colors: ['#f8f9fa', '#caf0f8', '#90e0ef', '#48cae4', '#00b4d8'] },
  { name: 'Orchid', colors: ['#f3c4fb', '#e2afff', '#cdb4db', '#ffafcc', '#a2d2ff'] },
];

/** Stable per day: FNV-1a over "2026-09-25". */
export function paletteFor(dateKey: string): Palette {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) h = Math.imul(h ^ dateKey.charCodeAt(i), 0x01000193);
  return PALETTES[(h >>> 0) % PALETTES.length]!;
}
