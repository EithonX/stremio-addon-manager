<div align="center">
  <a href="https://github.com/EithonX/stremio-addon-manager">
    <img src="public/logo.svg" alt="Stremio Addon Manager" width="92" height="92">
  </a>

  <h1>Stremio Addon Manager</h1>

  <p>
    <strong>Manage your Stremio addon order without reinstalling everything.</strong>
  </p>

  <p>
    Reorder, edit, back up, and restore your addon collection from a clean web interface.
  </p>

  <p>
    <a href="https://github.com/EithonX/stremio-addon-manager/actions/workflows/ci.yml">
      <img alt="CI" src="https://github.com/EithonX/stremio-addon-manager/actions/workflows/ci.yml/badge.svg">
    </a>
    <a href="https://stremio-addon-manager-2-0.pages.dev">
      <img alt="Live Demo" src="https://img.shields.io/badge/Live%20Demo-Cloudflare%20Pages-orange?logo=cloudflare">
    </a>
    <a href="LICENSE">
      <img alt="License" src="https://img.shields.io/badge/License-GPLv3-blue.svg">
    </a>
  </p>

  <p>
    <a href="#features">Features</a>
    ·
    <a href="#local-development">Local development</a>
    ·
    <a href="#deployment">Deployment</a>
    ·
    <a href="#contributing">Contributing</a>
    ·
    <a href="#license">License</a>
  </p>
</div>

## Overview

Stremio addon order is tied to install order. Moving one addon up usually means uninstalling and reinstalling others around it.

Stremio Addon Manager loads your addon collection, lets you make local changes, and syncs the updated order back to your Stremio account.

## Features

- Reorder addons with drag and drop
- Add addons from manifest URLs or `stremio://` links
- Edit addon manifests before syncing
- Back up and restore addon collections as JSON
- Review a change summary and verified destination account before syncing
- Detect remote changes, merge non-overlapping edits, and verify the written collection
- Download a recovery snapshot of the collection before the latest write
- Keep catalog/resource settings reversible in the workspace, encrypted remembered accounts, and v2 backups
- Responsive interface with light and dark mode
- Use a scoped Stremio API proxy and optional, deployment-approved manifest proxy fallback

## Security and privacy

- Active AuthKeys live in memory in the current tab. Closing or reloading the page requires reconnecting.
- **Remember this account** stores an encrypted AuthKey, customization source/settings, and recovery snapshot. New entries require a passphrase of at least eight characters. The passphrase is not persisted. Older encrypted PIN entries can still be unlocked.
- Plaintext keys/passwords from older versions are removed from local browser storage. Saved labels remain so you can reconnect explicitly. This local migration does not revoke old server sessions.
- Email/password, AuthKey and collection API requests travel through this deployment's Cloudflare Function to Stremio. The reviewed Function does not persist or log authentication bodies or configured URLs. Deployment operators must also configure their infrastructure logging appropriately.
- **Switch account** disconnects locally and retains encrypted saved entries. **Sign out & revoke** calls Stremio's logout endpoint and removes the matching saved key on this device. Revoking a copied key affects the same session in the Stremio client it came from. Network failures are reported as unconfirmed revocation.
- Backup JSON contains private configured addon URLs and may contain provider credentials. Keep it private. Recovery is in memory unless you explicitly remember the account, in which case it is encrypted in that vault.

Treat your AuthKey like a password. Browser encryption does not protect a key that is unlocked while malicious JavaScript is executing on the same origin.

### Manifest access policy

The browser first requests provider manifests directly, omitting credentials and referrers and rejecting redirects. Providers must support browser CORS. If that fails, the manager may use its own Function, which only fetches exact origins explicitly approved by the deployment.

Set a Cloudflare Pages environment variable if you need this fallback:

```text
MANIFEST_PROXY_ORIGINS=https://your-trusted-addon.example.com,https://another-trusted-provider.example.org
```

Only approve providers whose destination and DNS you trust. This is not a user-editable allowlist: the default is empty; wildcards, subdomain suffix matching, caller-selected destinations and redirects are not permitted. Checking DNS and then letting a separate fetch resolve it again is not an adequate rebinding defense. Public-host/IP and port checks are an additional restriction, not a guarantee about DNS. The public deployment should not add arbitrary origins just to bypass CORS.

The Function enforces JSON schemas, byte-reading limits, method/origin checks and deadlines. An optional compatible `API_RATE_LIMITER` binding can enforce per-IP limits. Configure deployment rate/abuse controls separately; an unconfigured binding does not provide rate limiting. Static page security headers live in `public/_headers`; API responses use no-store and nosniff headers too.

### Sync and restoration behavior

Sync compares a fresh remote snapshot with the original workspace and stops when another client changed it. Non-overlapping addon changes can be merged; overlapping edits require resolution. The complete collection is still written using Stremio's API, which does not expose a conditional revision in the public client contract. Another client can write between the preflight check and the update; this is not an atomic cross-device transaction.

A successful sync means the submitted snapshot was read back and verified. Edits made afterward remain unsynced. If a write's outcome is uncertain, the next verification reconciles it without blindly replaying that replacement.

Capability switches preserve their original data and order separately from the effective manifest sent to Stremio. Per-catalog **Exclude** removes that catalog from Home, Discover and search; **Include** restores it. The Home catalogs switch keeps eligible search and system catalogs without fabricating a genre parameter. Metadata can only be enabled if the source declares it. Source JSON retains disabled data; capability settings are applied on Save.

The restoration source survives editor closes and is included in private v2 backups. It survives page closes only when the account is remembered and unlocked from its encrypted vault. Existing v1 backup JSON remains importable. A changed remote/provider manifest is never overwritten automatically by stale restoration data; use the provider reset or review a private backup. Collection reads use `update: false`; other Stremio clients can still refresh provider manifests independently.

## Local development

```bash
npm ci
npm run dev:pages
```

Use Node.js 24 or later. `npm run dev:pages` builds the app and starts the pinned Cloudflare Pages dev tool, which is required for the `/api/*` routes. Use `npm run dev` only when working on static UI without API calls. Rebuild after frontend edits when using Pages dev; it serves `dist`, rather than a Vite HMR server.

## Quality checks

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser suite starts a local preview and uses fake account/provider responses. It never contacts real Stremio accounts. Desktop and a 360px touch viewport cover encryption/migration, validation, clipboard, reversible settings, nested dialogs, review/sync, duplicates/configuration, read errors, account isolation and revocation. Set `BROWSER_EXECUTABLE_PATH` to use an existing Chromium binary, or `BROWSER_BASE_URL` to test an already-running local build. Production token revocation and native-client rendering still require a disposable-account/device check.

## Deployment

Deploy on Cloudflare Pages with:

- Build command: `npm run build`
- Output directory: `dist`

Functions live in `functions/api` and are detected automatically.

## AuthKey login

You can sign in normally or paste an existing Stremio AuthKey.

<details>
<summary>How to retrieve your AuthKey manually</summary>

Log into [Stremio Web](https://web.stremio.com), open the browser console, and run:

```js
JSON.parse(localStorage.getItem("profile")).auth.key
```

On mobile, type `javascript:` in the address bar, then paste this immediately after it:

```js
(t=document.createElement("textarea"),t.value=JSON.parse(localStorage.profile).auth.key,document.body.append(t),t.select(),document.execCommand("copy"),t.remove())
```

</details>

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on code style and quality check requirements.

## Credits

- Maintained by [EithonX](https://github.com/EithonX)
- Based on original work by [Pancake3000](https://github.com/pancake3000/stremio-addon-manager)
- Thanks to Sleeyax and `<Code/>` for initial research

## License

This project is open-source software licensed under the [GNU General Public License v3.0](LICENSE).

## Disclaimer

This project is not affiliated with Stremio. Use it at your own risk, and back up your addon collection before making major changes.
