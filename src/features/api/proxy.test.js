import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequest } from '../../../functions/api/[[path]].js'
import { readJsonLimited, fetchJson, ApiError } from './http.js'
import { validateManifestUrl, trustedManifestOrigin } from './manifestUrlValidation.js'

const manifest = { id: 'fixture', version: '1.0.0', name: 'Fixture', types: ['movie'], resources: ['catalog'], catalogs: [] }
const request = (route, body, headers = {}) => new Request(`https://manager.example.com/api/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
async function withFetch(mock, run) { const original = globalThis.fetch; globalThis.fetch = mock; try { await run() } finally { globalThis.fetch = original } }

test('URL guard handles mapped IPv6, the full link-local range and alternate IPv4 spellings', () => {
  for (const url of ['http://[::ffff:127.0.0.1]/manifest.json', 'http://[fe90::1]/manifest.json', 'http://localhost./manifest.json', 'http://127.1/manifest.json', 'http://0x7f000001/manifest.json', 'http://100.64.0.1/manifest.json']) assert.equal(validateManifestUrl(url).ok, false, url)
  for (const url of ['https://fc-addon.example.com/manifest.json', 'https://fdmedia.example.com/manifest.json', 'https://[2606:4700:4700::1111]/manifest.json']) assert.equal(validateManifestUrl(url).ok, true, url)
})
test('trusted proxy origins are exact origins, not suffixes, credentials or arbitrary URLs', () => {
  assert.equal(trustedManifestOrigin('https://good.example.com/key/manifest.json', 'https://good.example.com'), true)
  for (const url of ['https://good.example.com.attacker.com/manifest.json', 'http://good.example.com/manifest.json', 'https://other.example.com/manifest.json']) assert.equal(trustedManifestOrigin(url, 'https://good.example.com'), false)
  assert.equal(trustedManifestOrigin('https://good.example.com/manifest.json', ''), false)
})
test('unconfigured manifest proxy never fetches a caller-controlled destination', async () => {
  let count = 0
  await withFetch(async () => { count++; throw new Error('Must not fetch') }, async () => {
    const response = await onRequest({ request: request('manifest', { url: 'https://127.0.0.1.nip.io/manifest.json' }) })
    assert.equal(response.status, 403)
    assert.equal(count, 0)
  })
})
test('manifest proxy fetches a configured trusted origin without following redirects', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, 'https://good.example.com/manifest.json')
    assert.equal(options.redirect, 'manual')
    assert.ok(options.signal)
    return Response.json(manifest)
  }, async () => {
    const response = await onRequest({ request: request('manifest', { url: 'https://good.example.com/manifest.json' }), env: { MANIFEST_PROXY_ORIGINS: 'https://good.example.com' } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), manifest)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  })
})
test('redirects to another destination cannot bypass the origin policy', async () => {
  let count = 0
  await withFetch(async () => { count++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }) }, async () => {
    const response = await onRequest({ request: request('manifest', { url: 'https://good.example.com/manifest.json' }), env: { MANIFEST_PROXY_ORIGINS: 'https://good.example.com' } })
    assert.equal(response.status, 400); assert.equal(count, 1)
  })
})
test('streaming limits cancel early rather than buffering an entire oversized response', async () => {
  let produced = 0, cancelled = false
  const response = new Response(new ReadableStream({
    pull(controller) { produced++; controller.enqueue(new Uint8Array(65536)) },
    cancel() { cancelled = true },
  }))
  await assert.rejects(readJsonLimited(response, 1024 * 1024), error => error.status === 413)
  assert.equal(cancelled, true)
  assert.ok(produced <= 18)
})
test('byte limit counts UTF-8 bytes rather than character count', async () => {
  await assert.rejects(readJsonLimited(new Response(JSON.stringify({ ...manifest, description: 'অ'.repeat(400000) })), 1024 * 1024), error => error.status === 413)
})
test('logout is routed with a bounded request and a server-controlled operation type', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, 'https://api.strem.io/api/logout')
    assert.deepEqual(JSON.parse(options.body), { type: 'Logout', authKey: 'fixture-key' })
    assert.ok(options.signal)
    return Response.json({ result: { success: true } })
  }, async () => {
    const response = await onRequest({ request: request('logout', { authKey: 'fixture-key', type: 'DeleteAccount' }) })
    assert.equal(response.status, 200)
  })
})
test('API routes reject scalar JSON, missing keys, cross-site requests and wrong methods', async () => {
  assert.equal((await onRequest({ request: request('addonCollectionSet', '42') })).status, 400)
  assert.equal((await onRequest({ request: request('addonCollectionSet', '{') })).status, 400)
  assert.equal((await onRequest({ request: request('getUser', {}) })).status, 400)
  assert.equal((await onRequest({ request: request('login', {}, { origin: 'https://attacker.example.com' }) })).status, 403)
  assert.equal((await onRequest({ request: new Request('https://manager.example.com/api/logout') })).status, 405)
})
test('proxy rejects malformed manifests before they can reach the editor', async () => {
  await withFetch(async () => Response.json({ id: 123, version: {} }), async () => {
    const response = await onRequest({ request: request('manifest', { url: 'https://good.example.com/manifest.json' }), env: { MANIFEST_PROXY_ORIGINS: 'https://good.example.com' } })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error.message, /manifest.id/)
  })
})
test('HTTP-200 Stremio error envelopes are failures, including on sign out', async () => {
  await withFetch(async () => Response.json({ error: { code: 102, message: 'Invalid session' } }), async () => {
    await assert.rejects(fetchJson('https://manager.example.com/api/logout'), error => error instanceof ApiError && error.code === 102 && error.message === 'Invalid session')
  })
})
test('frontend deadlines release listeners and classify a timed-out request', async () => {
  await withFetch(async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })), async () => {
    await assert.rejects(fetchJson('https://fixture.example.com', {}, { timeoutMs: 10 }), error => error.kind === 'timeout')
  })
})
