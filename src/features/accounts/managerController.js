import { deepClone } from '../addons/addonCollection.js'
import { stableSnapshot, requireConfiguredAddons } from '../addons/manifestSchema.js'
import { validatedCollection, protectSystemAddons, collectionChanges, mergeCollections } from '../addons/collectionSync.js'

export function initialManagerState() {
  return { phase: 'signedOut', user: null, addons: [], baseline: [], baselineEditorStates: {}, editorStates: {}, recovery: null, error: '', conflict: null, busy: '', uncertainWrite: false }
}

function verifiedUser(user) {
  const id = user?._id || user?.id
  if (typeof id !== 'string' || !id || typeof user?.email !== 'string' || !user.email) throw new Error('Couldn’t verify this Stremio account. Try signing in again.')
  return { id, email: user.email }
}

export function createManagerController({ state, api, notice = () => {}, beforeWrite = async () => {} }) {
  let generation = 0
  let context = null
  let pendingConnection = null
  let loadSequence = 0
  let lastAttempt = null
  const isCurrent = ctx => context === ctx && ctx.generation === generation && !ctx.abort.signal.aborted
  const isDirty = () => stableSnapshot(state.addons) !== stableSnapshot(state.baseline)
  const options = ctx => ({ signal: ctx.abort.signal })
  const report = error => { state.error = error.message || 'Operation failed.'; notice('error', state.error) }

  function disconnect({ keepRecovery = false } = {}) {
    generation++
    pendingConnection?.abort()
    pendingConnection = null
    context?.abort.abort()
    context = null
    lastAttempt = null
    const recovery = keepRecovery ? state.recovery : null
    Object.assign(state, initialManagerState(), { recovery })
  }

  async function connect(input) {
    disconnect()
    const run = generation
    const abort = new AbortController()
    pendingConnection = abort
    state.phase = 'connecting'
    state.busy = 'connect'
    let key, ownsNewSession = false, committed = false
    try {
      let user, savedWorkspace, sessionInfo = {}, origin = input.origin === 'password' ? 'password' : 'imported'
      if (api.startSession) {
        const started = (await api.startSession(input, { signal: abort.signal })).result
        if (!started && input.resume) { if (run === generation) state.phase = 'signedOut'; return null }
        key = started?.authKey
        user = started?.user
        origin = started?.origin
        sessionInfo = { sessionId: started?.sessionId, expiresAt: started?.expiresAt, persistent: started?.persistent, authKeyHash: started?.authKeyHash }
        ownsNewSession = started?.newlyIssued === true
      }
      else if (input.authKey) key = input.authKey.trim()
      else {
        const login = await api.loginToStremio(input.email.trim(), input.password, { signal: abort.signal })
        key = login.result?.authKey
        user = login.result?.user
        origin = 'password'
        ownsNewSession = true
      }
      if (typeof key !== 'string' || !key) throw new Error('Stremio didn’t finish signing you in. Try again.')
      if (!user) user = (await api.getStremioUser(key, { signal: abort.signal })).result
      user = verifiedUser(user)
      if (input.expectedUserId && input.expectedUserId !== user.id) throw new Error('This saved account does not match the Stremio account. Sign in again.')
      if (api.loadSessionWorkspace) savedWorkspace = await api.loadSessionWorkspace(key, { signal: abort.signal })
      const response = await api.getAddonCollection(key, { signal: abort.signal })
      const collection = validatedCollection(response.result?.addons)
      if (run !== generation || abort.signal.aborted) return null
      const ctx = { key, user, origin, generation: run, abort }
      context = ctx
      pendingConnection = null
      state.user = { ...user, origin }
      state.addons = collection
      state.baseline = deepClone(collection)
      state.editorStates = deepClone(savedWorkspace?.editorStates || input.editorStates || {})
      state.baselineEditorStates = deepClone(state.editorStates)
      const recovery = savedWorkspace?.recovery || input.recovery
      state.recovery = recovery?.userId === user.id ? deepClone(recovery) : null
      state.phase = 'ready'
      state.error = ''
      committed = true
      return { authKey: key, user, origin, ...sessionInfo, signal: abort.signal, isCurrent: () => isCurrent(ctx) }
    } catch (error) {
      if (run === generation && !abort.signal.aborted) {
        state.phase = 'signedOut'
        report(error)
      }
      return null
    } finally {
      if (run === generation) { state.busy = ''; pendingConnection = null }
      // A failed password connection must not strand a known newly-issued key.
      // Imported/shared keys are never revoked as a side effect of connecting.
      if (ownsNewSession && key && !committed) {
        try { await api.logoutFromStremio(key) } catch { /* No active local session exists. */ }
      }
    }
  }

  function updateAddons(next) {
    if (!context) return false
    try {
      const validated = validatedCollection(next)
      protectSystemAddons(state.baseline, validated)
      state.addons = validated
      state.error = ''
      state.conflict = null
      return true
    } catch (error) { report(error); return false }
  }

  async function reload({ discard = false } = {}) {
    const ctx = context
    if (!ctx || state.busy) return false
    if (isDirty() && !discard) { report(new Error('Back up your unsynced changes before reloading.')); return false }
    const request = ++loadSequence
    const draftAtStart = stableSnapshot(state.addons)
    state.busy = 'reload'
    try {
      const response = await api.getAddonCollection(ctx.key, options(ctx))
      const collection = validatedCollection(response.result?.addons)
      if (!isCurrent(ctx) || request !== loadSequence) return false
      // A reload cannot overwrite edits made after the request started.
      if (stableSnapshot(state.addons) !== draftAtStart) throw new Error('Your draft changed while reloading. It has been kept.')
      state.addons = collection
      state.baseline = deepClone(collection)
      state.error = ''
      state.conflict = null
      state.uncertainWrite = false
      lastAttempt = null
      notice('success', 'Your Stremio addons are up to date.')
      return true
    } catch (error) { if (isCurrent(ctx)) report(error); return false }
    finally { if (isCurrent(ctx) && request === loadSequence) state.busy = '' }
  }

  async function sync() {
    const ctx = context
    if (!ctx || state.busy || !isDirty() && !state.uncertainWrite) return false
    state.busy = 'sync'
    state.error = ''
    let writeStarted = false
    try {
      const submitted = requireConfiguredAddons(validatedCollection(state.addons))
      const submittedEditorStates = deepClone(state.editorStates)
      protectSystemAddons(state.baseline, submitted)
      const remoteResponse = await api.getAddonCollection(ctx.key, options(ctx))
      const remote = validatedCollection(remoteResponse.result?.addons)
      if (!isCurrent(ctx)) return false
      if (lastAttempt && stableSnapshot(remote) === stableSnapshot(lastAttempt.addons)) {
        state.baseline = deepClone(remote)
        state.baselineEditorStates = deepClone(lastAttempt.editorStates)
        state.uncertainWrite = false
        lastAttempt = null
      }
      if (stableSnapshot(remote) !== stableSnapshot(state.baseline)) {
        state.conflict = { remote, changes: collectionChanges(state.baseline, remote), conflicts: [] }
        notice('error', 'Your addons changed on another device. Combine the changes or reload before syncing.')
        return false
      }
      if (stableSnapshot(remote) === stableSnapshot(submitted)) {
        state.baseline = deepClone(remote)
        state.uncertainWrite = false
        lastAttempt = null
        notice('success', 'Your changes are already saved on Stremio.')
        return true
      }
      state.recovery = { formatVersion: 2, createdAt: new Date().toISOString(), userId: ctx.user.id, email: ctx.user.email, addons: deepClone(remote), editorStates: deepClone(state.baselineEditorStates) }
      await beforeWrite(state.recovery)
      if (!isCurrent(ctx)) return false
      lastAttempt = { addons: deepClone(submitted), editorStates: submittedEditorStates }
      writeStarted = true
      const response = await api.setAddonCollection(ctx.key, submitted, options(ctx))
      if (!isCurrent(ctx)) return false
      if (response.result?.success !== true) throw new Error('Stremio didn’t confirm the sync.')
      const verification = await api.getAddonCollection(ctx.key, options(ctx))
      const verified = validatedCollection(verification.result?.addons)
      if (!isCurrent(ctx)) return false
      if (stableSnapshot(verified) !== stableSnapshot(submitted)) {
        state.conflict = { remote: verified, changes: collectionChanges(submitted, verified), conflicts: [] }
        throw new Error('Stremio returned a different addon list. Your changes and previous list are still available.')
      }
      // Crucially, later local edits are not used as the synced baseline.
      state.baseline = deepClone(submitted)
      state.baselineEditorStates = submittedEditorStates
      state.uncertainWrite = false
      lastAttempt = null
      notice('success', isDirty() ? 'Synced. You still have newer changes to sync.' : 'Changes synced to Stremio.')
      return true
    } catch (error) {
      if (isCurrent(ctx)) {
        state.uncertainWrite = writeStarted
        report(writeStarted ? new Error(`${error.message} We couldn’t confirm the sync. Check Stremio before trying again.`) : error)
      }
      return false
    } finally { if (isCurrent(ctx)) state.busy = '' }
  }

  function mergeRemote() {
    if (!context || !state.conflict || state.busy) return false
    try {
      const remote = state.conflict.remote
      const result = mergeCollections(state.baseline, state.addons, remote)
      if (result.conflicts.length) {
        state.conflict.conflicts = result.conflicts
        throw new Error('Some addons were changed in both places. Download your changes before reloading or editing those addons again.')
      }
      state.baseline = deepClone(remote)
      state.addons = result.addons
      state.conflict = null
      state.uncertainWrite = false
      lastAttempt = null
      notice('success', 'Changes combined. Review the list, then sync.')
      return true
    } catch (error) { report(error); return false }
  }

  async function revoke() {
    const ctx = context
    if (!ctx) return false
    disconnect()
    const run = generation
    state.busy = 'revoke'
    try {
      const result = await api.logoutFromStremio(ctx.key)
      if (result.result?.success !== true) throw new Error('Stremio didn’t confirm the sign-out.')
      if (generation === run) notice('success', 'Signed out of Stremio.')
      return true
    } catch (error) {
      if (generation === run) report(new Error(`Signed out here, but Stremio sign-out could not be confirmed: ${error.message}`))
      return false
    } finally { if (generation === run) state.busy = '' }
  }

  return { connect, disconnect, revoke, reload, sync, updateAddons, mergeRemote, isDirty, isCurrentSession: connection => connection?.isCurrent() === true }
}
