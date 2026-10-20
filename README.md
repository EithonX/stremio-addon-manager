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

- Reorder addons with drag and drop or the keyboard
- Add addons from manifest URLs and Stremio install links
- Choose which catalogs and features appear in Stremio
- Edit addon details in a form or as JSON
- Download backups, restore your list, and undo the last sync from a backup
- Review changes before syncing and detect edits made on other devices
- Light and dark themes with mobile support

## Privacy

- Refreshing keeps you signed in. **Keep me signed in** also restores your session after reopening the browser, for up to 30 days.
- Sign-in keys are encrypted in Secure, HttpOnly, SameSite cookies. Page scripts cannot read them; local account settings are also encrypted.
- Sign-in requests pass through this site to Stremio. Your Stremio password is never saved.
- **Switch account** keeps your saved login. **Sign out of Stremio** ends that Stremio session and removes its saved login. Closing a tab is not a Stremio sign-out.
- Keep downloaded backups private: configured addon links can contain credentials.

## Local development

```bash
npm ci
npm run dev:pages
```

Use Node.js 24 or later. This command builds the frontend and starts the local Cloudflare API server. Rebuild after frontend edits.

For local sign-in, put `SESSION_SECRET=<64 random hex characters>` in `.dev.vars`. Generate a value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

## Deployment

Deploy on Cloudflare Pages with:

- Build command: `npm run build`
- Output directory: `dist`

Functions live in `functions/api` and are detected automatically. Set the build environment variable `NODE_VERSION=24`.

Before deploying, add **SESSION_SECRET** as an encrypted Cloudflare Pages secret for Production (and Preview if used), using 32 random bytes encoded as 64 hex characters. Keep it out of `vars`, Git, and `VITE_*` variables. Reuse it across deployments; changing it signs users out of the manager and makes existing local settings unreadable, without revoking their Stremio sessions.

Manifests load directly from their providers. For providers that need a server fallback, set `vars.MANIFEST_PROXY_ORIGINS` in `wrangler.jsonc` to a comma-separated list of exact trusted origins. It is empty by default; wildcards are not supported.

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
