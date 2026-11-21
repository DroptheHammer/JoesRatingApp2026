/**
 * All the Joes — Google Apps Script backend.
 *
 * Paste this into the Google Sheet via Extensions → Apps Script, then
 * Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 *
 * Secrets live in Project Settings → Script Properties, NOT in this file:
 *   PASSCODE         the family passcode everyone types once in the app
 *   PHOTO_FOLDER_ID  the Drive folder ID for uploaded photos
 *
 * The app calls:
 *   GET  ?action=data&key=PASSCODE         → { locations, weights, ratings, photos }
 *   POST {key, action:'rate', ...}         → upserts one person's rating for a visit
 *   POST {key, action:'photo', ...}        → saves a photo to Drive and logs it
 * POST bodies are sent as text/plain JSON to avoid a CORS preflight.
 */

const CATS = ['decor', 'service', 'bath', 'food', 'xmas'];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function doGet(e) {
  return handle_(() => {
    checkKey_(e.parameter.key);
    if (e.parameter.action !== 'data') throw new Error('Unknown action');
    return {
      locations: readTab_('Locations'),
      weights: readTab_('Weights'),
      ratings: readTab_('Ratings'),
      photos: readTab_('Photos').map(p => Object.assign(p, {
        url: 'https://drive.google.com/thumbnail?id=' + p.drive_file_id + '&sz=w1200',
      })),
    };
  });
}

function doPost(e) {
  return handle_(() => {
    const body = JSON.parse(e.postData.contents);
    checkKey_(body.key);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (body.action === 'rate') return saveRating_(body);
      if (body.action === 'photo') return savePhoto_(body);
      throw new Error('Unknown action');
    } finally {
      lock.releaseLock();
    }
  });
}

// ---------- actions ----------

function saveRating_(b) {
  const visitId = str_(b.visit_id, 60, true);
  const person = str_(b.person, 40, true);
  const row = [
    new Date(),
    visitId + ':' + person.toLowerCase(),
    visitId,
    str_(b.location_id, 60, true),
    str_(b.visit_date, 20, true),
    person,
  ];
  CATS.forEach(k => row.push(score_(b[k], k === 'xmas')));
  row.push(str_(b.comment, 2000, false));

  // One rating per person per visit: resubmitting replaces the earlier row.
  const sh = tab_('Ratings');
  const ids = sh.getRange(1, 2, Math.max(sh.getLastRow(), 1), 1).getValues().flat();
  const idx = ids.indexOf(row[1]);
  if (idx > 0) sh.getRange(idx + 1, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  return { ok: true, rating_id: row[1] };
}

function savePhoto_(b) {
  const folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (!folderId) throw new Error('PHOTO_FOLDER_ID is not set');
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(b.data_url || '');
  if (!m) throw new Error('Photo must be a JPEG, PNG or WebP data URL');
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Photo too large');

  const visitId = str_(b.visit_id, 60, true);
  const person = str_(b.person, 40, true);
  const photoId = Utilities.getUuid();
  const blob = Utilities.newBlob(bytes, m[1], visitId + '_' + person + '_' + photoId + '.' + m[2]);
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  // Unguessable link-only access so phones can display the image.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  tab_('Photos').appendRow([
    new Date(), photoId, visitId, str_(b.location_id, 60, true), person,
    file.getId(), str_(b.caption, 300, false),
  ]);
  return { ok: true, photo_id: photoId, url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200' };
}

// ---------- helpers ----------

function handle_(fn) {
  let out;
  try {
    out = fn();
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  const pass = PropertiesService.getScriptProperties().getProperty('PASSCODE');
  if (!pass) throw new Error('PASSCODE is not set');
  if (key !== pass) throw new Error('Wrong passcode');
}

function tab_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name);
  return sh;
}

function readTab_(name) {
  const values = tab_(name).getDataRange().getValues();
  const head = values.shift().map(h => String(h).split(' ')[0]);
  return values
    .filter(r => r.some(c => c !== ''))
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i] instanceof Date ? r[i].toISOString() : r[i]])));
}

function score_(v, allowNA) {
  if (allowNA && (v === null || v === undefined || v === '')) return '';
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('Scores must be whole numbers 1–10');
  return n;
}

function str_(v, max, required) {
  const s = String(v == null ? '' : v).trim().slice(0, max);
  if (required && !s) throw new Error('Missing required field');
  // Block spreadsheet formula injection.
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
