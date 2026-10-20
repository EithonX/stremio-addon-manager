import { validateManifestUrl, trustedManifestOrigin } from '../../src/features/api/manifestUrlValidation.js'
import { ApiError, readJsonLimited, requestDeadline } from '../../src/features/api/http.js'
import { validateManifest, validateAddonCollection, requireConfiguredAddons } from '../../src/features/addons/manifestSchema.js'
import { clearActiveCookie, clearSessionCookies, issueSession, openWorkspace, publicSession, readSession, refreshSessionCookies, requireSessionConfiguration, sealWorkspace } from '../../server/browserSession.js'

const API = 'https://api.strem.io/api'
const ROUTES = new Set(['login', 'session', 'sessionWorkspace', 'getUser', 'logout', 'addonCollectionGet', 'addonCollectionSet', 'manifest'])
const MAX_COLLECTION_BYTES = 4 * 1024 * 1024
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
const json = (body, status = 200, cookies = []) => {
  const headers = new Headers(HEADERS)
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(JSON.stringify(body), { status, headers })
}
const failure = (message, status, code = '') => json({ error: { message, code } }, status)
function requireString(value, name, maximum = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new ApiError(`${name} is missing or invalid.`, { status: 400 })
  return value
}
async function upstreamApi(route, payload, request) {
  const deadline = requestDeadline(request.signal, 12000)
  try {
    const upstream = await fetch(`${API}/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload), redirect: 'manual', signal: deadline.signal })
    if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); throw new ApiError('Unexpected Stremio redirect.', { status: 502 }) }
    return { data: await readJsonLimited(upstream, MAX_COLLECTION_BYTES), status: upstream.status }
  } finally { deadline.dispose() }
}
function resultOf({ data, status }) {
  if (status < 200 || status >= 300 || data?.error) throw new ApiError(data?.error?.message || 'Stremio could not complete this request.', { status: status >= 400 ? status : 400, code: data?.error?.code || '' })
  return data?.result
}
function sessionUser(user) {
  return { id: requireString(user?._id || user?.id, 'User ID', 256), email: requireString(user?.email, 'Account email', 320) }
}
async function sessionRequest(body, request, env) {
  await requireSessionConfiguration(env) // Check before creating a Stremio session.
  if (body.action === 'create') {
    let key, user, newlyIssued = false, issued = false
    try {
      if (body.authKey) key = requireString(body.authKey, 'AuthKey', 1024).trim()
      else {
        const result = resultOf(await upstreamApi('login', { email: requireString(body.email, 'Email', 320), password: requireString(body.password, 'Password') }, request))
        key = requireString(result?.authKey, 'AuthKey', 1024)
        user = result?.user
        newlyIssued = true
      }
      if (!user) user = resultOf(await upstreamApi('getUser', { type: 'GetUser', authKey: key }, request))
      user = sessionUser(user)
      if (body.expectedUserId && body.expectedUserId !== user.id) throw new ApiError('This saved account does not match the Stremio account. Sign in again.', { status: 400 })
      const created = await issueSession({ authKey: key, user, origin: newlyIssued ? 'password' : 'imported', persistent: body.persistent !== false }, request, env)
      issued = true
      return json({ result: { ...publicSession(created.session), newlyIssued } }, 200, created.cookies)
    } finally {
      if (newlyIssued && key && !issued) {
        try { await upstreamApi('logout', { type: 'Logout', authKey: key }, new Request(request.url)) } catch { /* Never expose a key in an error. */ }
      }
    }
  }
  const session = await readSession(body.sessionId, request, env, { optional: body.action === 'resume' && !body.sessionId })
  if (!session) return json({ result: null })
  if (body.action === 'resume') {
    const user = sessionUser(resultOf(await upstreamApi('getUser', { type: 'GetUser', authKey: session.authKey }, request)))
    if (user.id !== session.user.id || body.expectedUserId && body.expectedUserId !== user.id) throw new ApiError('This saved account does not match the Stremio account. Sign in again.', { status: 401 })
    session.user = user
    if (typeof body.persistent === 'boolean') session.persistent = body.persistent
    return json({ result: publicSession(session) }, 200, await refreshSessionCookies(session, request, env))
  }
  if (body.action === 'disconnect') return json({ result: { success: true } }, 200, clearActiveCookie(request, session.id))
  if (body.action === 'forget') return json({ result: { success: true } }, 200, clearSessionCookies(request, session.id))
  throw new ApiError('Unknown session action.', { status: 400 })
}

export async function onRequest({ request, env = {} }) {
  const url = new URL(request.url)
  const route = url.pathname.slice('/api/'.length)
  if (!url.pathname.startsWith('/api/') || !ROUTES.has(route)) return failure('Not found.', 404)
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: { message: 'Use POST with a JSON body.' } }), { status: 405, headers: { ...HEADERS, allow: 'POST' } })
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return failure('Cross-origin API requests are not allowed.', 403)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure('Use application/json.', 415)
  try {
    if (env.API_RATE_LIMITER?.limit) {
      const outcome = await env.API_RATE_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' })
      if (!outcome.success) return failure('Too many requests. Try again shortly.', 429)
    }
    let body
    try { body = await readJsonLimited(new Response(request.body, { headers: request.headers }), route === 'sessionWorkspace' ? 6 * 1024 * 1024 : route === 'addonCollectionSet' ? MAX_COLLECTION_BYTES : 16384) }
    catch (error) { if (error.kind === 'protocol') return failure('Request body must be valid JSON.', 400); throw error }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return failure('Request body must be an object.', 400)
    if (route === 'session' || route === 'login') return await sessionRequest(route === 'login' ? { ...body, action: 'create', authKey: undefined } : body, request, env)
    if (route === 'sessionWorkspace') {
      const session = await readSession(body.sessionId, request, env)
      if (body.action === 'seal') {
        if (!body.workspace || typeof body.workspace !== 'object') return failure('Saved account settings are invalid.', 400)
        if (new TextEncoder().encode(JSON.stringify(body.workspace)).byteLength > 4 * 1024 * 1024) return failure('Saved account settings are too large. Download a backup instead.', 413)
        return json({ result: { ciphertext: await sealWorkspace(body.workspace, session, request, env) } })
      }
      if (body.action === 'open') {
        const user = sessionUser(resultOf(await upstreamApi('getUser', { type: 'GetUser', authKey: session.authKey }, request)))
        if (user.id !== session.user.id) return failure('This saved account does not match the Stremio account. Sign in again.', 401)
        return json({ result: await openWorkspace(requireString(body.ciphertext, 'Saved settings', 6 * 1024 * 1024), session, request, env) })
      }
      return failure('Unknown saved-settings action.', 400)
    }
    if (route === 'manifest') {
      const validated = validateManifestUrl(body.url)
      if (!validated.ok) return failure(validated.message, 400)
      // Trust is configured by the deployment, never granted by a caller's URL.
      // DNS lookups followed by a separately-resolved fetch do not prevent rebinding.
      if (!trustedManifestOrigin(validated.url, env.MANIFEST_PROXY_ORIGINS)) {
        return failure('This provider does not allow direct browser access and is not enabled by this deployment’s manifest proxy policy.', 403, 'MANIFEST_ORIGIN_NOT_TRUSTED')
      }
      const deadline = requestDeadline(request.signal, 10000)
      try {
        const upstream = await fetch(validated.url, { headers: { accept: 'application/json' }, redirect: 'manual', signal: deadline.signal })
        if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return failure('Manifest redirects are not allowed. Use the final manifest URL.', 400) }
        if (!upstream.ok) { await upstream.body?.cancel(); return failure(`Provider returned HTTP ${upstream.status}.`, 502) }
        return json(validateManifest(await readJsonLimited(upstream, 1024 * 1024)))
      } finally { deadline.dispose() }
    }
    let payload, session
    {
      session = body.sessionId ? await readSession(body.sessionId, request, env) : null
      const authKey = session?.authKey || requireString(body.authKey, 'AuthKey')
      const type = { getUser: 'GetUser', logout: 'Logout', addonCollectionGet: 'AddonCollectionGet', addonCollectionSet: 'AddonCollectionSet' }[route]
      payload = { type, authKey }
      if (route === 'addonCollectionGet') payload.update = false
      if (route === 'addonCollectionSet') payload.addons = requireConfiguredAddons(validateAddonCollection(body.addons))
    }
    const { data, status } = await upstreamApi(route, payload, request)
    const cleared = route === 'logout' && session && status >= 200 && status < 300 && data?.result?.success === true ? clearSessionCookies(request, session.id) : []
    return json(data, status, cleared)
  } catch (error) {
    // Do not log exception text: fetch errors can contain secret-bearing URLs.
    if (error.name === 'ValidationError') return failure(error.message, 400)
    if (error instanceof ApiError) return failure(error.message, error.status || 502, error.code)
    if (['AbortError', 'TimeoutError'].includes(error.name)) return failure('Upstream request timed out or was cancelled. Check the result before retrying a sync.', 504)
    return failure('Could not reach the upstream service. Your local changes have been kept.', 502)
  }
}
