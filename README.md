# Expense Tracker

An offline-first expense tracker. Your data lives on your device. Backing it up is
optional, and you choose how: a **local file**, or a **Google Drive folder**.

Live at **https://raihanorium.github.io/expense-tracker/**

## How it works

A fully static site (`output: 'export'`) with no backend — GitHub Pages serves files only.
Everything happens in the browser.

- **No account needed.** Open it and start tracking. There is no sign-in wall.
- **Works offline.** A service worker (`public/sw.js`) caches the app, so it loads with no
  network at all. IndexedDB holds your data.
- **Backup is opt-in, two ways.**
  - *File* — Export writes a JSON file to your device; Import restores one. Works offline,
    no account.
  - *Google Drive* — pick a folder, and the app keeps `expenses.json` in it up to date
    across devices. **This is the only feature that asks you to sign in**, and it only asks
    at the moment you click Connect.
- **Nothing is sent to Google unless you connect Drive.** The Google sign-in and Picker
  scripts aren't even downloaded until then — verified with a network log.

Both backup routes use the same JSON format, so a file exported on one device can be
imported on another, or dropped into your Drive folder by hand.

### What needs a connection

| Action | Offline |
| --- | --- |
| Open the app, view expenses | ✅ |
| Add / edit / delete an expense | ✅ |
| Export / import a backup file | ✅ |
| Sync to Drive | ❌ — queued, runs when you reconnect |
| Connect Drive (sign in + pick folder) | ❌ |

The service worker only takes effect after one successful online visit, so the very first
load on a device must be online. It precaches the whole app at install time, so a single
visit is enough.

**Offline only works in a production build.** `next dev` rebuilds chunks under changing
URLs, so a cached shell would quickly point at files that no longer exist — the worker is
deliberately not registered in development, and any stale one from an earlier dev run is
unregistered automatically. To try offline locally:

```bash
npm run preview        # builds, then serves ./out on http://localhost:3000
```

Load it once, then DevTools → Network → **Offline** → reload.

### Drive sync model

Once connected, sync runs on startup, ~3 s after a change, when you come back online, and on
demand. Whether anything changed is decided by exact counters — a local revision number and
Drive's own `version` field — never by comparing clocks.

Conflicts use **last write wins** at the whole-file level, compared on the timestamp embedded
in the snapshot. Two consequences:

- If two devices both edit while offline, the **entire** losing snapshot loses, not just the
  conflicting rows. To make that recoverable, the loser is first written to
  `expenses.conflict-<timestamp>.json` in the same folder. The app never reads or cleans up
  those files — they're yours.
- Because it compares device clocks, a badly wrong clock resolves conflicts wrongly.

Guards exist for the worst cases: an empty local database will never overwrite a non-empty
Drive file (browsers can evict IndexedDB), and a corrupt or newer-version file is refused
rather than overwritten.

There is no background sync timer. The browser OAuth flow issues no refresh token, so
re-authorising needs a real click — a timer would just hit a blocked popup.

## Setup

### 1. Google Cloud Console — only if you want Drive sync

Skip this entirely if file backup is enough; the app works without any of it.

1. **APIs & Services → Library** → enable both **Google Drive API** and **Google Picker API**.
2. **OAuth consent screen** → add the scope `.../auth/drive.file`.
3. **Credentials → Create credentials → OAuth client ID → Web application.** The flow is
   popup-based, so it needs **Authorized JavaScript origins**, not redirect URIs:
   ```
   http://localhost:3000
   https://raihanorium.github.io
   ```
4. **Credentials → Create credentials → API key.** Restrict it to the Drive and Picker APIs.
   If you also restrict by website, you must include `https://docs.google.com/*` alongside
   your own origins — the Picker renders in an iframe on that domain, and leaving it out
   fails with "API developer key is invalid".
5. Note your **project number** from the Console dashboard. Not the project ID, not the
   client ID — the Picker uses it as the app ID, and the folder grant won't attach without it.

> Upgrading from an earlier version of this app? The scope changed from `drive.readonly`, so
> you'll be asked to consent again. The old grant lingers until you remove it at
> [Google Account permissions](https://myaccount.google.com/permissions).

### 2. Run locally

```bash
npm install
npm run dev

# Only if you want Drive sync:
cp .env.example .env.local     # then fill in the three Google values
```

### 3. Deploy

One-time repo settings:

- **Settings → Pages → Source**: **GitHub Actions**.
- **Settings → Secrets and variables → Actions → Variables**: add
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY`, and
  `NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER`. Variables rather than secrets — all three ship in the
  bundle anyway, and masking them only makes build logs unreadable.

Pushing to `main` builds and publishes via `.github/workflows/deploy.yml`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/lib/db.ts` | IndexedDB schema, migrations, local settings + optional Drive link |
| `src/lib/expenses.ts` | Expense type and pure helpers (amounts, dates, grouping) |
| `src/lib/drive.ts` | Drive REST transport: error classification, retry, multipart upload |
| `src/lib/picker.ts` | Loads and opens the Google Picker folder chooser |
| `src/lib/sync.ts` | Snapshot format, `decideSync` (pure), and the sync runner |
| `src/lib/backup.ts` | Local file export / import |
| `src/components/DataProvider.tsx` | Wires storage, settings, and backup/sync into React state |
| `src/components/BackupPanel.tsx` | Both backup options; the only place sign-in is offered |
| `src/components/GoogleAuthProvider.tsx` | Browser OAuth via Google Identity Services |
| `scripts/generate-sw.mjs` | Emits `out/sw.js` with a build-time precache manifest |
| `scripts/preview.mjs` | Serves `out/` so the worker can be tested locally |

### Data format

Exported files and `expenses.json` look like this — amounts are integer **cents** to avoid float drift, and
dates are calendar days rather than timestamps so they don't shift across timezones:

```json
{
  "schema": "expense-tracker/v1",
  "version": 1,
  "updatedAt": 1756800000000,
  "expenses": [
    {
      "id": "0f8c…",
      "date": "2026-09-02",
      "amount": 1250,
      "category": "Food",
      "note": "Lunch",
      "createdAt": 1756800000000,
      "updatedAt": 1756800000000
    }
  ]
}
```
