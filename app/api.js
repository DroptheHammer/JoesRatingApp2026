// All the Joes — client for the Google Apps Script backend.
// The only thing configured here is the public web-app URL. The passcode is
// typed by each person once and kept in their phone's localStorage; it is
// never committed to the repo.

// Paste the Web app URL from Apps Script → Deploy here (ends in /exec).
export const SCRIPT_URL = 'PASTE_WEB_APP_URL_HERE';

const KEY_STORE = 'joes.passcode';
export const getPasscode = () => localStorage.getItem(KEY_STORE) || '';
export const setPasscode = v => localStorage.setItem(KEY_STORE, v.trim());

async function call(res) {
  const json = await (await res).json();
  if (!json.ok && json.error) throw new Error(json.error);
  return json;
}

export function loadData() {
  const u = new URL(SCRIPT_URL);
  u.searchParams.set('action', 'data');
  u.searchParams.set('key', getPasscode());
  return call(fetch(u));
}

function post(payload) {
  // text/plain avoids a CORS preflight, which Apps Script can't answer.
  return call(fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: getPasscode(), ...payload }),
  }));
}

// rating: { visit_id, location_id, visit_date, person, decor, service, bath, food, xmas (null = N/A), comment }
export const submitRating = rating => post({ action: 'rate', ...rating });

// Shrinks a photo on the phone before upload (long edge 1600px, JPEG).
export async function submitPhoto(file, meta) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return post({ action: 'photo', data_url: c.toDataURL('image/jpeg', 0.82), ...meta });
}

// Weighted overall; categories left null (N/A) are skipped and the rest scale to 100%.
export function overall(scores, weights) {
  const ks = Object.keys(weights).filter(k => scores[k] != null && scores[k] !== '');
  const tw = ks.reduce((t, k) => t + weights[k], 0);
  return tw ? ks.reduce((t, k) => t + weights[k] * scores[k], 0) / tw : null;
}
