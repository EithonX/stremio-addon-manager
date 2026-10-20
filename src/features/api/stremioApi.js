import { fetchJson } from './http.js'
import { validateManifestUrl } from './manifestUrlValidation.js'
import { validateManifest } from '../addons/manifestSchema.js'

export function postStremioApi(endpoint, payload, options = {}) {
  return fetchJson(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  }, options)
}
export const loginToStremio = (email, password, options) => postStremioApi('login', { email, password }, options)
export const getStremioUser = (authKey, options) => postStremioApi('getUser', { type: 'GetUser', authKey }, options)
export const logoutFromStremio = (authKey, options) => postStremioApi('logout', { type: 'Logout', authKey }, options)
export const getAddonCollection = (authKey, options) => postStremioApi('addonCollectionGet', { type: 'AddonCollectionGet', authKey, update: false }, options)
export const setAddonCollection = (authKey, addons, options) => postStremioApi('addonCollectionSet', { type: 'AddonCollectionSet', authKey, addons }, options)

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
