# Stremio Addon Manager (v2.0)

<p align="center">
  <img src="public/logo.svg" alt="Stremio Addon Manager" width="120">
</p>


> **Reimagined by [EithonX](https://github.com/EithonX)** > Based on the original work by Pancake3000.

**Stremio Addon Manager** is a modern, secure, and responsive web application that allows you to easily reorder and manage your Stremio addons. 

Stremio natively locks addons in the order of installation. To move a catalog up, users typically have to uninstall and reinstall everything. This tool solves that problem with a simple **Drag-and-Drop** interface.

---

## ✨ Features

- **🚀 Drag & Drop Reordering:** Instantly rearrange your addon load order.
- **📱 Fully Responsive:** Works perfectly on Desktop, Tablets, and Mobile phones.
- **🎨 Modern UI:** A complete redesign using Tailwind CSS with Dark/Light mode support.
- **🔒 Secure Architecture:** - **Client-Side Only:** Your password is never stored on a server.
  - **Local Storage:** AuthKey is stored locally in your browser and cleared on logout.
  - **Secure Proxy:** Uses Cloudflare Functions to prevent CORS issues without exposing credentials.
- **⚡ Blazing Fast:** Built on Vue 3 + Vite.
- **🎬 Move System Addons:** Ability to push Cinemeta (Popular/Featured rows) down the list.

---

## 🛠️ Tech Stack

- **Framework:** Vue 3 (Composition API)
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS 3.4
- **Icons:** Lucide Vue Next
- **Deployment:** Cloudflare Pages (Static + Functions)

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/EithonX/stremio-addon-manager.git
   cd stremio-addon-manager
   ```

2. **Install dependencies:**
   ```bash
    npm install
   ```


### Local Development

Because this project uses Cloudflare Pages Functions for `/api/login`, `/api/addonCollectionGet`, `/api/addonCollectionSet`, and `/api/manifest`, `npm run dev` is only useful for static UI work. It does not run the API proxy, so addon manifest loading through `/api/manifest` requires Wrangler.

Use the Pages dev command:
```bash
npm run dev:pages
```

Or run the steps manually:

1. **Build the project:**
```bash
npm run build
```


2. **Run the local server:**
```bash
npx wrangler pages dev dist
```


Open your browser to `http://localhost:8788`.

---

## 🌐 Deployment (Cloudflare Pages)

This project is optimized for **Cloudflare Pages**.

1. Push your code to a GitHub repository.
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) and go to **Workers & Pages**.
3. Click **Connect to Git** and select your repository.
4. Use the following Build Settings:
* **Framework Preset:** Vite
* **Build Command:** `npm run build`
* **Output Directory:** `dist`


5. Click **Save and Deploy**.

*Note: The `functions/api` directory will automatically be detected and deployed as a secure proxy.*

---

## 🔑 How to Get Your AuthKey

If you prefer not to enter your password, you can manually retrieve your AuthKey:

**On Desktop (PC/Mac):**

1. Log into [Stremio Web](https://web.stremio.com).
2. Open Developer Tools (`F12`).
3. Go to the **Console** tab, paste this, and hit Enter:
```js
JSON.parse(localStorage.getItem("profile")).auth.key
```



**On Mobile:**

1. Open Stremio Web in Chrome.
2. Type `javascript:` in the URL bar.
3. Paste this code immediately after and hit Enter:
```js
(t=document.createElement("textarea"),t.value=JSON.parse(localStorage.profile).auth.key,document.body.append(t),t.select(),document.execCommand("copy"),t.remove())
```
---

## ⚠️ Disclaimer

> **Use at your own risk.**

This is a community-developed tool and is not an official Stremio product.

* It uses the official Stremio API to sync your addon collection.
* There is no "Undo" button (though you can simply reinstall addons to reset them).
* We do not accept responsibility for any issues that arise with your Stremio profile.

---

## ❤️ Credits

* **Redesign & v2.0 Architecture:** [EithonX](https://github.com/EithonX)
* **Original Creator:** [Pancake3000](https://www.google.com/search?q=https://github.com/Pancake3000)
* **Special Thanks:** Sleeyax and \<Code/\> for initial research.

Made with ❤️ for the Stremio Community.
