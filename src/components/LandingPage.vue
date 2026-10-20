<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { ArrowRight, Loader2, Key, Smartphone, Monitor, Shield, Copy, Check } from '@lucide/vue'
import { useClipboard, useWindowSize } from '@vueuse/core'
import SavedAccounts from './SavedAccounts.vue'
import { decryptSavedSession } from '../utils/cryptoVault.js'

const props = defineProps({
  isLoading: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['login', 'loginKey'])

const email = ref('')
const password = ref('')
const manualKey = ref('')
const authMode = ref('password')
const activeTab = ref('desktop') 
const source = ref('')
const { copy, copied } = useClipboard({ source })
const { width } = useWindowSize()

const copyToClipboard = (text) => {
  source.value = text
  copy()
}

const rememberMe = ref(false)
const rememberPin = ref('')
const unlockPin = ref('')
const protectedSelection = ref(null)
const accountNotice = ref('')
const accountNoticeType = ref('info')
const isUnlocking = ref(false)
const selectedAccount = ref(null)
const unlockedVault = ref(null)
const vaultPassphrase = ref('')
let selectionVersion = 0

const setAccountNotice = (message, type = 'info') => {
  accountNotice.value = message
  accountNoticeType.value = type
}

const trimmedPassword = computed(() => password.value)
const trimmedManualKey = computed(() => manualKey.value.trim())
const shouldUseAuthKeyLogin = computed(() => authMode.value === 'key')

const handleAccountSelect = (account) => {
  selectionVersion++
  isUnlocking.value = false
  selectedAccount.value = account
  unlockedVault.value = null
  vaultPassphrase.value = ''
  rememberMe.value = false
  rememberPin.value = ''
  email.value = account.email || ''
  password.value = ''
  unlockPin.value = ''
  authMode.value = account?.protected ? 'key' : 'password'
  if (account?.protected && account?.authKeyEncrypted) {
    manualKey.value = ''
    protectedSelection.value = account
    setAccountNotice('Enter your saved-account password to unlock it. Older PINs still work.', 'info')
  } else {
    manualKey.value = ''
    protectedSelection.value = null
    accountNotice.value = account.needsReconnect ? 'Sign in again to save this account securely.' : ''
  }
}

const unlockSavedAuthKey = async () => {
  if (!protectedSelection.value || isUnlocking.value) return
  if (!unlockPin.value) { setAccountNotice('Enter your saved-account password or PIN.', 'error'); return }
  const account = protectedSelection.value
  const run = selectionVersion
  const passphrase = unlockPin.value
  isUnlocking.value = true
  try {
    const vault = await decryptSavedSession(account, passphrase)
    if (run !== selectionVersion) return
    unlockedVault.value = vault
    vaultPassphrase.value = passphrase
    manualKey.value = vault.authKey
    protectedSelection.value = null
    unlockPin.value = ''
    setAccountNotice('Account unlocked. Select Connect account to sign in.', 'success')
  } catch {
    if (run === selectionVersion) setAccountNotice('Couldn’t unlock this account. Check your saved-account password or PIN.', 'error')
  } finally { if (run === selectionVersion) isUnlocking.value = false }
}
watch(manualKey, value => {
  if (value.trim() && protectedSelection.value) {
    protectedSelection.value = null
    selectedAccount.value = null
    unlockPin.value = ''
    accountNotice.value = ''
  }
  if (unlockedVault.value && value.trim() !== unlockedVault.value.authKey) {
    unlockedVault.value = null
    vaultPassphrase.value = ''
  }
})

const handleLogin = () => {
  if (props.isLoading || isUnlocking.value) return
  if (rememberMe.value && rememberPin.value.length < 8) {
    setAccountNotice('Choose a saved-account password with at least 8 characters.', 'error')
    return
  }

  if (protectedSelection.value && !trimmedPassword.value) {
    setAccountNotice('Unlock your saved account before connecting.', 'error')
    return
  }

  if (protectedSelection.value && trimmedPassword.value) {
    protectedSelection.value = null
    unlockPin.value = ''
    manualKey.value = ''
    accountNotice.value = ''
  }

  if (shouldUseAuthKeyLogin.value) {
    if (!trimmedManualKey.value) { setAccountNotice('Paste your Stremio AuthKey to continue.', 'error'); return }
    emit('loginKey', {
      authKey: trimmedManualKey.value,
      origin: unlockedVault.value ? selectedAccount.value?.origin : 'imported',
      expectedUserId: unlockedVault.value ? selectedAccount.value?.userId : '',
      editorStates: unlockedVault.value?.editorStates || {},
      recovery: unlockedVault.value?.recovery || null,
      vaultPassphrase: vaultPassphrase.value,
      rememberMe: rememberMe.value, rememberPin: rememberPin.value,
    })
    return
  }

  if (!trimmedPassword.value) {
    setAccountNotice('Enter your password or use an AuthKey to continue.', 'error')
    return
  }

  emit('login', {
    email: email.value,
    password: password.value,
    rememberMe: rememberMe.value,
    rememberPin: rememberMe.value ? rememberPin.value : ''
  })
}

// Auto-select tab based on screen size
onMounted(() => {
  if (width.value < 768) activeTab.value = 'mobile'
})

watch(width, (value) => {
  if (value < 768 && activeTab.value === 'desktop') {
    activeTab.value = 'mobile'
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
    <header class="mb-7 max-w-2xl sm:mb-9">
      <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Your Stremio, your way</p>
      <h2 class="text-3xl font-semibold leading-tight tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-4xl">Your addons.<br class="sm:hidden" /> <span class="text-blue-600 dark:text-blue-400">In your order.</span></h2>
      <p class="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400 sm:text-base">Reorder addons, choose what appears in Stremio, and keep a backup.</p>
    </header>

    <div class="grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
      <section aria-labelledby="sign-in-heading" class="card-base p-5 sm:p-7">
        <h3 id="sign-in-heading" class="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">Connect your account</h3>
        <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Sign in to load your Stremio addons.</p>

        <form @submit.prevent="handleLogin" class="mt-6 space-y-5">
          <SavedAccounts @selected="handleAccountSelect" />
          <div class="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950" aria-label="Sign-in method">
            <button type="button" :aria-pressed="authMode === 'password'" @click="authMode = 'password'; accountNotice = ''" class="min-h-10 rounded-lg px-2 text-sm font-medium transition-colors" :class="authMode === 'password' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'">Email &amp; password</button>
            <button type="button" :aria-pressed="authMode === 'key'" @click="authMode = 'key'; accountNotice = ''" class="min-h-10 rounded-lg px-2 text-sm font-medium transition-colors" :class="authMode === 'key' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'">AuthKey</button>
          </div>

          <template v-if="authMode === 'password'">
            <div class="space-y-2">
              <label for="account-email" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
              <input id="account-email" autocomplete="username" v-model="email" type="email" class="input-field" placeholder="name@example.com" required />
            </div>
            <div class="space-y-2">
              <label for="account-password" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Stremio password</label>
              <input id="account-password" autocomplete="current-password" v-model="password" type="password" class="input-field" placeholder="Your Stremio password" required />
            </div>
          </template>
          <template v-else>
            <div v-if="protectedSelection" class="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-500/5">
              <label for="saved-account-password" class="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Unlock saved account</label>
              <div class="flex flex-wrap gap-2">
                <input id="saved-account-password" v-model="unlockPin" type="password" class="input-field min-w-0 flex-1 basis-40" placeholder="Password or older PIN" autocomplete="off" aria-label="Saved account password or PIN" @keydown.enter.prevent.stop="unlockSavedAuthKey" />
                <button type="button" :disabled="isUnlocking || isLoading" @click="unlockSavedAuthKey" class="btn-primary px-4 text-sm">{{ isUnlocking ? 'Unlocking…' : 'Unlock' }}</button>
              </div>
            </div>
            <div class="space-y-2">
              <label for="account-key" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Stremio AuthKey</label>
              <input id="account-key" v-model="manualKey" type="password" placeholder="Paste your AuthKey" autocomplete="off" spellcheck="false" class="input-field" :required="!protectedSelection" />
              <p class="text-xs leading-5 text-zinc-600 dark:text-zinc-400">An AuthKey lets you connect without entering your Stremio password.</p>
            </div>
          </template>

          <p v-if="accountNotice" role="status" class="rounded-lg px-3 py-2.5 text-sm leading-5" :class="accountNoticeType === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : accountNoticeType === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'">{{ accountNotice }}</p>

          <div class="rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
            <label class="flex min-h-6 cursor-pointer items-center gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              <input id="remember-account" type="checkbox" v-model="rememberMe" class="h-4 w-4 shrink-0 accent-blue-600 dark:accent-blue-500" />
              <span>Remember this account</span>
            </label>
            <p class="ml-7 mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">Saved on this device, protected with a password you choose.</p>
            <div v-if="rememberMe" class="mt-4 space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <label for="vault-passphrase" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Saved-account password</label>
              <input id="vault-passphrase" v-model="rememberPin" type="password" minlength="8" required autocomplete="new-password" class="input-field" placeholder="Choose at least 8 characters" aria-describedby="saved-password-help" />
              <p id="saved-password-help" class="text-xs leading-5 text-zinc-600 dark:text-zinc-400">Use this to unlock the account next time. Choose a different password from your Stremio password.</p>
            </div>
          </div>

          <button type="submit" :disabled="isLoading || isUnlocking" class="btn-primary w-full">
            <Loader2 v-if="isLoading" class="h-4 w-4 animate-spin" />
            <span>{{ isLoading ? 'Connecting…' : 'Connect account' }}</span>
            <ArrowRight v-if="!isLoading" class="h-4 w-4" />
          </button>
        </form>
        <p class="mt-5 flex items-start gap-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400"><Shield class="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" /><span>Sign-in details pass through this site to Stremio. Your Stremio password isn’t saved.</span></p>
      </section>

      <aside class="min-w-0 space-y-5">
        <section class="card-base p-5 sm:p-6" aria-labelledby="help-heading">
          <h3 id="help-heading" class="text-base font-semibold text-zinc-950 dark:text-zinc-100">Before you start</h3>
          <div class="mt-4 space-y-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            <div><p class="font-medium text-zinc-800 dark:text-zinc-200">Make changes at your own pace</p><p>Your changes stay here until you review and sync them to Stremio.</p></div>
            <div><p class="font-medium text-zinc-800 dark:text-zinc-200">Keep a copy</p><p>Download a backup before making big changes. Keep it private; addon links can contain account details.</p></div>
          </div>
          <div class="mt-5 divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            <details class="group py-3.5">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">What can I change?<ArrowRight class="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-90" /></summary>
              <p class="mt-2 pr-5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Reorder addons and their catalogs, show or hide features, edit addon details, and back up or restore your list. Stremio controls some rows, including Continue Watching.</p>
            </details>
            <details class="group pt-3.5">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">How does remembering my account work?<ArrowRight class="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-90" /></summary>
              <p class="mt-2 pr-5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Your AuthKey and saved settings are encrypted on this device. Unlock them with your saved-account password when you return. Your Stremio password is never saved.</p>
            </details>
          </div>
        </section>

        <details :open="authMode === 'key'" class="card-base group p-5 sm:p-6">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"><span class="flex items-center gap-2"><Key class="h-4 w-4 text-blue-600 dark:text-blue-400" />Find your AuthKey</span><ArrowRight class="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-90" /></summary>
          <div class="mt-4">
            <div class="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950">
              <button type="button" @click="activeTab = 'desktop'" :aria-pressed="activeTab === 'desktop'" class="flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium" :class="activeTab === 'desktop' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'"><Monitor class="h-4 w-4" />Desktop</button>
              <button type="button" @click="activeTab = 'mobile'" :aria-pressed="activeTab === 'mobile'" class="flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium" :class="activeTab === 'mobile' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'"><Smartphone class="h-4 w-4" />Mobile</button>
            </div>
            <div v-if="activeTab === 'desktop'" class="space-y-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              <ol class="list-inside list-decimal space-y-2 marker:font-medium marker:text-blue-600 dark:marker:text-blue-400"><li>Open <a href="https://web.stremio.com" target="_blank" rel="noopener noreferrer" class="font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400">Stremio Web</a> and sign in.</li><li>Press <kbd class="rounded border border-zinc-300 px-1.5 py-0.5 text-xs dark:border-zinc-700">F12</kbd> and open the Console tab.</li><li>Run the code below, then copy the resulting key.</li></ol>
              <div class="relative rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"><pre class="overflow-x-auto whitespace-pre-wrap break-all p-3 pr-12 font-mono text-xs leading-6 text-zinc-700 dark:text-zinc-300">JSON.parse(localStorage.getItem("profile")).auth.key</pre><button type="button" aria-label="Copy desktop instructions" @click="copyToClipboard('JSON.parse(localStorage.getItem(&quot;profile&quot;)).auth.key')" class="absolute right-1.5 top-1.5 rounded-lg p-2 text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"><Check v-if="copied && source.includes('JSON')" class="h-4 w-4 text-emerald-500" /><Copy v-else class="h-4 w-4" /></button></div>
            </div>
            <div v-else class="space-y-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              <p class="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">This may not work in every mobile browser. You can also sign in with email and password.</p>
              <ol class="list-inside list-decimal space-y-2 marker:font-medium marker:text-blue-600 dark:marker:text-blue-400"><li>Open <a href="https://web.stremio.com" target="_blank" rel="noopener noreferrer" class="font-medium text-blue-600 underline dark:text-blue-400">Stremio Web</a> in Chrome and sign in.</li><li>Type <code class="rounded bg-zinc-100 px-1 dark:bg-zinc-800">javascript:</code> in the address bar.</li><li>Paste the code below after it and run it to copy your key.</li></ol>
              <div class="relative rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"><pre class="overflow-x-auto whitespace-pre-wrap break-all p-3 pr-12 font-mono text-xs leading-6 text-zinc-700 dark:text-zinc-300">(t=document.createElement("textarea"),t.value=JSON.parse(localStorage.profile).auth.key,document.body.append(t),t.select(),document.execCommand("copy"),t.remove())</pre><button type="button" aria-label="Copy mobile instructions" @click="copyToClipboard('(t=document.createElement(&quot;textarea&quot;),t.value=JSON.parse(localStorage.profile).auth.key,document.body.append(t),t.select(),document.execCommand(&quot;copy&quot;),t.remove())')" class="absolute right-1.5 top-1.5 rounded-lg p-2 text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"><Check v-if="copied && source.includes('textarea')" class="h-4 w-4 text-emerald-500" /><Copy v-else class="h-4 w-4" /></button></div>
            </div>
          </div>
        </details>
      </aside>
    </div>
  </div>
</template>
