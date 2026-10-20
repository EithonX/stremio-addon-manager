import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { onRequest } from '../functions/api/[[path]].js'
import { encryptSavedSession } from '../src/utils/cryptoVault.js'

// Build and preview the application first. All account/provider responses are
// fixtures; this suite never sends credentials or requests to real services.
const baseUrl = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:4173'
const output = process.env.BROWSER_ARTIFACT_DIR
const originalFetch = globalThis.fetch
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
})
const copy = value => JSON.parse(JSON.stringify(value))
const catalogs = [
  { id: 'popular', type: 'movie', name: 'Popular', extra: [{ name: 'search' }] },
  { id: 'hybrid', type: 'movie', name: 'Mixed', extra: [{ name: 'search' }, { name: 'genre', options: ['Drama'] }, { name: 'skip' }] },
  { id: 'search', type: 'movie', name: 'Search', extra: [{ name: 'search', isRequired: true }] },
  { id: 'paged', type: 'movie', name: 'Paged', extra: [{ name: 'skip' }] },
]
const descriptor = (id, name, resources, items) => ({ transportUrl: `https://provider.example.com/${id}/manifest.json`, manifest: { id, name, version: '1.0.0', description: 'Browser test fixture', types: ['movie'], resources, catalogs: items }, flags: { official: false, protected: false } })
const source = [descriptor('a', 'Fixture A', ['catalog', 'meta', 'stream'], catalogs), descriptor('b', 'Fixture B', ['stream'], [])]
source[0].manifest.name = 'Fixture A with a long addon name that should stay beside its logo and action buttons'
source[0].manifest.description = 'A configurable addon with movie and series catalogs, search, metadata and streams. '.repeat(5)
source[0].manifest.behaviorHints = { configurable: true }
async function visibleButton(page, name) { return page.getByRole('button', { name, exact: true }).filter({ visible: true }) }
async function editFirst(page) {
  await page.getByRole('button', { name: 'Edit manifest', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Edit manifest', exact: true })
  await dialog.waitFor()
  return dialog
}
async function closeSaved(dialog) {
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
}
async function backup(page) {
  const pending = page.waitForEvent('download')
  await (await visibleButton(page, 'Backup configuration')).click()
  const download = await pending
  return JSON.parse(await readFile(await download.path(), 'utf8'))
}
async function sync(page) {
  await page.getByRole('button', { name: 'Review sync', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Review sync', exact: true })
  await review.waitFor()
  await capture(page, 'review')
  assert.match(await review.innerText(), /alpha@example.com/)
  await review.getByRole('button', { name: 'Sync to Stremio', exact: true }).click()
  await review.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Synced', exact: true }).waitFor()
}

let currentCase = ''
async function capture(page, name) {
  if (!output) return
  await mkdir(output, { recursive: true })
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].every(dialog => { const panel = dialog.querySelector('[tabindex="-1"]'); return !panel || getComputedStyle(panel).opacity === '1' }))
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))))
  await page.screenshot({ path: resolve(output, `${currentCase}-${name}.png`), fullPage: true })
}
async function readableRemember(page, theme) {
  const result = await page.locator('label').filter({ hasText: 'Keep me signed in' }).evaluate(label => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const rgb = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data] }
    const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] / 255 + bg[i] * (1 - fg[3] / 255))
    let bg = [255, 255, 255]
    const parents = []
    for (let node = label; node; node = node.parentElement) parents.unshift(node)
    for (const node of parents) bg = blend(rgb(getComputedStyle(node).backgroundColor), bg)
    const fg = blend(rgb(getComputedStyle(label).color), bg)
    const luminance = c => c.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
    return { contrast: (values[0] + 0.05) / (values[1] + 0.05), scheme: getComputedStyle(document.documentElement).colorScheme }
  })
  assert.ok(result.contrast >= 4.5, `${currentCase}: remember label contrast ${result.contrast}`)
  assert.equal(result.scheme, theme)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${currentCase}: landing overflow`)
}
async function addonRowLayout(page) {
  const desktop = page.viewportSize().width >= 640
  const rows = await page.locator('.reorder-card').evaluateAll(cards => cards.map(card => {
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, center: (r.top + r.bottom) / 2 } }
    const drag = card.querySelector('.drag-handle')
    return {
      row: rect(card), logo: rect(drag.nextElementSibling),
      text: rect(card.querySelector('h3').parentElement.parentElement),
      actions: rect(card.querySelector('button[aria-label="Copy manifest URL"]').parentElement),
    }
  }))
  assert.equal(rows.length, source.length)
  for (const { row, logo, text, actions } of rows) {
    assert.ok(text.right <= row.right && actions.right <= row.right, `${currentCase}: addon content overflows its card`)
    if (desktop) {
      assert.ok(Math.abs(logo.center - text.center) < 1, `${currentCase}: addon text wrapped below its logo`)
      assert.ok(Math.abs(logo.center - actions.center) < 1, `${currentCase}: addon actions wrapped below the text`)
      assert.ok(text.right <= actions.left, `${currentCase}: addon text overlaps the actions`)
    } else {
      assert.ok(actions.top >= text.bottom, `${currentCase}: mobile addon actions overlap the title`)
    }
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${currentCase}: addon list overflows the viewport`)
}
let preview
let diagnosticPage, diagnosticErrors
try {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(500) })
    if (!(await response.text()).includes('Stremio Addon Manager')) throw new Error('Port is serving another application.')
  } catch (error) {
    if (process.env.BROWSER_BASE_URL) throw error
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
    let ready = false
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      try { const response = await fetch(baseUrl); if (response.ok) { ready = true; break } } catch {}
    }
    if (!ready) throw new Error('Could not start preview. Run npm run build first.')
  }
  for (const mode of ['desktop', 'mobile']) for (const theme of ['light', 'dark']) {
    currentCase = `${mode}-${theme}`
    const context = await browser.newContext({ colorScheme: theme, viewport: mode === 'desktop' ? { width: 1280, height: 900 } : { width: 360, height: 800 }, isMobile: mode === 'mobile', hasTouch: mode === 'mobile', permissions: ['clipboard-read', 'clipboard-write'] })
    const remote = { 'fixture-key-a': copy(source), 'fixture-key-b': [descriptor('other', 'Other account addon', ['stream'], [])] }
    const writes = [], revocations = [], errors = []
    let failReads = false, failRevocation = false, loginCount = 0
    const externalRoute = async route => {
      const url = new URL(route.request().url())
      if (url.origin === new URL(baseUrl).origin) { await route.continue(); return }
      if (url.hostname === 'provider.example.com') {
        const id = url.pathname.split('/')[1]
        const manifest = id === 'needs-config' ? { ...source[0].manifest, id, behaviorHints: { configurable: true, configurationRequired: true } } : source.find(a => a.manifest.id === id)?.manifest
        if (manifest) { await route.fulfill({ json: manifest, headers: { 'access-control-allow-origin': '*' } }); return }
      }
      // Third-party logos are irrelevant to these tests. No external traffic.
      await route.abort()
    }
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).origin, 'https://api.strem.io')
      const endpoint = new URL(url).pathname.split('/').pop(), body = JSON.parse(options.body)
      if (endpoint === 'login') { loginCount++; return Response.json({ result: { authKey: 'fixture-key-a', user: { _id: 'A', email: 'alpha@example.com' } } }) }
      if (endpoint === 'getUser') return Response.json({ result: { _id: body.authKey === 'fixture-key-a' ? 'A' : 'B', email: body.authKey === 'fixture-key-a' ? 'alpha@example.com' : 'beta@example.com' } })
      if (endpoint === 'addonCollectionGet') {
        if (failReads) return Response.json({ error: { message: 'Simulated outage' } }, { status: 502 })
        return Response.json({ result: { addons: remote[body.authKey] } })
      }
      if (endpoint === 'addonCollectionSet') {
        writes.push(copy(body)); remote[body.authKey] = copy(body.addons)
        return Response.json({ result: { success: true } })
      }
      if (endpoint === 'logout') { revocations.push(body); return failRevocation ? Response.json({ error: { message: 'Simulated sign-out outage' } }, { status: 503 }) : Response.json({ result: { success: true } }) }
      throw new Error(`Unexpected API route: ${endpoint}`)
    }
    const apiRoute = async route => {
      const request = route.request()
      const response = await onRequest({ request: new Request(request.url(), { method: request.method(), headers: await request.allHeaders(), body: request.postData() }), env: { SESSION_SECRET: 'a7'.repeat(32) } })
      const headers = Object.fromEntries(response.headers)
      if (response.headers.getSetCookie().length) headers['set-cookie'] = response.headers.getSetCookie().join('\n')
      const body = await response.text()
      assert.ok(!body.includes('fixture-key-a') && !body.includes('fixture-key-b'), 'API response exposed an upstream key')
      await route.fulfill({ status: response.status, headers, body })
    }
    await context.route('**/*', externalRoute)
    await context.route('**/api/**', apiRoute)
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    diagnosticPage = page; diagnosticErrors = errors
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(baseUrl)
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    await readableRemember(page, theme)
    await page.getByRole('button', { name: 'Desktop', exact: true }).click()
    await page.getByText('Open browser console (', { exact: false }).waitFor()
    assert.equal(await page.getByText('Mobile bookmarklets can be inconsistent.', { exact: false }).count(), 0)
    await page.getByRole('button', { name: 'Mobile', exact: true }).click()
    await page.getByText('Mobile bookmarklets can be inconsistent.', { exact: false }).waitFor()
    assert.equal(await page.getByText('Open browser console (', { exact: false }).count(), 0)
    await page.getByRole('button', { name: mode === 'desktop' ? 'Desktop' : 'Mobile', exact: true }).click()
    const otherTheme = theme === 'dark' ? 'light' : 'dark'
    await page.getByRole('button', { name: 'Toggle Theme', exact: true }).click()
    await readableRemember(page, otherTheme)
    await page.getByRole('button', { name: 'Toggle Theme', exact: true }).click()
    await readableRemember(page, theme)
    await capture(page, 'sign-in')
    await page.evaluate(() => {
      localStorage.setItem('stremio_auth_key', 'legacy-active-fixture')
      localStorage.setItem('sam_saved_accounts', JSON.stringify([{ email: 'legacy@example.com', label: 'Legacy', authKey: 'legacy-saved-fixture', password: 'legacy-password-fixture' }]))
    })
    await page.reload()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => localStorage.getItem('stremio_auth_key')), null)
    assert.ok(!(await page.evaluate(() => localStorage.getItem('sam_saved_accounts'))).includes('legacy-saved-fixture'))
    await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill('alpha@example.com')
    await page.getByLabel('Password', { exact: true }).fill('fixture-password')
    await page.getByLabel('Keep me signed in', { exact: true }).check()
    await readableRemember(page, theme)
    await capture(page, 'remember')
    await page.getByRole('button', { name: 'Connect Account', exact: true }).click()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sam_saved_accounts') || '[]').some(a => a.email === 'alpha@example.com' && a.sessionId))
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('fixture-key-a'))
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('sam_workspace_')))
    assert.equal(await page.evaluate(() => document.cookie.includes('__Host-sam_')), false)
    const cookies = (await context.cookies()).filter(cookie => cookie.name.startsWith('__Host-sam_'))
    assert.equal(cookies.length, 2)
    assert.ok(cookies.every(cookie => cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict' && cookie.expires > Date.now() / 1000))
    await page.reload()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    assert.equal(loginCount, 1, 'refresh created a new Stremio session')

    const viewport = page.viewportSize()
    for (const width of mode === 'desktop' ? [1280, 1024, 768, 640] : [360, 320]) {
      await page.setViewportSize({ ...viewport, width })
      await addonRowLayout(page)
    }
    await page.setViewportSize(viewport)
    await capture(page, 'long-addon-rows')
    await page.evaluate(() => {
      const writeText = navigator.clipboard.writeText.bind(navigator.clipboard)
      navigator.clipboard.writeText = async () => {
        navigator.clipboard.writeText = writeText
        throw new DOMException('Clipboard access denied', 'NotAllowedError')
      }
    })
    await page.getByRole('button', { name: 'Copy manifest URL', exact: true }).first().click()
    const clipboardError = page.getByRole('status').filter({ hasText: 'Couldn’t copy the link.' })
    await clipboardError.waitFor()
    await addonRowLayout(page)
    assert.equal(await clipboardError.evaluate(error => {
      const actions = error.closest('.reorder-card').querySelector('button[aria-label="Copy manifest URL"]').parentElement
      return error.getBoundingClientRect().top >= actions.getBoundingClientRect().bottom
    }), true, `${currentCase}: clipboard error overlaps addon actions`)
    await capture(page, 'clipboard-error')
    await page.getByRole('button', { name: 'Copy manifest URL', exact: true }).first().click()
    await page.locator('button[title="Link copied"]').first().waitFor()
    await clipboardError.waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), source[0].transportUrl)
    let editor = await editFirst(page)
    await capture(page, 'editor')
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), true)
    await editor.getByRole('button', { name: 'JSON', exact: true }).click()
    const textarea = editor.getByLabel('Manifest source JSON', { exact: true })
    const original = JSON.parse(await textarea.inputValue())
    const invalid = copy(original); delete invalid.id
    await textarea.fill(JSON.stringify(invalid, null, 2))
    await editor.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await editor.getByRole('alert').waitFor()
    assert.match(await editor.getByRole('alert').innerText(), /manifest.id/)
    const renamed = { ...original, name: 'Edited A' }
    await textarea.fill(JSON.stringify(renamed, null, 2))
    await editor.getByRole('button', { name: 'Copy manifest JSON', exact: true }).click()
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes('Edited A'))
    assert.equal(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).name, 'Edited A')
    await closeSaved(editor)

    editor = await editFirst(page)
    await editor.getByRole('switch', { name: 'Search support', exact: true }).click()
    await closeSaved(editor)
    editor = await editFirst(page)
    assert.equal(await editor.getByRole('switch', { name: 'Search support', exact: true }).getAttribute('aria-checked'), 'false')
    for (const name of ['Search support', 'Home catalogs', 'Search support', 'Home catalogs', 'Search support']) await editor.getByRole('switch', { name, exact: true }).click()
    await closeSaved(editor)
    const exported = await backup(page)
    assert.deepEqual(exported.addons[0].manifest.catalogs, source[0].manifest.catalogs)
    assert.equal(exported.addons[0].manifest.name, 'Edited A')
    assert.ok(exported.editorStates[source[0].transportUrl])

    // Only the topmost dialog handles Escape; focus stays inside the editor.
    editor = await editFirst(page)
    await editor.getByPlaceholder('Addon Name', { exact: true }).fill('Unsaved name')
    await page.keyboard.press('Escape')
    const discard = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
    await discard.waitFor()
    assert.equal(await discard.getByRole('heading', { name: 'Discard unsaved changes?', exact: true }).count(), 1)
    const discardTitle = await discard.getAttribute('aria-labelledby')
    await page.waitForFunction(id => {
      const panel = document.getElementById(id)?.closest('[tabindex="-1"]')
      const dialog = panel?.closest('[role="dialog"]')
      return panel && getComputedStyle(panel).opacity === '1' && !dialog.inert && getComputedStyle(dialog).pointerEvents !== 'none'
    }, discardTitle)
    await capture(page, 'confirmation')
    assert.equal(await discard.evaluate(dialog => {
      const button = dialog.querySelector('button[aria-label="Close dialog"]')
      const rect = button.getBoundingClientRect()
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('[role="dialog"]') === dialog
    }), true, `${currentCase}: confirmation is behind another dialog`)
    await page.keyboard.press('Escape')
    await discard.waitFor({ state: 'hidden' })
    assert.equal(await editor.isVisible(), true)
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), true)
    await page.keyboard.press('Escape')
    await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => !document.getElementById('app').inert)
    assert.equal(writes.length, 0)
    await sync(page)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].authKey, 'fixture-key-a')
    assert.equal(remote['fixture-key-a'][0].manifest.name, 'Edited A')
    await page.getByRole('button', { name: 'Download recovery backup', exact: true }).waitFor()

    // Duplicate URLs offer replacement instead of appending a second install.
    await page.locator('button[title="Add New Addon"]:visible').click()
    let add = page.getByRole('dialog', { name: 'Add addon', exact: true })
    await add.waitFor()
    await capture(page, 'add-addon')
    await add.getByPlaceholder('https://example.com/manifest.json', { exact: true }).fill(source[0].transportUrl)
    await add.getByRole('button', { name: 'Add addon', exact: true }).click()
    const replace = page.getByRole('dialog', { name: 'Update existing addon?', exact: true })
    await replace.waitFor(); await replace.getByRole('button', { name: 'Cancel', exact: true }).click()
    await replace.waitFor({ state: 'hidden' })
    assert.equal((await backup(page)).addons.length, 2)
    await page.locator('button[title="Add New Addon"]:visible').click()
    add = page.getByRole('dialog', { name: 'Add addon', exact: true })
    await add.getByPlaceholder('https://example.com/manifest.json', { exact: true }).fill('https://provider.example.com/needs-config/manifest.json')
    await add.getByRole('button', { name: 'Add addon', exact: true }).click()
    await add.getByRole('link', { name: 'Configure addon', exact: true }).waitFor()
    await add.getByRole('button', { name: 'Cancel', exact: true }).click()
    await add.waitFor({ state: 'hidden' })

    failReads = true
    await page.getByRole('button', { name: 'Reload from Stremio', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Simulated outage' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Account menu', exact: true }).isVisible(), true)
    assert.equal((await backup(page)).addons.length, 2)
    failReads = false
    await page.getByRole('button', { name: 'Dismiss error', exact: true }).click()

    // Active auth is per tab: a second account and legacy storage writes cannot
    // change which key this tab uses for its draft.
    const other = await context.newPage()
    other.on('pageerror', error => errors.push(error.message))
    await other.goto(baseUrl)
    await other.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    await other.getByRole('button', { name: 'Account menu', exact: true }).click()
    await other.getByRole('menuitem', { name: 'Switch account', exact: true }).click()
    await other.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    await other.getByLabel('Email', { exact: true }).fill('unused@example.com')
    await other.getByLabel('Password', { exact: true }).fill('unused-password')
    await other.getByLabel('Stremio AuthKey', { exact: true }).fill('fixture-key-b')
    await other.getByRole('button', { name: 'Go', exact: true }).click()
    await other.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    await other.evaluate(() => localStorage.setItem('stremio_auth_key', 'fixture-key-b'))
    await page.reload()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    assert.equal((await backup(page)).addons[0].manifest.id, 'a')
    editor = await editFirst(page)
    await editor.getByPlaceholder('Addon Name', { exact: true }).fill('Edited again in A')
    await closeSaved(editor)
    await sync(page)
    assert.equal(writes.at(-1).authKey, 'fixture-key-a')
    assert.equal(remote['fixture-key-b'][0].manifest.id, 'other')

    if (output) {
      await mkdir(output, { recursive: true })
      await page.screenshot({ path: resolve(output, `${currentCase}-dashboard.png`), fullPage: true })
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${mode}: horizontal overflow`)

    // Discarding a staged edit must not replace the remembered restoration
    // source for an already-synced disabled capability.
    editor = await editFirst(page)
    await editor.getByRole('switch', { name: 'Search support', exact: true }).click()
    await closeSaved(editor)
    await sync(page)
    editor = await editFirst(page)
    await editor.getByPlaceholder('Addon Name', { exact: true }).fill('Discard this staged edit')
    await closeSaved(editor)
    await page.getByRole('button', { name: 'Account menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Switch account', exact: true }).click()
    const switchDialog = page.getByRole('dialog', { name: 'Discard local changes?', exact: true })
    await switchDialog.getByRole('button', { name: 'Discard and switch', exact: true }).click()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    await page.reload()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Account menu', exact: true }).count(), 0)
    await page.locator('button[aria-haspopup="listbox"]').click()
    await page.getByRole('option').filter({ hasText: 'alpha@example.com' }).click()
    assert.equal(await page.getByRole('button', { name: 'Account menu', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Connect Account', exact: true }).click()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Reload from Stremio"]:disabled'))
    editor = await editFirst(page)
    assert.equal(await editor.getByRole('switch', { name: 'Search support', exact: true }).getAttribute('aria-checked'), 'false')
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    // A fresh context has no tab memory: only persistent cookies and encrypted
    // local settings carry over, just as when reopening the browser.
    const storageState = await context.storageState()
    storageState.cookies = storageState.cookies.filter(cookie => cookie.expires > Date.now() / 1000)
    const reopened = await browser.newContext({ storageState, viewport: page.viewportSize() })
    await reopened.route('**/*', externalRoute)
    await reopened.route('**/api/**', apiRoute)
    const reopenedPage = await reopened.newPage()
    await reopenedPage.goto(baseUrl)
    await reopenedPage.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    assert.equal((await backup(reopenedPage)).addons[0].manifest.name, 'Edited again in A')
    assert.equal(loginCount, 1, 'browser reopen created a new Stremio session')
    await reopened.close()
    editor = await editFirst(page)
    await editor.getByRole('switch', { name: 'Search support', exact: true }).click()
    await closeSaved(editor)
    const restoredSource = await backup(page)
    assert.deepEqual(restoredSource.addons[0].manifest.catalogs, source[0].manifest.catalogs)
    assert.equal(restoredSource.addons[0].manifest.name, 'Edited again in A')
    await page.getByRole('button', { name: 'Account menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Sign out of Stremio', exact: true }).click()
    let revoke = page.getByRole('dialog', { name: 'Sign out of Stremio?', exact: true })
    failRevocation = true
    await revoke.getByRole('button', { name: 'Sign out of Stremio', exact: true }).click()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    await page.getByRole('alert').filter({ hasText: 'could not be confirmed' }).waitFor()
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('sam_saved_accounts')).some(a => a.email === 'alpha@example.com' && a.sessionId)))
    await page.locator('button[aria-haspopup="listbox"]').click()
    await page.getByRole('option').filter({ hasText: 'alpha@example.com' }).click()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).click()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    failRevocation = false
    await page.getByRole('button', { name: 'Account menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Sign out of Stremio', exact: true }).click()
    revoke = page.getByRole('dialog', { name: 'Sign out of Stremio?', exact: true })
    await revoke.getByRole('button', { name: 'Sign out of Stremio', exact: true }).click()
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('sam_saved_accounts')).some(a => a.email === 'alpha@example.com'))
    assert.deepEqual(revocations, Array(2).fill({ type: 'Logout', authKey: 'fixture-key-a' }))
    await page.reload()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Account menu', exact: true }).count(), 0)
    if (currentCase === 'desktop-light') {
      const legacy = { ...await encryptSavedSession('fixture-key-b', 'fixture-passphrase-123'), email: 'beta@example.com', userId: 'B', label: 'Legacy B' }
      await page.evaluate(account => {
        const accounts = JSON.parse(localStorage.getItem('sam_saved_accounts')).filter(saved => saved.email !== account.email)
        localStorage.setItem('sam_saved_accounts', JSON.stringify([...accounts, account]))
      }, legacy)
      await page.reload()
      await page.locator('button[aria-haspopup="listbox"]').click()
      await page.getByRole('option').filter({ hasText: 'Legacy B' }).click()
      await page.getByLabel('Saved account PIN or passphrase', { exact: true }).fill('fixture-passphrase-123')
      await page.getByRole('button', { name: 'Unlock', exact: true }).click()
      await page.getByText('Unlocked. Select Go to connect to Stremio.', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Go', exact: true }).click()
      await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('sam_saved_accounts')).some(a => a.email === 'beta@example.com' && a.sessionId && !a.authKeyEncrypted && a.label === 'Legacy B'))
      await page.getByRole('button', { name: 'Account menu', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Switch account', exact: true }).click()
      await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    }
    await page.getByLabel('Keep me signed in', { exact: true }).uncheck()
    await page.getByLabel('Stremio AuthKey', { exact: true }).fill('fixture-key-b')
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    const sessionOnlyId = await page.evaluate(() => sessionStorage.getItem('sam_active_session'))
    assert.equal((await context.cookies()).find(cookie => cookie.name === `__Host-sam_${sessionOnlyId}`).expires, -1)
    await page.reload()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    assert.equal(loginCount, 1)
    assert.ok(!(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, tab: { ...sessionStorage } }))).includes('fixture-key'))
    assert.deepEqual(errors, [])
    console.log(`PASS ${currentCase}: cookie login, refresh/browser reopen, encrypted settings, account isolation, failed/successful revocation, layout, JSON validation, toggles, nested dialogs and sync`)
    await context.close()
  }
} catch (error) {
  console.error('Browser diagnostics:', JSON.stringify({ errors: diagnosticErrors, body: diagnosticPage ? (await diagnosticPage.locator('body').innerText()).slice(0, 5000) : '' }))
  if (output && diagnosticPage) { await mkdir(output, { recursive: true }); await diagnosticPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }) }
  throw error
} finally { globalThis.fetch = originalFetch; await browser.close(); preview?.kill() }
