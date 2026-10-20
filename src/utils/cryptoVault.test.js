import assert from 'node:assert/strict'
import test from 'node:test'
import { encryptAuthKey, encryptSavedSession, decryptSavedSession, normalizeKdfIterations } from './cryptoVault.js'
import { normalizeSavedAccount } from '../features/accounts/useSavedAccounts.js'

test('new vaults encrypt credentials and reversible workspace data together', async () => {
  const payload = { editorStates: { 'https://provider.example.com/private/manifest.json': { source: 'fixture' } }, recovery: { userId: 'A', addons: [] } }
  const encrypted = await encryptSavedSession('private-fixture-key', 'long-fixture-passphrase', payload)
  assert.ok(!JSON.stringify(encrypted).includes('private-fixture-key'))
  assert.ok(!JSON.stringify(encrypted).includes('provider.example.com'))
  const decrypted = await decryptSavedSession(encrypted, 'long-fixture-passphrase')
  assert.equal(decrypted.authKey, 'private-fixture-key')
  assert.deepEqual(decrypted.editorStates, payload.editorStates)
  assert.deepEqual(decrypted.recovery, payload.recovery)
  await assert.rejects(decryptSavedSession(encrypted, 'wrong-passphrase'))
})
test('old encrypted PIN accounts can still unlock, but new accounts require a longer passphrase', async () => {
  const legacy = await encryptAuthKey('legacy-fixture-key', '1234')
  assert.equal((await decryptSavedSession(legacy, '1234')).authKey, 'legacy-fixture-key')
  await assert.rejects(encryptSavedSession('new-key', '1234'), /at least 8/)
})
test('normalizing legacy plaintext removes keys and passwords while retaining account labels', () => {
  const migrated = normalizeSavedAccount({ email: 'a@example.com', label: 'Home', authKey: 'old-key', password: 'old-password' })
  assert.equal(migrated.label, 'Home')
  assert.equal(migrated.needsReconnect, true)
  assert.ok(!JSON.stringify(migrated).includes('old-key'))
  assert.ok(!JSON.stringify(migrated).includes('old-password'))
})
test('pre-v2 entries without iteration metadata retain their original KDF cost', () => {
  const migrated = normalizeSavedAccount({ email: 'a@example.com', protected: true, authKeyEncrypted: 'fixture', authKeyIv: 'fixture', authKeySalt: 'fixture' })
  assert.equal(migrated.authKeyKdfIterations, 310000)
  assert.equal(normalizeKdfIterations(310000), 310000)
  assert.ok(normalizeKdfIterations(2 ** 32) <= 2000000)
})
