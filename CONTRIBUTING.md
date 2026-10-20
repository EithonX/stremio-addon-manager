# Contributing to Stremio Addon Manager

Thank you for considering contributing to Stremio Addon Manager.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server with API proxy support:
   ```bash
   npm run dev:pages
   ```

`npm run dev:pages` builds the frontend and then starts the pinned Cloudflare Pages dev server so `/api/*` endpoints function properly. Rebuild frontend edits to update `dist`; this command does not run a Vite HMR server. Use Node.js 24 or later. Using `npm run dev` alone only works for static UI development.

## Quality Checks

Run tests and ensure production build completes before submitting a pull request:

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser suite mocks every account/provider request. Do not add real passwords or AuthKeys to fixtures. Test deferred requests for account-switch, logout and in-flight-write changes. Keep transformation round trips lossless and preserve unknown manifest fields.

## Pull Request Workflow

1. Create a descriptive feature or fix branch from `main`.
2. Keep commits concise and focused.
3. Verify `npm test` and `npm run build` pass cleanly.
4. Submit your pull request with a summary of changes and testing steps.
