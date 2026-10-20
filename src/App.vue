<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
import { CheckCircle2, AlertCircle } from '@lucide/vue'
import NavBar from './components/NavBar.vue'
import LandingPage from './components/LandingPage.vue'
import ManagerDashboard from './components/ManagerDashboard.vue'
import Footer from './components/Footer.vue'
import Modal from './components/ui/Modal.vue'
import ConfirmationModal from './components/ui/ConfirmationModal.vue'
import { encryptSavedSession, hashAuthKey } from './utils/cryptoVault.js'
import * as api from './features/api/stremioApi.js'
import { initialManagerState, createManagerController } from './features/accounts/managerController.js'
import { collectionChanges } from './features/addons/collectionSync.js'
import { committedManifestDrafts } from './features/addons/manifestDraft.js'
import { useSavedAccounts } from './features/accounts/useSavedAccounts.js'
import { useNotification } from './composables/useNotification.js'

const state = reactive(initialManagerState())
const { savedAccounts, ensureNormalized, upsertSavedAccount, invalidateSavedKey } = useSavedAccounts()
const { notification, notify } = useNotification()
let vaultSession = null
let activeConnection = null
let vaultWrite = 0
let persistTimer = null
const savingVault = ref(false)
const editorDirty = ref(false)
const vaultError = ref('')
const reviewOpen = ref(false)
const confirmationModal = ref({ show: false, title: '', message: '', confirmText: '', type: 'danger', action: null })
let migratedActive = false
try {
  migratedActive = Boolean(window.localStorage.getItem('stremio_auth_key'))
  window.localStorage.removeItem('stremio_auth_key')
} catch { /* Session credentials still stay in memory when storage is unavailable. */ }
const migration = ensureNormalized()

async function persistVault({ create = false } = {}) {
  const session = vaultSession
  if (!session?.connection.isCurrent()) return
  const existing = savedAccounts.value.find(account => account.email.toLowerCase() === session.email.toLowerCase())
  if (!create && !session.allowCreate && existing?.authKeyHash !== session.hash) return
  const run = ++vaultWrite
  savingVault.value = true
  try {
    const encrypted = await encryptSavedSession(session.connection.authKey, session.passphrase, {
      editorStates: state.baselineEditorStates, recovery: state.recovery, allowLegacyPin: session.legacy,
    })
    if (run !== vaultWrite || vaultSession !== session || !session.connection.isCurrent()) return
    upsertSavedAccount({ ...encrypted, email: session.email, userId: session.connection.user.id, origin: session.connection.origin, label: existing?.label || session.email, authKeyHash: session.hash, updatedAt: Date.now() })
    session.allowCreate = false
    vaultError.value = ''
  } catch (error) {
    if (run === vaultWrite && vaultSession === session) vaultError.value = 'The encrypted account could not be updated. Recovery and customization changes are only in this tab; download a private backup before closing.'
    throw error
  } finally { if (run === vaultWrite) savingVault.value = false }
}
const controller = createManagerController({ state, api, notice: notify, beforeWrite: async () => {
  try { await persistVault() } catch { /* The exact recovery remains in this tab and the persistent vault warning is shown. */ }
} })
const step = computed(() => state.phase === 'ready' ? 2 : 1)
const addons = computed(() => state.addons)
const isLoading = computed(() => Boolean(state.busy) || savingVault.value)
const currentUserEmail = computed(() => state.user?.email || '')
const hasUnsyncedChanges = computed(() => step.value === 2 && controller.isDirty())
const changes = computed(() => collectionChanges(state.baseline, state.addons))

function clearVaultSession() {
  clearTimeout(persistTimer)
  vaultWrite++
  vaultSession = null
  activeConnection = null
  savingVault.value = false
  vaultError.value = ''
}
async function connect(input) {
  if (input.rememberMe && (!input.rememberPin || input.rememberPin.length < 8)) {
    notify('error', 'Use a vault passphrase of at least 8 characters.'); return
  }
  clearVaultSession()
  editorDirty.value = false
  const connection = await controller.connect(input)
  if (!connection) return
  activeConnection = connection
  const passphrase = input.rememberMe ? input.rememberPin : input.vaultPassphrase || ''
  if (!passphrase) return
  const hash = await hashAuthKey(connection.authKey)
  if (!connection.isCurrent()) return
  vaultSession = { connection, email: connection.user.email, passphrase, hash, legacy: Boolean(input.vaultPassphrase) && !input.rememberMe, allowCreate: Boolean(input.rememberMe) }
  try { await persistVault({ create: Boolean(input.rememberMe) }) }
  catch { notify('error', 'Connected, but the encrypted account could not be saved. Download a private backup before closing.') }
}
const login = input => connect(input)
const loginKey = input => connect(typeof input === 'string' ? { authKey: input } : input)
function performDisconnect() {
  clearVaultSession()
  controller.disconnect()
  editorDirty.value = false
  reviewOpen.value = false
  notify('success', 'Disconnected locally. Remembered accounts remain encrypted.')
}
function requestDisconnect() {
  if (!hasUnsyncedChanges.value && !editorDirty.value) { performDisconnect(); return }
  showConfirmation({ title: 'Discard local changes?', message: 'Switching accounts discards unsynced changes and open editor changes. Download a private backup first if you need them.', confirmText: 'Discard and switch', action: performDisconnect })
}
async function performRevoke(connection) {
  if (!connection?.isCurrent()) return
  let hash = ''
  try { hash = await hashAuthKey(connection.authKey) } catch { /* Revocation must still proceed. */ }
  if (!connection.isCurrent()) return
  clearVaultSession()
  try { if (hash) invalidateSavedKey(hash) } catch { notify('error', 'The saved entry could not be removed; server revocation will still be attempted.') }
  editorDirty.value = false
  reviewOpen.value = false
  await controller.revoke()
}
function logout() {
  const connection = activeConnection
  if (!connection) return
  const shared = connection.origin !== 'password'
  showConfirmation({
    title: 'Sign out and revoke this session?',
    message: `${shared ? 'This key was imported from another Stremio client. Revoking it also affects the session using that same key there. ' : ''}The saved key on this device will be removed. ${hasUnsyncedChanges.value || editorDirty.value ? 'Unsynced changes will be discarded. ' : ''}Use Switch account to disconnect without revoking.`,
    confirmText: 'Sign out and revoke', action: () => performRevoke(connection),
  })
}
function showConfirmation(value) { confirmationModal.value = { show: true, type: 'danger', ...value } }
function closeConfirmationModal() { confirmationModal.value.show = false }
function confirmPendingAction() { const action = confirmationModal.value.action; closeConfirmationModal(); action?.() }
function handleReloadRequest() {
  if (!hasUnsyncedChanges.value && !editorDirty.value) { controller.reload(); return }
  showConfirmation({ title: 'Reload from Stremio?', message: 'This discards the current local draft. Download your private backup first if you need to keep it.', confirmText: 'Discard and reload', action: () => controller.reload({ discard: true }) })
}
function handleAddonsUpdate(next) { return controller.updateAddons(next) }
function removeAddon(index) { controller.updateAddons(state.addons.filter((_, i) => i !== index)) }
function requestSync() { if (!isLoading.value && (hasUnsyncedChanges.value || state.uncertainWrite)) reviewOpen.value = true }
async function confirmSync() {
  if (isLoading.value) return
  reviewOpen.value = false
  await controller.sync()
  try { await persistVault() } catch { notify('error', 'The account vault could not be updated. Download a private backup before closing.') }
}
function updateEditorStates(value) {
  state.editorStates = value
  state.baselineEditorStates = committedManifestDrafts(state.baseline, value, state.baselineEditorStates)
}
watch(() => [state.baselineEditorStates, state.recovery], () => {
  clearTimeout(persistTimer)
  if (vaultSession) persistTimer = setTimeout(() => { persistVault().catch(() => notify('error', 'Encrypted workspace could not be saved. Download a private backup.')) }, 500)
}, { deep: true })
function handleBeforeUnload(event) {
  if (!hasUnsyncedChanges.value && !editorDirty.value && !state.busy) return
  event.preventDefault(); event.returnValue = ''
}
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  if (migration.storageError) notify('error', migration.storageError, 10000)
  else if (migratedActive || migration.removedPlaintext) notify('success', 'Old plaintext credentials were removed. Reconnect to remember this account with encryption.', 10000)
})
onUnmounted(() => { window.removeEventListener('beforeunload', handleBeforeUnload); clearVaultSession(); controller.disconnect() })
</script>

<template>
  <div class="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
    <NavBar :isLoggedIn="step === 2" :userEmail="currentUserEmail" @logout="logout" @switch-account="requestDisconnect" />
    
    <main class="flex-grow">
      <transition enter-active-class="transition ease-out duration-300" enter-from-class="translate-y-full opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition ease-in duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="notification.show" role="status" aria-live="polite" :class="notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'" class="fixed bottom-6 left-4 right-4 z-[100] px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 font-medium sm:left-auto sm:right-6 sm:max-w-md">
          <AlertCircle v-if="notification.type === 'error'" class="w-5 h-5" />
          <CheckCircle2 v-else class="w-5 h-5" />
          <span class="min-w-0 break-words">{{ notification.message }}</span>
        </div>
      </transition>

      <div v-if="vaultError" role="alert" class="mx-auto mt-4 max-w-5xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{{ vaultError }}</div>
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
      <p class="mb-4 text-sm">Destination account: <strong>{{ currentUserEmail }}</strong></p>
      <ul v-if="changes.length" class="mb-5 max-h-72 space-y-2 overflow-auto text-sm">
        <li v-for="(change, index) in changes" :key="index" class="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800"><strong>{{ change.kind }}</strong> {{ change.name }}<span v-if="change.position"> → position {{ change.position }}</span></li>
      </ul>
      <p v-else class="mb-4 text-sm">Verify the outcome of the previous sync with Stremio.</p>
      <p class="mb-5 text-xs text-zinc-500">The server is checked for changes before writing. A recovery point is kept in this workspace, and in your encrypted vault when remembered. Another Stremio client can still change the collection during a sync.</p>
      <div class="flex justify-end gap-3"><button class="rounded-lg border px-4 py-2" @click="reviewOpen = false">Cancel</button><button class="btn-primary" :disabled="isLoading" @click="confirmSync">{{ state.uncertainWrite ? 'Verify and sync' : 'Sync reviewed changes' }}</button></div>
    </Modal>
    <Footer />
  </div>
</template>
