<script setup>
import { ref, onMounted, computed } from 'vue'
import { ArrowRight, Loader2, Key, HelpCircle, Smartphone, Monitor, Info, Shield, Copy, Check, AlertTriangle } from 'lucide-vue-next'
import { useClipboard, useWindowSize } from '@vueuse/core'
import SavedAccounts from './SavedAccounts.vue'
import { decryptAuthKey } from '../utils/cryptoVault'

defineProps(['isLoading'])
const emit = defineEmits(['login', 'loginKey'])

const email = ref('')
const password = ref('')
const manualKey = ref('')
const activeTab = ref('desktop') 
const source = ref('')
const { copy, copied } = useClipboard({ source })
const { width } = useWindowSize()

const copyToClipboard = (text) => {
  source.value = text
  copy()
}

const rememberMe = ref(false)
const protectWithPin = ref(true)
const rememberPin = ref('')
const unlockPin = ref('')
const protectedSelection = ref(null)
const accountNotice = ref('')
const accountNoticeType = ref('info')

const setAccountNotice = (message, type = 'info') => {
  accountNotice.value = message
  accountNoticeType.value = type
}

const trimmedPassword = computed(() => password.value.trim())
const trimmedManualKey = computed(() => manualKey.value.trim())
const shouldUseAuthKeyLogin = computed(() => trimmedManualKey.value.length > 0 && trimmedPassword.value.length === 0)

const handleAccountSelect = (account) => {
  email.value = account.email || ''
  password.value = ''
  unlockPin.value = ''
  if (account?.protected && account?.authKeyEncrypted) {
    manualKey.value = ''
    protectedSelection.value = account
    setAccountNotice('This saved account is PIN-protected. Enter its PIN to unlock the AuthKey.', 'info')
  } else {
    manualKey.value = account.authKey || ''
    protectedSelection.value = null
    accountNotice.value = ''
  }
}

const unlockSavedAuthKey = async () => {
  if (!protectedSelection.value) return
  if (!unlockPin.value) {
    setAccountNotice('Enter your PIN to unlock this saved AuthKey.', 'error')
    return
  }

  try {
    manualKey.value = await decryptAuthKey(protectedSelection.value, unlockPin.value)
    protectedSelection.value = null
    unlockPin.value = ''
    setAccountNotice('AuthKey unlocked for this session.', 'success')
  } catch {
    setAccountNotice('Could not unlock AuthKey. Check PIN and try again.', 'error')
  }
}

const handleLogin = () => {
  if (rememberMe.value && protectWithPin.value && rememberPin.value.length < 4) {
    setAccountNotice('PIN must be at least 4 characters before enabling protected Remember Me.', 'error')
    return
  }

  if (protectedSelection.value) {
    setAccountNotice('Unlock the saved AuthKey first, then connect.', 'error')
    return
  }

  if (shouldUseAuthKeyLogin.value) {
    emit('loginKey', trimmedManualKey.value)
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
    protectWithPin: rememberMe.value ? protectWithPin.value : false,
    rememberPin: rememberMe.value && protectWithPin.value ? rememberPin.value : ''
  })
}

// Auto-select tab based on screen size
onMounted(() => {
  if (width.value < 768) activeTab.value = 'mobile'
})
</script>

<template>
  <div class="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-16 grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
    
    <div class="space-y-10">
      
      <div class="space-y-4">
        <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white leading-tight">
          Master Your <br />
          <span class="text-blue-600">Stremio Library</span>
        </h1>
        <p class="text-lg text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Reorder addons, edit manifests, tune capabilities, and backup/restore your setup in one place.
        </p>
      </div>

      <div class="card-base p-6 md:p-8 space-y-6 shadow-xl shadow-zinc-200/50 dark:shadow-black/50 ring-1 ring-zinc-900/5 dark:ring-white/10">
        <div>
          <h3 class="font-bold text-xl text-zinc-900 dark:text-white">Sign In</h3>
          <p class="text-zinc-500 text-sm mt-1">Connect securely with your Stremio credentials.</p>
        </div>
        
        <form @submit.prevent="handleLogin" class="space-y-4">
          <SavedAccounts 
            @selected="handleAccountSelect" 
            class="mb-4"
          />
          <div v-if="protectedSelection" class="space-y-2 p-3 rounded-lg bg-blue-50 dark:bg-zinc-900/50 border border-blue-200 dark:border-zinc-800">
            <label class="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Unlock Saved AuthKey</label>
            <div class="flex gap-2">
              <input v-model="unlockPin" type="password" class="input-field h-10" placeholder="Enter PIN" @keyup.enter="unlockSavedAuthKey" />
              <button type="button" @click="unlockSavedAuthKey" class="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors">
                Unlock
              </button>
            </div>
          </div>
          <p v-if="accountNotice" class="text-xs font-medium" :class="accountNoticeType === 'error' ? 'text-red-600 dark:text-red-400' : accountNoticeType === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'">
            {{ accountNotice }}
          </p>

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">Email</label>
            <input v-model="email" type="email" class="input-field" placeholder="name@example.com" :required="!shouldUseAuthKeyLogin" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">Password</label>
            <input v-model="password" type="password" class="input-field" placeholder="••••••••" />
          </div>
          
          <label class="flex items-center gap-2.5 cursor-pointer group w-fit select-none">
             <div class="relative w-5 h-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center"
                 :class="rememberMe 
                   ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500' 
                   : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 group-hover:border-blue-400 dark:group-hover:border-blue-700'"
             >
                <input type="checkbox" v-model="rememberMe" class="hidden" />
                <Check v-if="rememberMe" class="w-3.5 h-3.5 text-white stroke-[3px]" />
             </div>
             <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">Remember me</span>
          </label>

          <div v-if="rememberMe" class="space-y-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
            <label class="flex items-center gap-2.5 cursor-pointer group w-fit select-none">
              <div class="relative w-5 h-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center"
                  :class="protectWithPin
                    ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 group-hover:border-blue-400 dark:group-hover:border-blue-700'"
              >
                <input type="checkbox" v-model="protectWithPin" class="hidden" />
                <Check v-if="protectWithPin" class="w-3.5 h-3.5 text-white stroke-[3px]" />
              </div>
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Protect remembered AuthKey with PIN (Recommended)</span>
            </label>

            <div v-if="protectWithPin" class="space-y-1.5">
              <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">PIN</label>
              <input v-model="rememberPin" type="password" minlength="4" class="input-field h-10" placeholder="At least 4 characters" />
              <p class="text-xs text-zinc-500 dark:text-zinc-400">PIN never leaves your browser and is required later to unlock this saved AuthKey.</p>
            </div>
          </div>

          <button type="submit" :disabled="isLoading" class="btn-primary w-full mt-2">
            <Loader2 v-if="isLoading" class="w-5 h-5 animate-spin" />
            <span v-else>{{ shouldUseAuthKeyLogin ? 'Connect with Saved AuthKey' : 'Connect Account' }}</span>
          </button>
        </form>

        <div class="relative flex items-center py-2">
          <div class="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
          <span class="flex-shrink-0 mx-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Or using AuthKey</span>
          <div class="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
        </div>

        <div class="flex gap-2">
          <input v-model="manualKey" type="password" placeholder="Paste AuthKey..." class="input-field" />
          <button @click="$emit('loginKey', manualKey)" class="h-12 px-6 rounded-lg bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 text-white font-bold transition-colors">
            Go
          </button>
        </div>

        <div class="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs leading-relaxed">
          <Shield class="w-4 h-4 mt-0.5 shrink-0" />
          <p><strong>Secure:</strong> Credentials are sent to Stremio for login only. We store your AuthKey locally, never your password.</p>
        </div>
      </div>
    </div>

    <div class="space-y-10 pt-2 w-full min-w-0">
      
      <div class="card-base p-6 md:p-8 bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800">
        <div class="flex items-start gap-4">
          <div class="p-3 rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <Info class="w-6 h-6" />
          </div>
          <div class="space-y-2">
            <h3 class="text-xl font-bold text-zinc-900 dark:text-white">Why use this tool?</h3>
            <p class="text-base text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Stremio's default flow makes addon management tedious. This tool gives you safe power features without reinstall loops.
            </p>
            <ul class="text-sm text-zinc-600 dark:text-zinc-300 space-y-1.5 pt-1">
              <li>Reorder addons with drag-and-drop and lock/unlock controls.</li>
              <li>Edit addon manifests in form mode or raw JSON mode.</li>
              <li>Optimize catalogs/search/meta capabilities per addon.</li>
              <li>Backup and restore your addon collection quickly.</li>
            </ul>
          </div>
        </div>
      </div>
      
      <section class="space-y-4">
        <h3 class="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
          <Key class="w-5 h-5 text-blue-600" />
          Get your AuthKey
        </h3>
        
        <div class="card-base p-2 overflow-hidden">
          <div class="grid grid-cols-2 gap-1 p-1 bg-zinc-100 dark:bg-zinc-950/50 rounded-lg mb-4">
            <button 
              @click="activeTab = 'desktop'" 
              class="py-2 text-sm font-semibold rounded-md transition-all flex items-center justify-center gap-2"
              :class="activeTab === 'desktop' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'"
            >
              <Monitor class="w-4 h-4" /> PC / Mac
            </button>
            <button 
              @click="activeTab = 'mobile'" 
              class="py-2 text-sm font-semibold rounded-md transition-all flex items-center justify-center gap-2"
              :class="activeTab === 'mobile' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'"
            >
              <Smartphone class="w-4 h-4" /> Mobile
            </button>
          </div>

          <div v-if="activeTab === 'desktop'" class="px-4 pb-4 space-y-4 text-sm text-zinc-600 dark:text-zinc-300">
            <ol class="list-decimal list-inside space-y-2 marker:text-blue-600 marker:font-bold">
              <li>Open <a href="https://web.stremio.com" target="_blank" class="text-blue-600 underline font-bold">Stremio Web</a> and log into your account first.</li>
              <li>Press <kbd class="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 font-mono text-xs font-bold border border-zinc-300 dark:border-zinc-700">F12</kbd> (or Right Click > Inspect) to open Console.</li>
              <li>Paste this code and hit Enter:</li>
            </ol>
            
            <div class="relative group w-full">
              <div class="bg-zinc-950 text-zinc-300 p-3 pr-10 rounded-lg font-mono text-xs border border-zinc-800 overflow-x-auto no-scrollbar whitespace-nowrap shadow-inner">
                JSON.parse(localStorage.getItem("profile")).auth.key
              </div>
              <button @click="copyToClipboard('JSON.parse(localStorage.getItem(&quot;profile&quot;)).auth.key')" class="absolute right-2 top-2 p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                <Check v-if="copied && source.includes('JSON')" class="w-4 h-4 text-emerald-500" />
                <Copy v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div v-if="activeTab === 'mobile'" class="px-4 pb-4 space-y-4 text-sm text-zinc-600 dark:text-zinc-300">
             <div class="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-medium flex gap-2">
              <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
              <p>Bookmarks are tricky. We recommend using a PC.</p>
            </div>
            <ol class="list-decimal list-inside space-y-2 marker:text-blue-600 marker:font-bold">
              <li>Open <a href="https://web.stremio.com" target="_blank" class="text-blue-600 underline font-bold">Stremio Web</a> in Chrome and log in first.</li>
              <li>Type <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded font-bold">javascript:</code> in URL bar.</li>
              <li>Paste this code and <strong>hit Enter</strong>:</li>
            </ol>

            <div class="relative group w-full">
              <div class="bg-zinc-950 text-zinc-300 p-3 pr-10 rounded-lg font-mono text-xs border border-zinc-800 break-all whitespace-pre-wrap shadow-inner">
(t=document.createElement("textarea"),t.value=JSON.parse(localStorage.profile).auth.key,document.body.append(t),t.select(),document.execCommand("copy"),t.remove())
              </div>
               <button @click="copyToClipboard('(t=document.createElement(&quot;textarea&quot;),t.value=JSON.parse(localStorage.profile).auth.key,document.body.append(t),t.select(),document.execCommand(&quot;copy&quot;),t.remove())')" class="absolute right-2 top-2 p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                 <Check v-if="copied && source.includes('textarea')" class="w-4 h-4 text-emerald-500" />
                <Copy v-else class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <h3 class="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
          <HelpCircle class="w-5 h-5 text-blue-600" />
          Frequently Asked Questions
        </h3>

        <div class="space-y-3">
          <details class="group card-base open:ring-1 ring-blue-500/20">
            <summary class="flex items-center justify-between p-4 font-semibold cursor-pointer list-none text-zinc-800 dark:text-zinc-100 text-sm">
              What can this manager do besides reorder?
              <ArrowRight class="w-4 h-4 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              You can edit manifests (form/JSON), toggle optimization flags (search/catalog/meta), backup/restore collections, and reset an addon manifest to default from the editor.
            </div>
          </details>

          <details class="group card-base open:ring-1 ring-blue-500/20">
            <summary class="flex items-center justify-between p-4 font-semibold cursor-pointer list-none text-zinc-800 dark:text-zinc-100 text-sm">
              Are my credentials safe?
              <ArrowRight class="w-4 h-4 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              Yes. Your password is not stored. It is used only to obtain an AuthKey, and only that AuthKey is saved locally in your browser for convenience.
            </div>
          </details>

          <details class="group card-base open:ring-1 ring-blue-500/20">
            <summary class="flex items-center justify-between p-4 font-semibold cursor-pointer list-none text-zinc-800 dark:text-zinc-100 text-sm">
              Can I move Cinemeta rows and everything else?
              <ArrowRight class="w-4 h-4 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              Yes, moving the Cinemeta addon reorders its rows (like Popular/Featured). "Continue Watching" is pinned by Stremio itself, so it cannot be moved by any addon manager.
            </div>
          </details>

          <details class="group card-base open:ring-1 ring-blue-500/20">
            <summary class="flex items-center justify-between p-4 font-semibold cursor-pointer list-none text-zinc-800 dark:text-zinc-100 text-sm">
              Is PIN-protected Remember Me safer?
              <ArrowRight class="w-4 h-4 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              Yes. With PIN protection, the saved AuthKey is encrypted at rest in your browser storage. You must unlock it with your PIN before use. It reduces local storage exposure risk, though no browser app can fully defend against an active XSS attack.
            </div>
          </details>
        </div>
      </section>

    </div>
  </div>
</template>
