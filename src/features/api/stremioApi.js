import { fetchJson } from './http.js'
import { validateManifestUrl } from './manifestUrlValidation.js'
import { validateManifest } from '../addons/manifestSchema.js'
import { sessionIdFrom } from '../accounts/sessionReference.js'

export function postStremioApi(endpoint, payload, options = {}) {
  return fetchJson(`/api/${endpoint}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  }, options)
}
export const loginToStremio = (email, password, options) => postStremioApi('login', { email, password }, options)
const credential = authKey => sessionIdFrom(authKey) ? { sessionId: sessionIdFrom(authKey) } : { authKey }
export const getStremioUser = (authKey, options) => postStremioApi('getUser', { ...credential(authKey) }, options)
export const logoutFromStremio = (authKey, options) => postStremioApi('logout', { ...credential(authKey) }, options)
export const getAddonCollection = (authKey, options) => postStremioApi('addonCollectionGet', { ...credential(authKey) }, options)
export const setAddonCollection = (authKey, addons, options) => postStremioApi('addonCollectionSet', { ...credential(authKey), addons }, options)

export function startSession(input, options) {
  const sessionId = input.sessionId || sessionIdFrom(input.authKey)
  return postStremioApi('session', input.resume || sessionId
    ? { action: 'resume', sessionId, expectedUserId: input.expectedUserId, persistent: input.rememberMe }
    : { action: 'create', email: input.email, password: input.password, authKey: input.authKey, expectedUserId: input.expectedUserId, persistent: input.rememberMe !== false }, options)
}
export const disconnectBrowserSession = authKey => postStremioApi('session', { action: 'disconnect', sessionId: sessionIdFrom(authKey) })
export const forgetBrowserSession = sessionId => postStremioApi('session', { action: 'forget', sessionId })
const workspaceKey = authKey => `sam_workspace_${sessionIdFrom(authKey)}`
export async function loadSessionWorkspace(authKey, options) {
  let ciphertext
  try { ciphertext = localStorage.getItem(workspaceKey(authKey)) }
  catch { return null }
  if (!ciphertext) return null
  return (await postStremioApi('sessionWorkspace', { action: 'open', sessionId: sessionIdFrom(authKey), ciphertext }, { ...options, maxBytes: 6 * 1024 * 1024 })).result
}
export async function saveSessionWorkspace(authKey, workspace, options = {}) {
  const response = await postStremioApi('sessionWorkspace', { action: 'seal', sessionId: sessionIdFrom(authKey), workspace }, { ...options, maxBytes: 6 * 1024 * 1024 })
  if (!options.isCurrent || options.isCurrent()) localStorage.setItem(workspaceKey(authKey), response.result.ciphertext)
}

export async function fetchAddonManifest(manifestUrl, options = {}) {
  const validation = validateManifestUrl(manifestUrl)
  if (!validation.ok) throw new Error(validation.message)
  let data
  try {
    data = await fetchJson(validation.url, { headers: { accept: 'application/json' }, credentials: 'omit', redirect: 'error' }, { ...options, maxBytes: 1024 * 1024, timeoutMs: 10000 })
  } catch (error) {
    if (options.signal?.aborted || error.kind !== 'network') throw error
    // A CORS failure must not become an unrestricted server-side fetch.
    data = await postStremioApi('manifest', { url: validation.url }, { ...options, maxBytes: 1024 * 1024, timeoutMs: 12000 })
  }
  return validateManifest(data)
}
