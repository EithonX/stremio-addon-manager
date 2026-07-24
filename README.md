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
- Review local changes before syncing them to Stremio
- Responsive interface with light and dark mode
- Route Stremio and manifest requests through Cloudflare Pages Functions

## Security and privacy

- Passwords are used only to request a Stremio AuthKey.
- AuthKeys are stored locally in your browser.
- The Cloudflare Functions proxy does not persist credentials.
- You can skip password login and paste an AuthKey directly.

> Treat your AuthKey like a password.

## Local development

```bash
npm install
npm run dev:pages
```

`npm run dev:pages` builds the app and starts Cloudflare Pages dev, which is required for the `/api/*` routes. Use `npm run dev` only when working on static UI without API calls.

## Quality checks

```bash
npm test
npm run build
```

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
