export class ApiError extends Error {
  constructor(message, { status = 0, code = '', kind = 'api' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.kind = kind
  }
}

export function requestDeadline(signal, timeoutMs = 15000) {
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  if (signal?.aborted) cancel()
  else signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out.', 'TimeoutError')), timeoutMs)
  return {
    signal: controller.signal,
    dispose() { clearTimeout(timer); signal?.removeEventListener('abort', cancel) },
  }
}

export async function readJsonLimited(response, maxBytes = 4 * 1024 * 1024) {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body?.cancel()
    throw new ApiError('Response is too large.', { status: 413, kind: 'validation' })
  }
  if (!response.body) throw new ApiError('Server returned an empty response.', { kind: 'protocol' })
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new ApiError('Response is too large.', { status: 413, kind: 'validation' })
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const data = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(data)) }
  catch { throw new ApiError('Server returned invalid or empty JSON.', { kind: 'protocol' }) }
}

export function checkApiResponse(response, data) {
  if (!response.ok || data?.error) {
    const error = data?.error
    throw new ApiError(typeof error?.message === 'string' ? error.message : `Request failed (HTTP ${response.status}).`, {
      status: response.status, code: error?.code ?? '',
      kind: response.status === 401 || response.status === 403 ? 'auth' : 'api',
    })
  }
  return data
}

export async function fetchJson(url, options = {}, { signal, timeoutMs = 15000, maxBytes } = {}) {
  const deadline = requestDeadline(signal, timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: deadline.signal, cache: 'no-store', referrerPolicy: 'no-referrer' })
    return checkApiResponse(response, await readJsonLimited(response, maxBytes))
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
    if (deadline.signal.aborted) throw new ApiError('Request timed out. Reload to check the result before retrying a sync.', { kind: 'timeout' })
    if (error instanceof ApiError) throw error
    throw new ApiError('Connection failed. Your local changes have been kept.', { kind: 'network' })
  } finally { deadline.dispose() }
}
