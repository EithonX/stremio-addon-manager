import assert from 'node:assert/strict'
import test from 'node:test'
import { createManagerController, initialManagerState } from './managerController.js'
import { stableSnapshot } from '../addons/manifestSchema.js'
import { mergeCollections } from '../addons/collectionSync.js'

const copy = value => JSON.parse(JSON.stringify(value))
const item = (id = 'a') => ({ transportUrl: `https://${id}.example.com/manifest.json`, manifest: { id, name: id, version: '1.0.0', description: '', types: ['movie'], resources: ['catalog', 'meta'], catalogs: [] }, flags: { official: false, protected: false } })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture(extra = {}) {
  const remote = { A: [item()], B: [item('b')] }
  const calls = [], notices = [], gates = {}
  const api = {
    async loginToStremio() { return { result: { authKey: 'A', user: { _id: 'A', email: 'a@example.com' } } } },
    async getStremioUser(key) { return { result: { _id: key, email: `${key.toLowerCase()}@example.com` } } },
    async getAddonCollection(key, options) {
      calls.push({ method: 'get', key, options })
      const snapshot = copy(remote[key])
      if (gates[key]) await gates[key].promise
      return { result: { addons: snapshot } }
    },
    async setAddonCollection(key, addons) {
      calls.push({ method: 'set', key, addons: copy(addons) })
      if (gates.set) await gates.set.promise
      remote[key] = copy(addons)
      return { result: { success: true } }
    },
    async logoutFromStremio(key) { calls.push({ method: 'logout', key }); return { result: { success: true } } },
  }
  const state = initialManagerState()
  const manager = createManagerController({ state, api, notice: (...args) => notices.push(args), ...extra })
  return { state, manager, api, remote, calls, notices, gates }
}

test('manual key resolves real user identity; disconnect is local and clears all account state', async () => {
  const f = fixture()
  const connection = await f.manager.connect({ authKey: 'A' })
  assert.equal(connection.user.id, 'A')
  assert.equal(f.state.user.email, 'a@example.com')
  f.state.editorStates.private = { value: true }
  f.manager.disconnect()
  assert.deepEqual(f.state, initialManagerState())
  assert.equal(connection.isCurrent(), false)
  assert.equal(f.calls.filter(c => c.method === 'logout').length, 0)
})
test('sign out sends logout with the captured key and clears workspace', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  assert.equal(await f.manager.revoke(), true)
  assert.deepEqual(f.calls.find(c => c.method === 'logout'), { method: 'logout', key: 'A' })
  assert.equal(f.state.phase, 'signedOut')
  assert.ok(f.notices.some(n => n[1].includes('confirmed session revocation')))
})
test('failed revocation reports local disconnect without claiming server success', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  f.api.logoutFromStremio = async () => { throw new Error('Offline') }
  assert.equal(await f.manager.revoke(), false)
  assert.equal(f.state.user, null)
  assert.match(f.state.error, /could not be confirmed/)
  assert.ok(!f.notices.some(n => n[0] === 'success'))
})
test('out-of-order connections cannot pair B credentials with A addons', async () => {
  const f = fixture(); f.gates.A = deferred()
  const old = f.manager.connect({ authKey: 'A' })
  await new Promise(resolve => setImmediate(resolve))
  await f.manager.connect({ authKey: 'B' })
  f.gates.A.resolve(); await old
  assert.equal(f.state.user.id, 'B')
  assert.equal(f.state.addons[0].manifest.id, 'b')
})
test('logout invalidates an already-running load, even if transport ignores abort', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  f.gates.A = deferred()
  const pending = f.manager.reload()
  f.manager.disconnect()
  f.gates.A.resolve(); await pending
  assert.deepEqual(f.state, initialManagerState())
})
test('a failed newly-issued password session is cleaned up; imported keys are retained', async () => {
  const f = fixture()
  f.api.getAddonCollection = async () => { throw new Error('Offline') }
  await f.manager.connect({ email: 'a@example.com', password: 'fixture' })
  assert.equal(f.calls.filter(c => c.method === 'logout').length, 1)
  f.calls.length = 0
  await f.manager.connect({ authKey: 'A' })
  assert.equal(f.calls.filter(c => c.method === 'logout').length, 0)
})
test('saved account identity mismatch cannot import another account workspace', async () => {
  const f = fixture()
  await f.manager.connect({ authKey: 'A', expectedUserId: 'B', editorStates: { private: 'belongs to B' } })
  assert.equal(f.state.user, null)
  assert.deepEqual(f.state.editorStates, {})
  assert.match(f.state.error, /does not match/)
})
test('transient reload errors preserve credentials and unsynced data', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  f.manager.updateAddons([item('local')])
  f.api.getAddonCollection = async () => { throw new Error('Offline') }
  await f.manager.reload({ discard: true })
  assert.equal(f.state.user.id, 'A')
  assert.equal(f.state.addons[0].manifest.id, 'local')
  assert.equal(f.manager.isDirty(), true)
})
test('edits made after an explicitly confirmed reload begins are kept', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  f.gates.A = deferred()
  const pending = f.manager.reload({ discard: true })
  f.manager.updateAddons([item('new-draft')])
  f.gates.A.resolve(); await pending
  assert.equal(f.state.addons[0].manifest.id, 'new-draft')
  assert.match(f.state.error, /changed while reloading/)
})
test('sync advances only the submitted snapshot; later edits remain dirty', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  f.manager.updateAddons([item('submitted')])
  f.gates.set = deferred()
  const pending = f.manager.sync()
  await new Promise(resolve => setImmediate(resolve))
  f.manager.updateAddons([item('newer')])
  f.gates.set.resolve(); assert.equal(await pending, true)
  assert.equal(f.remote.A[0].manifest.id, 'submitted')
  assert.equal(f.state.baseline[0].manifest.id, 'submitted')
  assert.equal(f.state.addons[0].manifest.id, 'newer')
  assert.equal(f.manager.isDirty(), true)
})
test('remote additions block a stale full-list write and merge without losing either change', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  const local = item(); local.manifest.name = 'Local rename'
  f.manager.updateAddons([local])
  f.remote.A.push(item('new-remote'))
  assert.equal(await f.manager.sync(), false)
  assert.ok(f.state.conflict)
  assert.equal(f.calls.filter(c => c.method === 'set').length, 0)
  assert.equal(f.manager.mergeRemote(), true)
  assert.deepEqual(f.state.addons.map(a => a.manifest.name), ['Local rename', 'new-remote'])
  assert.equal(await f.manager.sync(), true)
  assert.equal(f.remote.A.length, 2)
})
test('overlapping remote/local edits do not guess a merge winner', () => {
  const base = item(), local = item(), remote = item()
  local.manifest.name = 'Local'; remote.manifest.name = 'Remote'
  const result = mergeCollections([base], [local], [remote])
  assert.equal(result.addons, null)
  assert.deepEqual(result.conflicts, ['Local'])
})
test('protected descriptors cannot be removed or downgraded by a restore', async () => {
  const f = fixture(); f.remote.A[0].flags.protected = true
  await f.manager.connect({ authKey: 'A' })
  assert.equal(f.manager.updateAddons([]), false)
  const downgrade = copy(f.state.addons); downgrade[0].flags.protected = false
  assert.equal(f.manager.updateAddons(downgrade), false)
  assert.equal(f.state.addons.length, 1)
})
test('invalid edited record does not disappear from the collection', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  const invalid = copy(f.state.addons); delete invalid[0].manifest.id
  assert.equal(f.manager.updateAddons(invalid), false)
  assert.equal(f.state.addons[0].manifest.id, 'a')
})
test('invalid remote field types cannot be normalized into a silent replacement', async () => {
  const f = fixture(); f.remote.A[0].manifest.description = 42
  await f.manager.connect({ authKey: 'A' })
  assert.equal(f.state.user, null)
  assert.match(f.state.error, /description/)
  assert.equal(f.calls.filter(c => c.method === 'set').length, 0)
})
test('restoring an unconfigured addon cannot bypass installation checks at sync', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  const unconfigured = item('unconfigured'); unconfigured.manifest.behaviorHints = { configurable: true, configurationRequired: true }
  f.manager.updateAddons([...f.state.addons, unconfigured])
  assert.equal(await f.manager.sync(), false)
  assert.equal(f.calls.filter(c => c.method === 'set').length, 0)
  assert.match(f.state.error, /configurationRequired/)
})
test('known write with lost acknowledgment is reconciled without replaying the replacement', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A' })
  f.manager.updateAddons([item('submitted')])
  f.api.setAddonCollection = async (key, addons) => { f.remote[key] = copy(addons); f.calls.push({ method: 'set' }); throw new Error('Lost acknowledgment') }
  assert.equal(await f.manager.sync(), false)
  assert.equal(f.state.uncertainWrite, true)
  assert.equal(await f.manager.sync(), true)
  assert.equal(f.state.uncertainWrite, false)
  assert.equal(f.calls.filter(c => c.method === 'set').length, 1)
})
test('recovery contains the exact pre-write collection and original restoration data', async () => {
  const f = fixture(); await f.manager.connect({ authKey: 'A', editorStates: { original: true } })
  const before = stableSnapshot(f.remote.A)
  f.state.editorStates = { changed: true }
  f.manager.updateAddons([item('changed')]); await f.manager.sync()
  assert.equal(stableSnapshot(f.state.recovery.addons), before)
  assert.deepEqual(f.state.recovery.editorStates, { original: true })
})
test('failure to preserve recovery prevents sending a destructive write', async () => {
  const f = fixture({ beforeWrite: async () => { throw new Error('Recovery unavailable') } })
  await f.manager.connect({ authKey: 'A' }); f.manager.updateAddons([item('changed')])
  await f.manager.sync()
  assert.equal(f.calls.filter(c => c.method === 'set').length, 0)
  assert.equal(f.state.uncertainWrite, false)
})
