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

`npm run dev:pages` runs Vite and Cloudflare Pages dev together so `/api/*` endpoints function properly. Using `npm run dev` alone only works for static UI development.

## Quality Checks

Run tests and ensure production build completes before submitting a pull request:

```bash
npm test
npm run build
```

## Pull Request Workflow

1. Create a descriptive feature or fix branch from `main`.
2. Keep commits concise and focused.
3. Verify `npm test` and `npm run build` pass cleanly.
4. Submit your pull request with a summary of changes and testing steps.
