<script setup>
import { ref, onMounted } from 'vue'
import { ArrowRight, Loader2, Key, HelpCircle, Smartphone, Monitor, Info, Shield, Copy, Check, AlertTriangle } from 'lucide-vue-next'
import { useClipboard, useWindowSize } from '@vueuse/core'
import SavedAccounts from './SavedAccounts.vue'

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

const savedAccountsRef = ref(null)

const rememberMe = ref(false)

const handleAccountSelect = (account) => {
  email.value = account.email || ''
  password.value = account.password || ''
  manualKey.value = account.authKey || ''
}

const handleLogin = () => {
  emit('login', { email: email.value, password: password.value, rememberMe: rememberMe.value })
  // We can save the account on successful login in App.vue, but we can also trigger a save here if we want optimistic updates
  // But strictly speaking App.vue handles the logic.
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
          The professional addon manager. Reorder your feed, organize your content, and fix your catalog instantly.
        </p>
      </div>

      <div class="card-base p-6 md:p-8 space-y-6 shadow-xl shadow-zinc-200/50 dark:shadow-black/50 ring-1 ring-zinc-900/5 dark:ring-white/10">
        <div>
          <h3 class="font-bold text-xl text-zinc-900 dark:text-white">Sign In</h3>
          <p class="text-zinc-500 text-sm mt-1">Connect securely with your Stremio credentials.</p>
        </div>
        
        <form @submit.prevent="handleLogin" class="space-y-4">
          <SavedAccounts 
            ref="savedAccountsRef" 
            @selected="handleAccountSelect" 
            class="mb-4"
          />

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">Email</label>
            <input v-model="email" type="email" class="input-field" placeholder="name@example.com" required />
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

          <button type="submit" :disabled="isLoading" class="btn-primary w-full mt-2">
            <Loader2 v-if="isLoading" class="w-5 h-5 animate-spin" />
            <span v-else>Connect Account</span>
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
          <p><strong>Secure:</strong> Credentials are encrypted and sent directly to Stremio via a secure tunnel. We never store them.</p>
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
              Stremio locks addons in the order you install them. To move a catalog up, you normally have to uninstall everything.
              <br><br>
              <strong>This tool fixes that.</strong> Drag-and-drop to reorder instantly without reinstalling.
            </p>
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
              <li>Log into <a href="https://web.stremio.com" target="_blank" class="text-blue-600 underline font-bold">Stremio Web</a>.</li>
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
              <li>Open <a href="https://web.stremio.com" target="_blank" class="text-blue-600 underline font-bold">Stremio Web</a> in Chrome.</li>
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
              Can I move "Popular" rows?
              <ArrowRight class="w-4 h-4 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              Yes. If you move the "Cinemeta" addon, its rows (Popular/Featured) will move with it. Note that the "Continue Watching" row is pinned by Stremio and cannot be moved.
            </div>
          </details>

          <details class="group card-base open:ring-1 ring-blue-500/20">
            <summary class="flex items-center justify-between p-4 font-semibold cursor-pointer list-none text-zinc-800 dark:text-zinc-100 text-sm">
              Are my credentials safe?
              <ArrowRight class="w-4 h-4 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              Yes. We do not store them. They are used once to get an AuthKey, which is saved locally in your browser. Refreshing the page clears your password from memory.
            </div>
          </details>

          <details class="group card-base open:ring-1 ring-blue-500/20">
            <summary class="flex items-center justify-between p-4 font-semibold cursor-pointer list-none text-zinc-800 dark:text-zinc-100 text-sm">
              Will this break my profile?
              <ArrowRight class="w-4 h-4 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              Unlikely. We use the official API to sync the list. However, there is no "Reset to Default" button. If your order gets messy, you can simply uninstall/reinstall your addons to reset the default order.
            </div>
          </details>
        </div>
      </section>

    </div>
  </div>
</template>