import { useStorage } from '@vueuse/core'
import { PBKDF2_ITERATIONS, normalizeKdfIterations } from '../../utils/cryptoVault'

export const DEFAULT_SAVED_ACCOUNT = Object.freeze({
  email: '',
  label: '-- Select Saved Account --',
  authKey: '',
})

let savedAccountsRef

function getSavedAccountsStore() {
  if (!savedAccountsRef) {
    savedAccountsRef = useStorage('sam_saved_accounts', [])
  }

  return savedAccountsRef
}

function normalizeSavedAccount(account) {
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
      ? PBKDF2_ITERATIONS
      : normalizeKdfIterations(account.authKeyKdfIterations)
  } else if (typeof account.authKey === 'string' && account.authKey) {
    normalized.authKey = account.authKey
    normalized.protected = false
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

  function ensureNormalized() {
    savedAccounts.value = normalizeSavedAccounts(savedAccounts.value)
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

    if (!normalized) {
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

    savedAccounts.value = nextAccounts
    return normalized
  }

  function removeSavedAccount(email) {
    if (!email) {
      return
    }

    const targetEmail = email.trim().toLowerCase()
    savedAccounts.value = savedAccounts.value.filter(
      (account) => account.email.toLowerCase() !== targetEmail,
    )
  }

  function renameSavedAccount(email, nextLabel) {
    if (!email) {
      return
    }

    const targetEmail = email.trim().toLowerCase()
    const label = typeof nextLabel === 'string' && nextLabel.trim() ? nextLabel.trim() : null

    savedAccounts.value = savedAccounts.value.map((account) => {
      if (account.email.toLowerCase() !== targetEmail) {
        return account
      }

      return {
        ...account,
        label: label || account.email,
        updatedAt: Date.now(),
      }
    })
  }

  return {
    savedAccounts,
    defaultSavedAccount: DEFAULT_SAVED_ACCOUNT,
    ensureNormalized,
    findSavedAccountByEmail,
    upsertSavedAccount,
    removeSavedAccount,
    renameSavedAccount,
  }
}
