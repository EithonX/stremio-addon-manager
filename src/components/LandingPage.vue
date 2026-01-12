<script setup>
import { ref } from 'vue'
import { ArrowRight, Loader2, Key, HelpCircle, Smartphone, Monitor, Info, Shield, Copy, Check } from 'lucide-vue-next'
import { useClipboard } from '@vueuse/core'

defineProps(['isLoading'])
const emit = defineEmits(['login', 'loginKey'])

const email = ref('')
const password = ref('')
const manualKey = ref('')
const activeTab = ref('desktop') 

// Clipboard logic
const source = ref('')
const { copy, copied } = useClipboard({ source })

const copyToClipboard = (text) => {
  source.value = text
  copy()
}

const handleLogin = () => emit('login', { email: email.value, password: password.value })
</script>

<template>
  <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-20 grid lg:grid-cols-2 gap-16 xl:gap-24 items-start">
    
    <div class="space-y-10">
      
      <div class="space-y-4">
        <h1 class="text-4xl md:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-white leading-[1.1]">
          Master Your <br class="hidden md:block" />
          <span class="text-blue-600">Stremio Library</span>
        </h1>
        <p class="text-xl text-zinc-500 dark:text-zinc-400 max-w-lg leading-relaxed">
          The professional tool to reorder your Stremio catalog. Fix your home screen in seconds.
        </p>
      </div>

      <div class="card-base p-8 md:p-10 space-y-8 ring-1 ring-zinc-900/5 dark:ring-white/10 shadow-2xl shadow-zinc-200/50 dark:shadow-black/50">
        <div>
          <h3 class="font-bold text-2xl text-zinc-900 dark:text-white">Sign In</h3>
          <p class="text-zinc-500 mt-1">Connect securely with your Stremio credentials.</p>
        </div>
        
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div class="space-y-2">
            <label class="text-sm font-bold text-zinc-700 dark:text-zinc-300 ml-1">EMAIL ADDRESS</label>
            <input v-model="email" type="email" class="input-field" placeholder="name@example.com" required />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-bold text-zinc-700 dark:text-zinc-300 ml-1">PASSWORD</label>
            <input v-model="password" type="password" class="input-field" placeholder="••••••••••••" required />
          </div>
          <button type="submit" :disabled="isLoading" class="btn-primary w-full mt-2">
            <Loader2 v-if="isLoading" class="w-6 h-6 animate-spin" />
            <span v-else>Connect Account</span>
          </button>
        </form>

        <div class="relative flex items-center py-2">
          <div class="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
          <span class="flex-shrink-0 mx-4 text-xs font-bold uppercase tracking-widest text-zinc-400">Or using AuthKey</span>
          <div class="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
        </div>

        <div class="flex gap-3">
          <input v-model="manualKey" type="password" placeholder="Paste AuthKey..." class="input-field text-lg py-3" />
          <button @click="$emit('loginKey', manualKey)" class="h-12 md:h-14 px-8 rounded-xl bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 text-white font-bold transition-colors">
            Go
          </button>
        </div>
        
        <div class="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm leading-relaxed">
          <Shield class="w-5 h-5 mt-0.5 shrink-0" />
          <p><strong>Secure by Design:</strong> Credentials are encrypted and sent directly to Stremio via a secure tunnel. We never store them.</p>
        </div>
      </div>
    </div>

    <div class="space-y-12 pt-4">

      <div class="card-base p-8 bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800">
        <div class="flex items-start gap-4">
          <div class="p-3 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
            <Info class="w-6 h-6" />
          </div>
          <div class="space-y-3">
            <h3 class="text-2xl font-bold text-zinc-900 dark:text-white">Why use this?</h3>
            <p class="text-lg text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Stremio locks your addons in installation order. To move a catalog up, you usually have to uninstall everything else. <br><br>
              <strong>This manager solves that.</strong> Drag-and-drop to reorder instantly. No reinstalling required.
            </p>
          </div>
        </div>
      </div>
      
      <section class="space-y-6">
        <h3 class="text-2xl font-bold flex items-center gap-3 text-zinc-900 dark:text-white">
          <Key class="w-6 h-6 text-blue-600" />
          Retrieving your AuthKey
        </h3>
        
        <div class="card-base overflow-hidden">
          <div class="flex border-b border-zinc-200 dark:border-zinc-800">
            <button 
              @click="activeTab = 'desktop'" 
              class="flex-1 py-5 text-base font-bold transition-colors flex items-center justify-center gap-2"
              :class="activeTab === 'desktop' ? 'bg-zinc-50 dark:bg-zinc-800/50 text-blue-600 border-b-2 border-blue-600' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'"
            >
              <Monitor class="w-5 h-5" /> Desktop
            </button>
            <button 
              @click="activeTab = 'mobile'" 
              class="flex-1 py-5 text-base font-bold transition-colors flex items-center justify-center gap-2"
              :class="activeTab === 'mobile' ? 'bg-zinc-50 dark:bg-zinc-800/50 text-blue-600 border-b-2 border-blue-600' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'"
            >
              <Smartphone class="w-5 h-5" /> Mobile
            </button>
          </div>

          <div v-if="activeTab === 'desktop'" class="p-8 space-y-6 text-lg text-zinc-600 dark:text-zinc-300">
            <ol class="list-decimal list-inside space-y-4 marker:text-blue-600 marker:font-bold">
              <li>Log into <a href="https://web.stremio.com" target="_blank" class="text-blue-600 underline font-bold decoration-2 underline-offset-2">Stremio Web</a>.</li>
              <li>Press <kbd class="px-2 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 font-mono text-sm font-bold text-zinc-900 dark:text-white border border-zinc-300 dark:border-zinc-700">F12</kbd> to open the Console.</li>
              <li>Paste this code and hit Enter:</li>
            </ol>
            
            <div class="relative group">
              <div class="bg-zinc-950 text-zinc-300 p-5 pr-14 rounded-xl font-mono text-sm border border-zinc-800 overflow-x-auto no-scrollbar whitespace-nowrap">
                JSON.parse(localStorage.getItem("profile")).auth.key
              </div>
              <button 
                @click="copyToClipboard('JSON.parse(localStorage.getItem(&quot;profile&quot;)).auth.key')"
                class="absolute right-2 top-2 p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                title="Copy Code"
              >
                <Check v-if="copied && source === 'JSON.parse(localStorage.getItem(&quot;profile&quot;)).auth.key'" class="w-5 h-5 text-emerald-500" />
                <Copy v-else class="w-5 h-5" />
              </button>
            </div>
            
            <p>Copy the result (without quotes) and paste it into the AuthKey field.</p>
          </div>

          <div v-if="activeTab === 'mobile'" class="p-8 space-y-6 text-lg text-zinc-600 dark:text-zinc-300">
             <div class="bg-amber-50 dark:bg-amber-900/20 p-5 rounded-xl border border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-200 text-base font-medium">
              ⚠️ <strong>Mobile Note:</strong> Bookmarks are tricky. We recommend using a PC to get the key, then emailing it to yourself.
            </div>
            <p class="font-bold text-zinc-900 dark:text-white">If you must use mobile:</p>
            <ol class="list-decimal list-inside space-y-4 marker:text-blue-600 marker:font-bold">
              <li>Open Stremio Web in Chrome and log in.</li>
              <li>Type <code class="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-bold">javascript:</code> into the address bar.</li>
              <li>Paste this code immediately after it:</li>
            </ol>

            <div class="relative group">
              <div class="bg-zinc-950 text-zinc-300 p-5 pr-14 rounded-xl font-mono text-sm border border-zinc-800 break-all whitespace-pre-wrap">
alert(JSON.parse(localStorage.getItem("profile")).auth.key);
              </div>
               <button 
                @click="copyToClipboard('alert(JSON.parse(localStorage.getItem(&quot;profile&quot;)).auth.key);')"
                class="absolute right-2 top-2 p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                title="Copy Code"
              >
                 <Check v-if="copied" class="w-5 h-5 text-emerald-500" />
                <Copy v-else class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-6">
        <h3 class="text-2xl font-bold flex items-center gap-3 text-zinc-900 dark:text-white">
          <HelpCircle class="w-6 h-6 text-blue-600" />
          Common Questions
        </h3>

        <div class="space-y-4">
          <details class="group card-base open:ring-2 ring-blue-500/20">
            <summary class="flex items-center justify-between p-6 font-bold cursor-pointer list-none text-zinc-800 dark:text-zinc-100 text-lg">
              Can I move "Popular" rows?
              <ArrowRight class="w-5 h-5 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-6 pb-6 text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-2">
              <strong>Yes.</strong> You can move Cinemeta catalogs (Popular/Featured Movies) down the list. 
              <br><br>
              <em>Note:</em> The "Continue Watching" row is pinned by Stremio app logic and cannot be moved.
            </div>
          </details>

          <details class="group card-base open:ring-2 ring-blue-500/20">
            <summary class="flex items-center justify-between p-6 font-bold cursor-pointer list-none text-zinc-800 dark:text-zinc-100 text-lg">
              Will this break my profile?
              <ArrowRight class="w-5 h-5 transition-transform group-open:rotate-90 text-zinc-400" />
            </summary>
            <div class="px-6 pb-6 text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-2">
              No. We only use the <code>addonCollectionSet</code> API endpoint, which is the official way to sync addons. If something looks wrong, simply re-installing your addons will reset the order.
            </div>
          </details>
        </div>
      </section>

    </div>
  </div>
</template>