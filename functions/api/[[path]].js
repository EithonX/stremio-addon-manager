import { validateManifestUrl, trustedManifestOrigin } from '../../src/features/api/manifestUrlValidation.js'
import { ApiError, readJsonLimited, requestDeadline } from '../../src/features/api/http.js'
import { validateManifest, validateAddonCollection, requireConfiguredAddons } from '../../src/features/addons/manifestSchema.js'

const API = 'https://api.strem.io/api'
const ROUTES = new Set(['login', 'getUser', 'logout', 'addonCollectionGet', 'addonCollectionSet', 'manifest'])
const MAX_COLLECTION_BYTES = 4 * 1024 * 1024
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS })
const failure = (message, status, code = '') => json({ error: { message, code } }, status)
function requireString(value, name, maximum = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new ApiError(`${name} is missing or invalid.`, { status: 400 })
  return value
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
    try { body = await readJsonLimited(new Response(request.body, { headers: request.headers }), route === 'addonCollectionSet' ? MAX_COLLECTION_BYTES : 16384) }
    catch (error) { if (error.kind === 'protocol') return failure('Request body must be valid JSON.', 400); throw error }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return failure('Request body must be an object.', 400)
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
    let payload
    if (route === 'login') payload = { email: requireString(body.email, 'Email', 320), password: requireString(body.password, 'Password') }
    else {
      const authKey = requireString(body.authKey, 'AuthKey')
      const type = { getUser: 'GetUser', logout: 'Logout', addonCollectionGet: 'AddonCollectionGet', addonCollectionSet: 'AddonCollectionSet' }[route]
      payload = { type, authKey }
      if (route === 'addonCollectionGet') payload.update = false
      if (route === 'addonCollectionSet') payload.addons = requireConfiguredAddons(validateAddonCollection(body.addons))
    }
    const deadline = requestDeadline(request.signal, 12000)
    try {
      const upstream = await fetch(`${API}/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload), redirect: 'manual', signal: deadline.signal })
      if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return failure('Unexpected Stremio redirect.', 502) }
      const data = await readJsonLimited(upstream, MAX_COLLECTION_BYTES)
      return json(data, upstream.status)
    } finally { deadline.dispose() }
  } catch (error) {
    // Do not log exception text: fetch errors can contain secret-bearing URLs.
    if (error.name === 'ValidationError') return failure(error.message, 400)
    if (error instanceof ApiError) return failure(error.message, error.status || 502)
    if (['AbortError', 'TimeoutError'].includes(error.name)) return failure('Upstream request timed out or was cancelled. Check the result before retrying a sync.', 504)
    return failure('Could not reach the upstream service. Your local changes have been kept.', 502)
  }
}
