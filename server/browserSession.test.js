import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequest } from '../functions/api/[[path]].js'
import { ACTIVE_COOKIE, SESSION_SECONDS } from './browserSession.js'

const env = { SESSION_SECRET: 'a7'.repeat(32) }
const origin = 'https://manager.example.com'
const addon = { transportUrl: 'https://provider.example.com/private/manifest.json', manifest: { id: 'fixture', version: '1.0.0', name: 'Fixture', types: ['movie'], resources: [], catalogs: [] } }

async function fixture(run) {
  const original = globalThis.fetch
  const calls = [], validKeys = new Set(['fixture-key-a', 'fixture-key-b'])
  let failLogout = false
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('https://api.strem.io/api/'))
    const body = JSON.parse(options.body), route = String(url).split('/').pop()
    calls.push({ route, body })
    if (route === 'login') return Response.json({ result: { authKey: 'fixture-key-a', user: { _id: 'A', email: 'a@example.com' } } })
    if (!validKeys.has(body.authKey)) return Response.json({ error: { message: 'Session ended', code: 102 } })
    if (route === 'getUser') return Response.json({ result: { _id: body.authKey.endsWith('a') ? 'A' : 'B', email: body.authKey.endsWith('a') ? 'a@example.com' : 'b@example.com' } })
    if (route === 'logout') {
      if (failLogout) return Response.json({ error: { message: 'Temporary outage' } }, { status: 503 })
      validKeys.delete(body.authKey)
      return Response.json({ result: { success: true } })
    }
    if (route === 'addonCollectionGet') return Response.json({ result: { addons: [addon] } })
    if (route === 'addonCollectionSet') return Response.json({ result: { success: true } })
    throw new Error(`Unexpected upstream route: ${route}`)
  }
  async function send(route, body, jar = new Map(), extra = {}) {
    const request = new Request(`${origin}/api/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), ...extra.headers }, body: JSON.stringify(body) })
    const response = await onRequest({ request, env: extra.env || env })
    for (const header of response.headers.getSetCookie()) {
      const [name, ...rest] = header.split(';')[0].split('=')
      if (/Max-Age=0(?:;|$)/.test(header)) jar.delete(name)
      else jar.set(name, rest.join('='))
    }
    return { response, data: await response.json() }
  }
  try { await run({ send, calls, validKeys, failLogout: value => { failLogout = value } }) }
  finally { globalThis.fetch = original }
}

test('missing session secret fails before creating an upstream login; anonymous resume stays anonymous', async () => {
  await fixture(async ({ send, calls }) => {
    assert.equal((await send('session', { action: 'create', email: 'a@example.com', password: 'fixture-password' }, new Map(), { env: {} })).response.status, 503)
    assert.equal(calls.length, 0)
    assert.equal((await send('session', { action: 'resume' })).data.result, null)
    assert.equal(calls.length, 0)
  })
})

test('persistent HttpOnly cookies resume the existing key without returning credentials or creating another login', async () => {
  await fixture(async ({ send, calls }) => {
    const jar = new Map()
    const created = await send('session', { action: 'create', email: 'a@example.com', password: 'fixture-password' }, jar)
    assert.equal(created.response.status, 200)
    assert.ok(!JSON.stringify(created.data).includes('fixture-key-a'))
    const session = created.data.result
    assert.match(session.authKey, /^sam-session:[a-f0-9]{32}$/)
    for (const header of created.response.headers.getSetCookie()) {
      for (const attribute of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict']) assert.ok(header.includes(attribute), header)
      assert.match(header, /Max-Age=\d+/)
      assert.ok(!header.includes('fixture-key-a'))
    }
    assert.equal(created.response.headers.get('cache-control'), 'no-store')
    assert.equal((await send('session', { action: 'resume' }, jar)).data.result.sessionId, session.sessionId)
    await send('addonCollectionSet', { sessionId: session.sessionId, addons: [addon], authKey: 'attacker-key', type: 'DeleteAccount' }, jar)
    assert.equal(calls.filter(call => call.route === 'login').length, 1)
    assert.deepEqual(calls.at(-1).body, { type: 'AddonCollectionSet', authKey: 'fixture-key-a', addons: [addon] })
    const reopened = new Map(jar) // A browser restart retains persistent cookies.
    assert.equal((await send('session', { action: 'resume' }, reopened)).data.result.user._id, 'A')
    assert.equal(calls.filter(call => call.route === 'login').length, 1)
  })
})

test('session-only cookies survive reload without a disk lifetime and have a server-enforced absolute expiry', async () => {
  await fixture(async ({ send }) => {
    const jar = new Map()
    const created = await send('session', { action: 'create', authKey: 'fixture-key-a', persistent: false }, jar)
    assert.equal(created.data.result.origin, 'imported')
    for (const header of created.response.headers.getSetCookie()) assert.ok(!header.includes('Max-Age='))
    assert.equal((await send('session', { action: 'resume', sessionId: created.data.result.sessionId }, jar)).response.status, 200)
    const now = Date.now
    Date.now = () => now() + (SESSION_SECONDS + 1) * 1000
    try { assert.equal((await send('session', { action: 'resume' }, jar)).response.status, 401) }
    finally { Date.now = now }
  })
})

test('reconnecting the same key reuses its cookie instead of accumulating duplicate saved credentials', async () => {
  await fixture(async ({ send }) => {
    const jar = new Map()
    const first = await send('session', { action: 'create', authKey: 'fixture-key-a' }, jar)
    const second = await send('session', { action: 'create', authKey: 'fixture-key-a', persistent: false }, jar)
    assert.equal(second.data.result.sessionId, first.data.result.sessionId)
    assert.equal(second.data.result.persistent, false)
    assert.equal(jar.size, 2)
  })
})

test('a selector alone, a modified cookie, and cross-origin requests cannot authenticate', async () => {
  await fixture(async ({ send }) => {
    const jar = new Map()
    const id = (await send('session', { action: 'create', authKey: 'fixture-key-a' }, jar)).data.result.sessionId
    assert.equal((await send('getUser', { sessionId: id })).response.status, 401)
    assert.equal((await send('getUser', { sessionId: 'b'.repeat(32) }, jar)).response.status, 401)
    const changed = new Map(jar), name = `__Host-sam_${id}`
    const value = changed.get(name)
    changed.set(name, `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`)
    assert.equal((await send('getUser', { sessionId: id }, changed)).response.status, 401)
    assert.equal((await send('getUser', { sessionId: id }, jar, { headers: { origin: 'https://attacker.example.com' } })).response.status, 403)
    assert.equal((await send('session', { action: 'resume' }, jar, { headers: { 'sec-fetch-site': 'cross-site' } })).response.status, 403)
  })
})

test('per-tab selectors keep account A requests on A after another tab activates B; switching does not revoke either key', async () => {
  await fixture(async ({ send, calls, validKeys }) => {
    const jar = new Map()
    const a = (await send('session', { action: 'create', authKey: 'fixture-key-a' }, jar)).data.result
    const b = (await send('session', { action: 'create', authKey: 'fixture-key-b' }, jar)).data.result
    assert.equal(jar.get(ACTIVE_COOKIE), b.sessionId)
    assert.equal((await send('getUser', { sessionId: a.sessionId }, jar)).data.result._id, 'A')
    await send('session', { action: 'disconnect', sessionId: a.sessionId }, jar)
    assert.equal(jar.get(ACTIVE_COOKIE), b.sessionId)
    await send('session', { action: 'disconnect', sessionId: b.sessionId }, jar)
    assert.equal(jar.has(ACTIVE_COOKIE), false)
    assert.equal(calls.filter(call => call.route === 'logout').length, 0)
    assert.equal(validKeys.size, 2)
    assert.equal((await send('session', { action: 'resume', sessionId: a.sessionId }, jar)).data.result.user._id, 'A')
  })
})

test('confirmed Stremio logout clears its cookie; failed logout keeps the saved credential for retry', async () => {
  await fixture(async ({ send, failLogout, calls }) => {
    const jar = new Map()
    const session = (await send('session', { action: 'create', authKey: 'fixture-key-a' }, jar)).data.result
    failLogout(true)
    const failed = await send('logout', { sessionId: session.sessionId }, jar)
    assert.equal(failed.response.status, 503)
    assert.equal(failed.response.headers.getSetCookie().length, 0)
    assert.equal((await send('session', { action: 'resume' }, jar)).response.status, 200)
    failLogout(false)
    const revoked = await send('logout', { sessionId: session.sessionId }, jar)
    assert.equal(revoked.data.result.success, true)
    assert.equal(jar.size, 0)
    assert.equal((await send('session', { action: 'resume', sessionId: session.sessionId }, jar)).response.status, 401)
    assert.deepEqual(calls.at(-1).body, { type: 'Logout', authKey: 'fixture-key-a' })
  })
})

test('local settings are encrypted, bound to the account/session, and cannot be substituted for a login cookie', async () => {
  await fixture(async ({ send, validKeys }) => {
    const jar = new Map()
    const a = (await send('session', { action: 'create', authKey: 'fixture-key-a' }, jar)).data.result
    const b = (await send('session', { action: 'create', authKey: 'fixture-key-b' }, jar)).data.result
    const workspace = { editorStates: { private: { url: addon.transportUrl } }, recovery: { userId: 'A', addons: [addon] } }
    const ciphertext = (await send('sessionWorkspace', { action: 'seal', sessionId: a.sessionId, workspace }, jar)).data.result.ciphertext
    assert.ok(!ciphertext.includes('provider.example.com'))
    assert.deepEqual((await send('sessionWorkspace', { action: 'open', sessionId: a.sessionId, ciphertext }, jar)).data.result, workspace)
    assert.equal((await send('sessionWorkspace', { action: 'open', sessionId: b.sessionId, ciphertext }, jar)).response.status, 400)
    const substituted = new Map(jar)
    substituted.set(`__Host-sam_${a.sessionId}`, ciphertext)
    assert.equal((await send('getUser', { sessionId: a.sessionId }, substituted)).response.status, 401)
    validKeys.delete('fixture-key-a')
    assert.equal((await send('sessionWorkspace', { action: 'open', sessionId: a.sessionId, ciphertext }, jar)).response.status, 400)
  })
})
