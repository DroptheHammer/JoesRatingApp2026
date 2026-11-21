// All the Joes — data layer.
// Talks to the Google Apps Script backend, or to a local demo store when no
// backend URL is configured yet. No Google credentials live here: the backend
// URL is public by design and the family passcode is typed once per phone.

import * as demo from './demo.js';

// Paste the Web app URL from Apps Script → Deploy here (ends in /exec).
// It can also be set per phone in the app's Settings screen.
export const SCRIPT_URL = 'PASTE_WEB_APP_URL_HERE';

const K = { pass: 'joes.passcode', backend: 'joes.backend', name: 'joes.name' };
export const getPasscode = () => localStorage.getItem(K.pass) || '';
export const setPasscode = v => localStorage.setItem(K.pass, (v || '').trim());
export const getName = () => localStorage.getItem(K.name) || '';
export const setName = v => localStorage.setItem(K.name, (v || '').trim());
export const getBackend = () => localStorage.getItem(K.backend) || SCRIPT_URL;
export const setBackend = v => (v || '').trim() ? localStorage.setItem(K.backend, v.trim()) : localStorage.removeItem(K.backend);
export const isDemo = () => !/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec$/.test(getBackend());

async function call(promise) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await promise(ctrl.signal);
    let json;
    try { json = await res.json(); } catch { throw new Error('Unexpected response from the Google Sheet backend'); }
    if (json.ok === false) throw new Error(json.error || 'Request failed');
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Timed out — check your connection');
    if (e instanceof TypeError) throw new Error('Could not reach the Google Sheet — check your connection');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function loadData() {
  if (isDemo()) return demo.load();
  const u = new URL(getBackend());
  u.searchParams.set('action', 'data');
  u.searchParams.set('key', getPasscode());
  u.searchParams.set('t', Date.now());
  return call(signal => fetch(u, { signal }));
}

function post(payload) {
  // text/plain avoids a CORS preflight, which Apps Script can't answer.
  return call(signal => fetch(getBackend(), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: getPasscode(), ...payload }),
  }));
}

// rating: { visit_id, location_id, visit_date, person, decor, service, bath, food, xmas (null = N/A), comment }
export function submitRating(rating) {
  return isDemo() ? demo.rate(rating) : post({ action: 'rate', ...rating });
}

// Shrinks a photo on the phone before upload.
async function shrink(file, maxEdge, quality) {
  let img;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('Could not read that photo'));
      i.src = URL.createObjectURL(file);
    });
  }
  const w = img.width, h = img.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export async function submitPhoto(file, meta) {
  if (isDemo()) return demo.photo({ data_url: await shrink(file, 500, 0.7), ...meta });
  return post({ action: 'photo', data_url: await shrink(file, 1600, 0.82), ...meta });
}

export const resetDemo = () => demo.reset();
