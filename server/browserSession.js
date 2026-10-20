import { ApiError } from '../src/features/api/http.js'
import { validSessionId, sessionReference } from '../src/features/accounts/sessionReference.js'

export const SESSION_SECONDS = 30 * 24 * 60 * 60
export const ACTIVE_COOKIE = '__Host-sam_active'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const cookieName = id => `__Host-sam_${id}`

function secretKey(env) {
  if (typeof env.SESSION_SECRET !== 'string' || !/^[a-f0-9]{64}$/i.test(env.SESSION_SECRET)) {
    throw new ApiError('Sign-in isn’t available right now. Please try again later.', { status: 503, code: 'SESSION_NOT_CONFIGURED' })
  }
  return crypto.subtle.importKey('raw', Uint8Array.from(env.SESSION_SECRET.match(/../g), byte => parseInt(byte, 16)), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export const requireSessionConfiguration = env => secretKey(env)
function encode(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
function decode(text) {
  if (!/^[\w-]+$/.test(text)) throw new Error('Invalid envelope')
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
}
async function seal(value, purpose, id, request, env) {
  const key = await secretKey(env)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`sam:v1:${purpose}:${new URL(request.url).origin}:${id}`) }, key, encoder.encode(JSON.stringify(value)))
  const bytes = new Uint8Array(12 + encrypted.byteLength)
  bytes.set(iv); bytes.set(new Uint8Array(encrypted), 12)
  return encode(bytes)
}
async function open(value, purpose, id, request, env) {
  const key = await secretKey(env)
  const bytes = decode(value)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(`sam:v1:${purpose}:${new URL(request.url).origin}:${id}`) }, key, bytes.subarray(12))
  return JSON.parse(decoder.decode(plaintext))
}
function cookies(request) {
  const result = new Map()
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && !result.has(part.slice(0, index).trim())) result.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return result
}
function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict${seconds == null ? '' : `; Max-Age=${Math.max(0, Math.floor(seconds))}`}`
}
export function clearActiveCookie(request, id) {
  return cookies(request).get(ACTIVE_COOKIE) === id ? [cookie(ACTIVE_COOKIE, '', 0)] : []
}
export function clearSessionCookies(request, id) {
  return [cookie(cookieName(id), '', 0), ...clearActiveCookie(request, id)]
}
export function publicSession(session) {
  return { authKey: sessionReference(session.id), sessionId: session.id, user: { _id: session.user.id, email: session.user.email }, origin: session.origin, authKeyHash: session.authKeyHash, expiresAt: session.expiresAt, persistent: session.persistent }
}
export async function issueSession({ authKey, user, origin, persistent }, request, env) {
  let existing
  for (const name of cookies(request).keys()) {
    const candidate = name.replace(/^__Host-sam_/, '')
    if (!validSessionId(candidate)) continue
    try {
      const session = await readSession(candidate, request, env)
      if (session.authKey === authKey && session.user.id === user.id) { existing = session; break }
    } catch { /* An expired cookie must not prevent signing in again. */ }
  }
  const id = existing?.id || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(authKey)))
  const session = { id, authKey, user, origin: existing?.origin || origin, persistent, expiresAt: Date.now() + SESSION_SECONDS * 1000, authKeyHash: Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('') }
  return { session, cookies: await refreshSessionCookies(session, request, env) }
}
export async function refreshSessionCookies(session, request, env) {
  const value = await seal(session, 'session', session.id, request, env)
  if (value.length > 3500) throw new ApiError('This AuthKey is too long to save securely. Sign in with your email and password instead.', { status: 400 })
  const lifetime = session.persistent ? (session.expiresAt - Date.now()) / 1000 : null
  return [cookie(cookieName(session.id), value, lifetime), cookie(ACTIVE_COOKIE, session.id, lifetime)]
}
export async function readSession(id, request, env, { optional = false } = {}) {
  await secretKey(env)
  const jar = cookies(request)
  id ||= jar.get(ACTIVE_COOKIE)
  if (!id && optional) return null
  if (!validSessionId(id)) throw new ApiError('Your saved sign-in has expired. Please sign in again.', { status: 401, code: 'SESSION_EXPIRED' })
  try {
    const value = jar.get(cookieName(id))
    if (!value || value.length > 3500) throw new Error('Missing cookie')
    const session = await open(value, 'session', id, request, env)
    if (session.id !== id || !session.user?.id || !session.user?.email || typeof session.authKey !== 'string' || !session.authKey || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw new Error('Invalid session')
    return session
  } catch {
    throw new ApiError('Your saved sign-in has expired. Please sign in again.', { status: 401, code: 'SESSION_EXPIRED' })
  }
}
function workspace(value, session) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.editorStates || typeof value.editorStates !== 'object' || Array.isArray(value.editorStates) || value.recovery != null && (typeof value.recovery !== 'object' || Array.isArray(value.recovery) || value.recovery.userId !== session.user.id)) {
    throw new ApiError('Saved account settings are invalid. Restore a backup if needed.', { status: 400 })
  }
  return { editorStates: value.editorStates, recovery: value.recovery || null }
}
export async function sealWorkspace(value, session, request, env) {
  return seal(workspace(value, session), `workspace:${session.user.id}`, session.id, request, env)
}
export async function openWorkspace(value, session, request, env) {
  try { return workspace(await open(value, `workspace:${session.user.id}`, session.id, request, env), session) }
  catch { throw new ApiError('Couldn’t open saved account settings. Restore a backup before changing disabled features.', { status: 400 }) }
}
