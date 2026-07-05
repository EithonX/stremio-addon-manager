import { validateManifestUrl } from '../../src/features/api/manifestUrlValidation.js'

const STREMIO_API_BASE = 'https://api.strem.io/api'
const STREMIO_POST_ROUTES = new Set([
  '/api/login',
  '/api/addonCollectionGet',
  '/api/addonCollectionSet',
])
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}
const MANIFEST_MAX_BYTES = 1024 * 1024
const MANIFEST_TIMEOUT_MS = 10_000

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  })
}

function errorResponse(message, status) {
  return jsonResponse({ error: { message } }, status)
}

async function readJsonBody(request) {
  const body = await request.text()

  if (!body.trim()) {
    return { ok: false, response: errorResponse('Request body is required.', 400) }
  }

  try {
    JSON.parse(body)
  } catch {
    return { ok: false, response: errorResponse('Request body must be valid JSON.', 400) }
  }

  return { ok: true, body }
}

async function readJsonSafely(response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function proxyStremioPost(request, pathname) {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405)
  }

  const bodyResult = await readJsonBody(request)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  try {
    const upstream = await fetch(`${STREMIO_API_BASE}${pathname.slice('/api'.length)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: bodyResult.body,
    })
    const data = await readJsonSafely(upstream)

    if (data === undefined) {
      return errorResponse('Upstream returned invalid JSON.', 502)
    }

    return jsonResponse(data, upstream.status)
  } catch (error) {
    console.error(JSON.stringify({
      message: 'stremio proxy failed',
      error: error instanceof Error ? error.message : String(error),
      path: pathname,
    }))
    return errorResponse('Failed to reach Stremio API.', 502)
  }
}

async function readManifestText(response) {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MANIFEST_MAX_BYTES) {
    return { ok: false, response: errorResponse('Manifest response is too large.', 413) }
  }

  const text = await response.text()
  if (text.length > MANIFEST_MAX_BYTES) {
    return { ok: false, response: errorResponse('Manifest response is too large.', 413) }
  }

  return { ok: true, text }
}

async function fetchManifest(requestUrl, request) {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed.', 405)
  }

  const validation = validateManifestUrl(requestUrl.searchParams.get('url'))
  if (!validation.ok) {
    return errorResponse(validation.message, 400)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS)

  try {
    const upstream = await fetch(validation.url, {
      headers: {
        accept: 'application/json',
        'cache-control': 'no-cache',
      },
      redirect: 'manual',
      signal: controller.signal,
    })

    if (upstream.status >= 300 && upstream.status <= 399) {
      return errorResponse('Manifest redirects are not allowed.', 400)
    }

    if (!upstream.ok) {
      return errorResponse(`Manifest request failed with HTTP ${upstream.status}.`, 502)
    }

    const textResult = await readManifestText(upstream)
    if (!textResult.ok) {
      return textResult.response
    }

    let manifest
    try {
      manifest = JSON.parse(textResult.text)
    } catch {
      return errorResponse('Manifest response must be valid JSON.', 502)
    }

    if (!manifest?.id || !manifest?.version) {
      return errorResponse('Manifest response is missing required id/version fields.', 502)
    }

    return jsonResponse(manifest)
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Manifest request timed out.'
      : 'Failed to fetch manifest.'

    console.error(JSON.stringify({
      message: 'manifest fetch failed',
      error: error instanceof Error ? error.message : String(error),
    }))
    return errorResponse(message, 502)
  } finally {
    clearTimeout(timeout)
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url)

  if (STREMIO_POST_ROUTES.has(url.pathname)) {
    return proxyStremioPost(context.request, url.pathname)
  }

  if (url.pathname === '/api/manifest') {
    return fetchManifest(url, context.request)
  }

  return errorResponse('Not found.', 404)
}
