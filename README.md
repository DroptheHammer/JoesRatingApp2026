# JoesRatingApp2026

**All the Joes**: a hosted HTML web app for our family to rate every Original Joe's in the Bay Area.
It works on any phone; add it to your home screen to use it like an app.

## What it does
- **The Quest:** every location, with its score and how many of them we've visited.
- **Rate at the table:** everyone scores 1–10 on Decor & Coziness, Service, Bathroom and Food, plus the
  tertiary Christmas Spirit category (N/A off-season). Add comments and photos.
- **Wrap-up / Report card:** the group averages, everyone's scores side by side, the weighted overall score,
  letter grades, photos, quotes and superlatives.
- **Reports & Rankings:** every visit, and the Joe's ranked overall or by any category.

Scoring: 40% Food, 20% Decor, 15% Service, 15% Bathroom, 10% Christmas Spirit. When Christmas is N/A,
the other four weights scale up to 100%. Weights can be edited in the Google Sheet's `Weights` tab.

## Layout
| Path | What |
|---|---|
| `app/` | The web app: plain HTML/CSS/JS with no build step. `app/api.js` holds the backend URL. |
| `backend/Code.gs` | Google Apps Script backend that saves to a private Google Sheet and Drive folder. |
| `backend/SETUP.md` | One-time backend setup (about 5 minutes on a computer). |
| `mockups/` | The original design mockups. |

## Running it
- **Before the backend is connected**, the app runs in **demo mode** with sample data stored on each phone.
- **Hosting:** GitHub Pages (Settings → Pages → deploy from branch, folder `/`). The root `index.html`
  redirects to `app/`.
- **Locally:** `python3 -m http.server` in the repo root, then open http://localhost:8000/app/.
  ES modules don't load from `file://`.

## Privacy
No Google credentials are in this repo. The Apps Script runs as the Sheet owner. The family passcode and the
photo folder ID live in the script's Script Properties. Each phone enters the passcode once and keeps it locally.
