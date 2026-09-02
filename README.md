# Drive Browser

A small Next.js app that signs you in with Google and lets you browse your Google Drive
files — folder navigation, search, and links out to Drive. Access is **read-only**.

Live at **https://raihanorium.github.io/expense-tracker/**

## Architecture

This is a **fully static site** (`output: 'export'`) with no backend, because GitHub Pages
serves files only — there is no Node runtime. Consequently:

- Sign-in uses [Google Identity Services' token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
  which runs entirely in the browser and needs **only a client ID, no client secret**.
- Drive is called directly from the browser via CORS; there is no server proxy.

The tradeoff is that the browser flow issues **no refresh token**. The access token lasts
about an hour, and when it lapses you sign in again — usually a quiet popup, since Google
remembers the consent. The token is held in `sessionStorage` so a page reload doesn't
force a new popup; it is cleared when the tab closes.

## Setup

### 1. Create a Google OAuth client

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a project.
2. Under **APIs & Services → Library**, enable the **Google Drive API**.
3. Under **APIs & Services → OAuth consent screen**, configure the consent screen and add
   the `.../auth/drive.readonly` scope. Keep the app in **Testing** and add your own Google
   account under **Test users** (see the note below).
4. Under **APIs & Services → Credentials**, create an **OAuth client ID** of type
   *Web application*. The token model is popup-based, so it needs **Authorized JavaScript
   origins**, not redirect URIs:

   ```
   http://localhost:3000
   https://raihanorium.github.io
   ```

> **`drive.readonly` is a restricted scope.** Making the app available to anyone would
> require Google's app verification and a security assessment. Left in Testing mode, the
> page is publicly reachable but only accounts listed under **Test users** can sign in.

### 2. Run locally

```bash
cp .env.example .env.local     # then paste in your client ID
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Deploy

Two one-time settings on the GitHub repo:

- **Settings → Pages → Source**: select **GitHub Actions**.
- **Settings → Secrets and variables → Actions → Variables**: add a repository variable
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` with your client ID. (A variable rather than a secret —
  an OAuth client ID is public by design, and secrets are masked in build output.)

Pushing to `main` then builds and publishes via `.github/workflows/deploy.yml`.

To reproduce the CI build locally:

```bash
NEXT_PUBLIC_BASE_PATH=/expense-tracker npm run build   # output lands in out/
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/components/GoogleAuthProvider.tsx` | Loads GIS, requests tokens, tracks the session |
| `src/lib/drive.ts` | Drive `files.list` client plus formatting helpers |
| `src/components/DriveBrowser.tsx` | The browser UI: breadcrumbs, search, paging |
| `next.config.mjs` | Static export + `basePath` for the project-site subpath |
| `.github/workflows/deploy.yml` | Build and publish to GitHub Pages |

Signing out clears the token from this browser. To revoke the grant itself, use
[Google Account permissions](https://myaccount.google.com/permissions).
