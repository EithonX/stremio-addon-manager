import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

// Build and preview the application first. All account/provider responses are
// fixtures; this suite never sends credentials or requests to real services.
const baseUrl = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:4173'
const output = process.env.BROWSER_ARTIFACT_DIR
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
  assert.match(await review.innerText(), /alpha@example.com/)
  await review.getByRole('button', { name: 'Sync reviewed changes', exact: true }).click()
  await review.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Synced', exact: true }).waitFor()
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
  for (const mode of ['desktop', 'mobile']) {
    const context = await browser.newContext({ viewport: mode === 'desktop' ? { width: 1280, height: 900 } : { width: 360, height: 800 }, isMobile: mode === 'mobile', hasTouch: mode === 'mobile', permissions: ['clipboard-read', 'clipboard-write'] })
    const remote = { 'fixture-key-a': copy(source), 'fixture-key-b': [descriptor('other', 'Other account addon', ['stream'], [])] }
    const writes = [], revocations = [], errors = []
    let failReads = false
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === new URL(baseUrl).origin) { await route.continue(); return }
      if (url.hostname === 'provider.example.com') {
        const id = url.pathname.split('/')[1]
        const manifest = id === 'needs-config' ? { ...source[0].manifest, id, behaviorHints: { configurable: true, configurationRequired: true } } : source.find(a => a.manifest.id === id)?.manifest
        if (manifest) { await route.fulfill({ json: manifest, headers: { 'access-control-allow-origin': '*' } }); return }
      }
      // Third-party logos are irrelevant to these tests. No external traffic.
      await route.abort()
    })
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      assert.equal(url.origin, new URL(baseUrl).origin)
      const body = route.request().postDataJSON()
      const endpoint = url.pathname.split('/').pop()
      if (endpoint === 'login') { await route.fulfill({ json: { result: { authKey: 'fixture-key-a', user: { _id: 'A', email: 'alpha@example.com' } } } }); return }
      if (endpoint === 'getUser') { await route.fulfill({ json: { result: { _id: body.authKey === 'fixture-key-a' ? 'A' : 'B', email: body.authKey === 'fixture-key-a' ? 'alpha@example.com' : 'beta@example.com' } } }); return }
      if (endpoint === 'addonCollectionGet') {
        if (failReads) { await route.fulfill({ status: 502, json: { error: { message: 'Simulated outage' } } }); return }
        await route.fulfill({ json: { result: { addons: remote[body.authKey] } } }); return
      }
      if (endpoint === 'addonCollectionSet') {
        writes.push(copy(body)); remote[body.authKey] = copy(body.addons)
        await route.fulfill({ json: { result: { success: true } } }); return
      }
      if (endpoint === 'logout') { revocations.push(body); await route.fulfill({ json: { result: { success: true } } }); return }
      throw new Error(`Unexpected API route: ${endpoint}`)
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    diagnosticPage = page; diagnosticErrors = errors
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(baseUrl)
    await page.evaluate(() => {
      localStorage.setItem('stremio_auth_key', 'legacy-active-fixture')
      localStorage.setItem('sam_saved_accounts', JSON.stringify([{ email: 'legacy@example.com', label: 'Legacy', authKey: 'legacy-saved-fixture', password: 'legacy-password-fixture' }]))
    })
    await page.reload()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => localStorage.getItem('stremio_auth_key')), null)
    assert.ok(!(await page.evaluate(() => localStorage.getItem('sam_saved_accounts'))).includes('legacy-saved-fixture'))
    await page.getByLabel('Email', { exact: true }).fill('alpha@example.com')
    await page.getByLabel('Password', { exact: true }).fill('fixture-password')
    await page.getByLabel('Remember this account with encryption', { exact: true }).check()
    await page.getByLabel('Vault passphrase', { exact: true }).fill('fixture-passphrase-123')
    await page.getByRole('button', { name: 'Connect Account', exact: true }).click()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sam_saved_accounts') || '[]').some(a => a.email === 'alpha@example.com' && a.vaultVersion === 2))
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('fixture-key-a'))

    let editor = await editFirst(page)
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
    await add.getByRole('link', { name: 'Open provider configuration', exact: true }).waitFor()
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
    await other.getByLabel('Stremio AuthKey', { exact: true }).fill('fixture-key-b')
    await other.getByRole('button', { name: 'Go', exact: true }).click()
    await other.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    await other.evaluate(() => localStorage.setItem('stremio_auth_key', 'fixture-key-b'))
    editor = await editFirst(page)
    await editor.getByPlaceholder('Addon Name', { exact: true }).fill('Edited again in A')
    await closeSaved(editor)
    await sync(page)
    assert.equal(writes.at(-1).authKey, 'fixture-key-a')
    assert.equal(remote['fixture-key-b'][0].manifest.id, 'other')

    if (output) {
      await mkdir(output, { recursive: true })
      await page.screenshot({ path: resolve(output, `${mode}-dashboard.png`), fullPage: true })
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
    await page.getByRole('menuitem', { name: 'Switch Account', exact: true }).click()
    const switchDialog = page.getByRole('dialog', { name: 'Discard local changes?', exact: true })
    await switchDialog.getByRole('button', { name: 'Discard and switch', exact: true }).click()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    await page.reload()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Account menu', exact: true }).count(), 0)
    await page.locator('button[aria-haspopup="listbox"]').click()
    await page.getByRole('option').filter({ hasText: 'alpha@example.com' }).click()
    await page.getByLabel('Saved account PIN or passphrase', { exact: true }).fill('fixture-passphrase-123')
    await page.getByLabel('Saved account PIN or passphrase', { exact: true }).press('Enter')
    await page.getByText('Unlocked in this tab. Connect to verify the account with Stremio.', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Account menu', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Reload from Stremio"]:disabled'))
    editor = await editFirst(page)
    assert.equal(await editor.getByRole('switch', { name: 'Search support', exact: true }).getAttribute('aria-checked'), 'false')
    await editor.getByRole('switch', { name: 'Search support', exact: true }).click()
    await closeSaved(editor)
    const restoredSource = await backup(page)
    assert.deepEqual(restoredSource.addons[0].manifest.catalogs, source[0].manifest.catalogs)
    assert.equal(restoredSource.addons[0].manifest.name, 'Edited again in A')
    await page.getByRole('button', { name: 'Account menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Sign out & revoke', exact: true }).click()
    const revoke = page.getByRole('dialog', { name: 'Sign out and revoke this session?', exact: true })
    await revoke.getByRole('button', { name: 'Sign out and revoke', exact: true }).click()
    await page.getByRole('button', { name: 'Connect Account', exact: true }).waitFor()
    assert.deepEqual(revocations, [{ type: 'Logout', authKey: 'fixture-key-a' }])
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sam_saved_accounts')).find(a => a.email === 'alpha@example.com').authKeyEncrypted ?? null), null)
    assert.deepEqual(errors, [])
    console.log(`PASS ${mode}: login, encrypted persistence, JSON validation/copy, reversible toggles, nested Escape, review/sync/recovery, duplicate/config checks, transient errors, account isolation and revocation`)
    await context.close()
  }
} catch (error) {
  console.error('Browser diagnostics:', JSON.stringify({ errors: diagnosticErrors, body: diagnosticPage ? (await diagnosticPage.locator('body').innerText()).slice(0, 5000) : '' }))
  if (output && diagnosticPage) { await mkdir(output, { recursive: true }); await diagnosticPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }) }
  throw error
} finally { await browser.close(); preview?.kill() }
