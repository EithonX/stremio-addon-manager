const encoder = new TextEncoder()
const decoder = new TextDecoder()
export const PBKDF2_ITERATIONS = 600000
export const MIN_VAULT_PASSPHRASE_LENGTH = 8

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function normalizeKdfIterations(iterations) {
  const value = Number(iterations)
  return Number.isSafeInteger(value) && value >= 10000 && value <= 2000000 ? value : PBKDF2_ITERATIONS
}

async function deriveKey(pin, saltBytes, usages, iterations = PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: normalizeKdfIterations(iterations),
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  )
}

export async function encryptAuthKey(authKey, pin) {
  if (!authKey || !pin) {
    throw new Error('AuthKey and PIN are required.')
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(pin, salt, ['encrypt'])
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(authKey)
  )

  return {
    authKeyEncrypted: bytesToBase64(new Uint8Array(ciphertext)),
    authKeyIv: bytesToBase64(iv),
    authKeySalt: bytesToBase64(salt),
    authKeyKdfIterations: PBKDF2_ITERATIONS,
    protected: true
  }
}

export async function decryptAuthKey(account, pin) {
  if (!account?.authKeyEncrypted || !account?.authKeyIv || !account?.authKeySalt) {
    throw new Error('Saved account is missing encrypted AuthKey data.')
  }
  if (!pin) {
    throw new Error('PIN is required.')
  }

  const salt = base64ToBytes(account.authKeySalt)
  const iv = base64ToBytes(account.authKeyIv)
  const ciphertext = base64ToBytes(account.authKeyEncrypted)
  const key = await deriveKey(pin, salt, ['decrypt'], account.authKeyKdfIterations ?? PBKDF2_ITERATIONS)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  return decoder.decode(plaintext)
}

export async function hashAuthKey(authKey) {
  if (!authKey) return ''
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(authKey))
  return bytesToHex(new Uint8Array(digest))
}

export async function encryptSavedSession(authKey, passphrase, { editorStates = {}, recovery = null, allowLegacyPin = false } = {}) {
  if (typeof passphrase !== 'string' || passphrase.length < (allowLegacyPin ? 4 : MIN_VAULT_PASSPHRASE_LENGTH)) {
    throw new Error(`Use a vault passphrase of at least ${MIN_VAULT_PASSPHRASE_LENGTH} characters.`)
  }
  const encrypted = await encryptAuthKey(JSON.stringify({ version: 2, authKey, editorStates, recovery }), passphrase)
  return { ...encrypted, vaultVersion: 2 }
}

export async function decryptSavedSession(account, passphrase) {
  const plaintext = await decryptAuthKey(account, passphrase)
  if (account.vaultVersion !== 2) return { authKey: plaintext, editorStates: {}, recovery: null }
  const value = JSON.parse(plaintext)
  if (value?.version !== 2 || typeof value.authKey !== 'string' || !value.authKey) throw new Error('Saved session is invalid.')
  return {
    authKey: value.authKey,
    editorStates: value.editorStates && typeof value.editorStates === 'object' && !Array.isArray(value.editorStates) ? value.editorStates : {},
    recovery: value.recovery && typeof value.recovery === 'object' ? value.recovery : null,
  }
}
