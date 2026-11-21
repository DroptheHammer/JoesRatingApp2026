// Demo store: mimics the Apps Script backend in localStorage so the app is
// fully usable before the Google Sheet is connected. Same data shapes.

const KEY = 'joes.demo.v1';

const SEED = {
  locations: [
    { location_id: 'north-beach', name: 'North Beach', area: 'San Francisco' },
    { location_id: 'westlake', name: 'Westlake', area: 'Daly City' },
    { location_id: 'burlingame', name: 'Burlingame', area: 'Burlingame' },
    { location_id: 'san-jose', name: 'San Jose', area: 'San Jose' },
    { location_id: 'little-chestnut', name: "Little Original Joe's", area: 'Chestnut St · Marina, SF' },
  ],
  weights: [
    { key: 'food', category: 'Food Quality', weight: 0.4 },
    { key: 'decor', category: 'Decor & Coziness', weight: 0.2 },
    { key: 'service', category: 'Service', weight: 0.15 },
    { key: 'bath', category: 'Bathroom', weight: 0.15 },
    { key: 'xmas', category: 'Christmas Spirit', weight: 0.1 },
  ],
  ratings: [
    ['north-beach_2026-11-08', 'Dad', 9, 8, 6, 9, 9, 'Veal parm was perfect. Love the red booths.'],
    ['north-beach_2026-11-08', 'Mom', 8, 9, 5, 9, 10, 'Server remembered us from last year!!'],
    ['north-beach_2026-11-08', 'Sis', 9, 7, 4, 8, 8, 'Bathroom was tiny. Points off.'],
    ['north-beach_2026-11-08', 'Bro', 10, 8, 7, 10, 9, 'Meatballs 11/10'],
    ['westlake_2026-10-18', 'Dad', 8, 8, 8, 7, '', 'Classic. Martinis strong.'],
    ['westlake_2026-10-18', 'Mom', 9, 7, 7, 8, '', ''],
    ['westlake_2026-10-18', 'Bro', 8, 8, 8, 7, '', 'Fries were cold'],
    ['burlingame_2026-08-15', 'Dad', 6, 8, 9, 7, '', 'Very modern, less cozy.'],
    ['burlingame_2026-08-15', 'Mom', 6, 7, 8, 7, '', 'Spotless bathroom.'],
  ].map(([visit_id, person, decor, service, bath, food, xmas, comment], i) => ({
    submitted_at: new Date(Date.UTC(2026, 7, 15 + i)).toISOString(),
    rating_id: visit_id + ':' + person.toLowerCase(),
    visit_id,
    location_id: visit_id.split('_')[0],
    visit_date: visit_id.split('_')[1],
    person, decor, service, bath, food, xmas, comment,
  })),
  photos: [
    { uploaded_at: '2026-11-08T03:00:00.000Z', photo_id: 'demo-menu', visit_id: 'north-beach_2026-11-08', location_id: 'north-beach', person: 'Dad', caption: 'The menu', url: '../mockups/assets/menu.jpg' },
  ],
};

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || structuredClone(SEED); } catch { return structuredClone(SEED); }
};
const write = db => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { throw new Error('Demo storage is full — reset demo data in Settings'); }
};
const delay = v => new Promise(r => setTimeout(() => r(v), 250));

export const load = () => delay(read());

export function rate(r) {
  const db = read();
  const row = {
    submitted_at: new Date().toISOString(),
    rating_id: r.visit_id + ':' + r.person.toLowerCase(),
    visit_id: r.visit_id, location_id: r.location_id, visit_date: r.visit_date, person: r.person,
    decor: r.decor, service: r.service, bath: r.bath, food: r.food, xmas: r.xmas ?? '', comment: r.comment || '',
  };
  const i = db.ratings.findIndex(x => x.rating_id === row.rating_id);
  if (i >= 0) db.ratings[i] = row; else db.ratings.push(row);
  write(db);
  return delay({ ok: true, rating_id: row.rating_id });
}

export function photo(p) {
  const db = read();
  const row = {
    uploaded_at: new Date().toISOString(), photo_id: crypto.randomUUID?.() || String(Math.random()).slice(2),
    visit_id: p.visit_id, location_id: p.location_id, person: p.person, caption: p.caption || '', url: p.data_url,
  };
  db.photos.push(row);
  write(db);
  return delay({ ok: true, photo_id: row.photo_id, url: row.url });
}

export const reset = () => localStorage.removeItem(KEY);
