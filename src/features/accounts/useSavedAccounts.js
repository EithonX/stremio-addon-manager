import { useStorage } from '@vueuse/core'
import { normalizeKdfIterations } from '../../utils/cryptoVault.js'

export const DEFAULT_SAVED_ACCOUNT = Object.freeze({
  email: '',
  label: 'Choose a saved account',
  authKey: '',
})

let savedAccountsRef

function getSavedAccountsStore() {
  if (!savedAccountsRef) {
    savedAccountsRef = useStorage('sam_saved_accounts', [])
  }

  return savedAccountsRef
}

export function normalizeSavedAccount(account) {
  if (!account || typeof account.email !== 'string' || !account.email.trim()) {
    return null
  }

  const email = account.email.trim()
  const normalized = {
    email,
    label: typeof account.label === 'string' && account.label.trim() ? account.label.trim() : email,
    updatedAt: Number.isFinite(account.updatedAt) ? account.updatedAt : Date.now(),
    authKeyHash: typeof account.authKeyHash === 'string' ? account.authKeyHash : '',
    protected: Boolean(account.protected),
    userId: typeof account.userId === 'string' ? account.userId : '',
    origin: account.origin === 'password' ? 'password' : 'imported',
    vaultVersion: account.vaultVersion === 2 ? 2 : 1,
  }

  if (
    normalized.protected &&
    typeof account.authKeyEncrypted === 'string' &&
    typeof account.authKeyIv === 'string' &&
    typeof account.authKeySalt === 'string'
  ) {
    normalized.authKeyEncrypted = account.authKeyEncrypted
    normalized.authKeyIv = account.authKeyIv
    normalized.authKeySalt = account.authKeySalt
    normalized.authKeyKdfIterations = account.authKeyKdfIterations == null
      ? 310000 // Pre-v2 vaults used this cost when no metadata was present.
      : normalizeKdfIterations(account.authKeyKdfIterations)
  } else {
    // Migrate plaintext legacy credentials to metadata-only entries. Reconnect
    // explicitly to save an encrypted replacement; never auto-reuse old keys.
    normalized.protected = false
    normalized.needsReconnect = true
  }

  return normalized
}

function normalizeSavedAccounts(accounts) {
  if (!Array.isArray(accounts)) {
    return []
  }

  return accounts
    .map(normalizeSavedAccount)
    .filter(Boolean)
}

export function useSavedAccounts() {
  const savedAccounts = getSavedAccountsStore()

  function commit(accounts) {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('sam_saved_accounts', JSON.stringify(accounts)) }
      catch { throw new Error('This browser could not save the encrypted account. Storage may be full or unavailable.') }
    }
    savedAccounts.value = accounts
  }

  function ensureNormalized() {
    const removedPlaintext = Array.isArray(savedAccounts.value) && savedAccounts.value.some(account => account?.authKey || account?.password)
    const normalized = normalizeSavedAccounts(savedAccounts.value)
    try { commit(normalized); return { removedPlaintext, storageError: '' } }
    catch (error) { savedAccounts.value = normalized; return { removedPlaintext, storageError: error.message } }
  }

  function findSavedAccountByEmail(email) {
    if (!email) {
      return null
    }

    const targetEmail = email.trim().toLowerCase()

    return savedAccounts.value.find((account) => account.email.toLowerCase() === targetEmail) ?? null
  }

  function upsertSavedAccount(account) {
    const normalized = normalizeSavedAccount(account)

    if (!normalized || !normalized.protected) {
      return null
    }

    const targetEmail = normalized.email.toLowerCase()
    const nextAccounts = [...savedAccounts.value]
    const existingIndex = nextAccounts.findIndex(
      (savedAccount) => savedAccount.email.toLowerCase() === targetEmail,
    )

    if (existingIndex >= 0) {
      nextAccounts.splice(existingIndex, 1, normalized)
    } else {
      nextAccounts.push(normalized)
    }

    commit(nextAccounts)
    return normalized
  }

  function removeSavedAccount(email) {
    if (!email) {
      return
    }

    const targetEmail = email.trim().toLowerCase()
    commit(savedAccounts.value.filter(
      (account) => account.email.toLowerCase() !== targetEmail,
    ))
  }

  function renameSavedAccount(email, nextLabel) {
    if (!email) {
      return
    }

    const targetEmail = email.trim().toLowerCase()
    const label = typeof nextLabel === 'string' && nextLabel.trim() ? nextLabel.trim() : null

    commit(savedAccounts.value.map((account) => {
      if (account.email.toLowerCase() !== targetEmail) {
        return account
      }

      return {
        ...account,
        label: label || account.email,
        updatedAt: Date.now(),
      }
    }))
  }

  function invalidateSavedKey(authKeyHash) {
    commit(savedAccounts.value.map(account => {
      if (account.authKeyHash !== authKeyHash) return account
      return { email: account.email, label: account.label, userId: account.userId, updatedAt: Date.now(), needsReconnect: true, protected: false }
    }))
  }

  return {
    savedAccounts,
    defaultSavedAccount: DEFAULT_SAVED_ACCOUNT,
    ensureNormalized,
    findSavedAccountByEmail,
    upsertSavedAccount,
    removeSavedAccount,
    renameSavedAccount,
    invalidateSavedKey,
  }
}
