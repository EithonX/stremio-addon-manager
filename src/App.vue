<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
import { CheckCircle2, AlertCircle, X } from '@lucide/vue'
import NavBar from './components/NavBar.vue'
import LandingPage from './components/LandingPage.vue'
import ManagerDashboard from './components/ManagerDashboard.vue'
import Footer from './components/Footer.vue'
import Modal from './components/ui/Modal.vue'
import ConfirmationModal from './components/ui/ConfirmationModal.vue'
import { hashAuthKey } from './utils/cryptoVault.js'
import * as api from './features/api/stremioApi.js'
import { initialManagerState, createManagerController } from './features/accounts/managerController.js'
import { collectionChanges } from './features/addons/collectionSync.js'
import { committedManifestDrafts } from './features/addons/manifestDraft.js'
import { useSavedAccounts } from './features/accounts/useSavedAccounts.js'
import { useNotification } from './composables/useNotification.js'
import { readActiveSession, selectActiveSession } from './features/accounts/activeSession.js'

const state = reactive(initialManagerState())
const { savedAccounts, ensureNormalized, upsertSavedAccount, invalidateSavedKey } = useSavedAccounts()
const { notification, notify } = useNotification()
let activeConnection = null
let workspaceWrite = 0
let persistTimer = null
const savingSettings = ref(false)
const editorDirty = ref(false)
const settingsError = ref('')
const reviewOpen = ref(false)
const confirmationModal = ref({ show: false, title: '', message: '', confirmText: '', type: 'danger', action: null })
let migratedActive = false
try {
  migratedActive = Boolean(window.localStorage.getItem('stremio_auth_key'))
  window.localStorage.removeItem('stremio_auth_key')
} catch { /* Browser storage may be unavailable. */ }
const migration = ensureNormalized()

async function persistWorkspace() {
  const connection = activeConnection
  if (!connection?.isCurrent()) return
  const run = ++workspaceWrite
  savingSettings.value = true
  try {
    await api.saveSessionWorkspace(connection.authKey, { editorStates: state.baselineEditorStates, recovery: state.recovery }, { signal: connection.signal, isCurrent: () => run === workspaceWrite && connection.isCurrent() })
    if (run !== workspaceWrite || !connection.isCurrent()) return
    settingsError.value = ''
  } catch (error) {
    if (run === workspaceWrite && connection.isCurrent()) settingsError.value = 'Couldn’t save your account settings on this device. Download a backup before closing this page.'
    throw error
  } finally { if (run === workspaceWrite) savingSettings.value = false }
}
const controller = createManagerController({ state, api, notice: notify, beforeWrite: async () => {
  try { await persistWorkspace() } catch { /* Recovery remains available in this tab and a persistent warning is shown. */ }
} })
const step = computed(() => state.phase === 'ready' ? 2 : 1)
const addons = computed(() => state.addons)
const isLoading = computed(() => Boolean(state.busy))
const currentUserEmail = computed(() => state.user?.email || '')
const hasUnsyncedChanges = computed(() => step.value === 2 && controller.isDirty())
const changes = computed(() => collectionChanges(state.baseline, state.addons))

function clearActiveConnection() {
  clearTimeout(persistTimer)
  workspaceWrite++
  activeConnection = null
  savingSettings.value = false
  settingsError.value = ''
}
async function connect(input) {
  clearActiveConnection()
  editorDirty.value = false
  const connection = await controller.connect(input)
  if (!connection) return
  activeConnection = connection
  selectActiveSession(connection.sessionId)
  try {
    if (connection.persistent) {
      const existing = savedAccounts.value.find(account => account.email.toLowerCase() === connection.user.email.toLowerCase())
      upsertSavedAccount({ email: connection.user.email, userId: connection.user.id, origin: connection.origin, label: existing?.label || connection.user.email, sessionId: connection.sessionId, expiresAt: connection.expiresAt, authKeyHash: connection.authKeyHash, updatedAt: Date.now() })
    }
    await persistWorkspace()
  } catch { notify('error', 'Connected, but couldn’t save your account settings. Download a backup before closing.') }
}
const login = input => connect(input)
const loginKey = input => connect(typeof input === 'string' ? { authKey: input } : input)
async function performDisconnect() {
  const connection = activeConnection
  selectActiveSession('')
  clearActiveConnection()
  controller.disconnect()
  editorDirty.value = false
  reviewOpen.value = false
  notify('success', 'Disconnected. You can now choose another account.')
  if (connection) {
    try { await api.disconnectBrowserSession(connection.authKey) }
    catch { notify('error', 'Disconnected in this tab. Couldn’t update the saved sign-in; reconnect before leaving a shared device.') }
  }
}
function requestDisconnect() {
  if (!hasUnsyncedChanges.value && !editorDirty.value) { performDisconnect(); return }
  showConfirmation({ title: 'Discard local changes?', message: 'Your latest changes haven’t been synced. Download a backup first if you want to keep them.', confirmText: 'Discard and switch', action: performDisconnect })
}
async function performRevoke(connection) {
  if (!connection?.isCurrent()) return
  let hash = connection.authKeyHash || ''
  try { hash ||= await hashAuthKey(connection.authKey) } catch { /* Revocation must still proceed. */ }
  if (!connection.isCurrent()) return
  clearActiveConnection()
  selectActiveSession('')
  editorDirty.value = false
  reviewOpen.value = false
  const revoked = await controller.revoke()
  if (revoked) {
    try {
      if (hash) invalidateSavedKey(hash)
      localStorage.removeItem(`sam_workspace_${connection.sessionId}`)
    } catch { notify('error', 'Signed out of Stremio, but couldn’t remove the saved account name from this browser.') }
  } else {
    // Keep the credential available for an explicit retry, rather than deleting
    // it while the Stremio session might still be live.
    try { await api.disconnectBrowserSession(connection.authKey) } catch { /* The current tab remains disconnected. */ }
  }
}
function logout() {
  const connection = activeConnection
  if (!connection) return
  const shared = connection.origin !== 'password'
  showConfirmation({
    title: 'Sign out of Stremio?',
    message: `${shared ? 'This AuthKey came from another Stremio app. Signing out will end that session there too. ' : ''}This ends your Stremio session and removes this saved login from the manager. ${hasUnsyncedChanges.value || editorDirty.value ? 'Unsynced changes will be lost. ' : ''}To keep your saved login, choose Switch account instead.`,
    confirmText: 'Sign out of Stremio', action: () => performRevoke(connection),
  })
}
function showConfirmation(value) { confirmationModal.value = { show: true, type: 'danger', ...value } }
function closeConfirmationModal() { confirmationModal.value.show = false }
function confirmPendingAction() { const action = confirmationModal.value.action; closeConfirmationModal(); action?.() }
function handleReloadRequest() {
  if (!hasUnsyncedChanges.value && !editorDirty.value) { controller.reload(); return }
  showConfirmation({ title: 'Reload from Stremio?', message: 'This replaces your unsynced changes with your current Stremio addons. Download a backup first if you want to keep your edits.', confirmText: 'Discard and reload', action: () => controller.reload({ discard: true }) })
}
function handleAddonsUpdate(next) { return controller.updateAddons(next) }
function removeAddon(index) { controller.updateAddons(state.addons.filter((_, i) => i !== index)) }
function requestSync() { if (!isLoading.value && (hasUnsyncedChanges.value || state.uncertainWrite)) reviewOpen.value = true }
async function confirmSync() {
  if (isLoading.value) return
  reviewOpen.value = false
  await controller.sync()
  try { await persistWorkspace() } catch { notify('error', 'Couldn’t save your account settings. Download a backup before closing.') }
}
function updateEditorStates(value) {
  state.editorStates = value
  state.baselineEditorStates = committedManifestDrafts(state.baseline, value, state.baselineEditorStates)
}
watch(() => [state.baselineEditorStates, state.recovery], () => {
  clearTimeout(persistTimer)
  persistTimer = null
  if (activeConnection) persistTimer = setTimeout(() => { persistTimer = null; persistWorkspace().catch(() => notify('error', 'Couldn’t save your settings on this device. Download a backup to keep them.')) }, 500)
}, { deep: true })
function handleBeforeUnload(event) {
  if (!hasUnsyncedChanges.value && !editorDirty.value && !state.busy && !savingSettings.value && !persistTimer) return
  event.preventDefault(); event.returnValue = ''
}
onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  if (migration.storageError) notify('error', migration.storageError, 10000)
  else if (migratedActive || migration.removedPlaintext) notify('success', 'Sign in again to save your account securely on this device.', 10000)
  const selected = readActiveSession()
  if (selected !== '') await connect({ resume: true, sessionId: selected || undefined })
})
onUnmounted(() => { window.removeEventListener('beforeunload', handleBeforeUnload); clearActiveConnection(); controller.disconnect() })
</script>

<template>
  <div class="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-300">
    <NavBar :isLoggedIn="step === 2" :userEmail="currentUserEmail" @logout="logout" @switch-account="requestDisconnect" />
    
    <main class="flex-grow">
      <transition enter-active-class="transition ease-out duration-300" enter-from-class="translate-y-full opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition ease-in duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="notification.show" role="status" aria-live="polite" :class="notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'" class="fixed bottom-6 left-4 right-4 z-[100] px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 font-medium sm:left-auto sm:right-6 sm:max-w-md">
          <AlertCircle v-if="notification.type === 'error'" class="w-5 h-5" />
          <CheckCircle2 v-else class="w-5 h-5" />
          <span class="min-w-0 flex-1 break-words">{{ notification.message }}</span><button type="button" @click="notification.show = false" aria-label="Dismiss notification" class="-mr-1 shrink-0 rounded-lg p-1 hover:bg-white/15"><X class="h-4 w-4" /></button>
        </div>
      </transition>

      <div v-if="settingsError" role="alert" class="mx-auto mt-4 max-w-5xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{{ settingsError }}</div>
      <div v-if="state.error" role="alert" class="mx-auto mt-4 flex max-w-5xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
        <span>{{ state.error }}</span><button type="button" aria-label="Dismiss error" @click="state.error = ''">Dismiss</button>
      </div>
      <LandingPage v-if="step === 1" :isLoading="isLoading" @login="login" @loginKey="loginKey" />
        
        <ManagerDashboard 
          v-else 
          :key="state.user.id"
          :addons="addons"
          :editor-states="state.editorStates"
          :recovery="state.recovery"
          :conflict="state.conflict"
          :uncertain-write="state.uncertainWrite"
          :isLoading="isLoading" 
          :has-unsynced-changes="hasUnsyncedChanges"
          @update:addons="handleAddonsUpdate" 
          @sync="requestSync"
          @update:editor-states="updateEditorStates"
          @editor-dirty="editorDirty = $event"
          @merge="controller.mergeRemote()"
          @reload="handleReloadRequest"
          @remove="removeAddon"
        />
    </main>

    <ConfirmationModal
      :show="confirmationModal.show"
      :title="confirmationModal.title"
      :message="confirmationModal.message"
      :confirm-text="confirmationModal.confirmText"
      :type="confirmationModal.type"
      @close="closeConfirmationModal"
      @confirm="confirmPendingAction"
    />

    <Modal :show="reviewOpen" title="Review sync" @close="reviewOpen = false" max-width="max-w-xl">
      <p class="mb-4 text-sm">Syncing to: <strong>{{ currentUserEmail }}</strong></p>
      <ul v-if="changes.length" class="mb-5 max-h-72 space-y-2 overflow-auto text-sm">
        <li v-for="(change, index) in changes" :key="index" class="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800"><strong>{{ change.kind }}</strong> {{ change.name }}<span v-if="change.position"> → position {{ change.position }}</span></li>
      </ul>
      <p v-else class="mb-4 text-sm">Check whether your previous sync reached Stremio.</p>
      <p class="mb-5 text-xs text-zinc-500">We’ll check for changes and keep a backup before syncing. Avoid changing addons on another device while the sync is running.</p>
      <div class="flex justify-end gap-3"><button class="rounded-lg border px-4 py-2" @click="reviewOpen = false">Cancel</button><button class="btn-primary" :disabled="isLoading" @click="confirmSync">{{ state.uncertainWrite ? 'Check and sync' : 'Sync to Stremio' }}</button></div>
    </Modal>
    <Footer />
  </div>
</template>
