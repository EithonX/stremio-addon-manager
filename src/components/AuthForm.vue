<script setup>
import { ref } from 'vue'
import { ArrowRight, Loader2, Lock } from 'lucide-vue-next'

const props = defineProps(['isLoading'])
const emit = defineEmits(['login', 'loginKey'])

const email = ref('')
const password = ref('')
const manualKey = ref('')

const handleLogin = () => {
  emit('login', { email: email.value, password: password.value })
}

const handleKeyLogin = () => {
  emit('loginKey', manualKey.value)
}
</script>

<template>
  <div class="w-full max-w-md glass-card rounded-3xl p-8 sm:p-10 animate-slide-up mx-auto">
    <div class="text-center mb-10">
      <h2 class="text-3xl font-bold text-white mb-3">Welcome Back</h2>
      <p class="text-slate-400 text-sm">Sign in to organize your Stremio ecosystem.</p>
    </div>

    <form @submit.prevent="handleLogin" class="space-y-5">
      <div class="space-y-1.5">
        <label class="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Email</label>
        <input v-model="email" type="email" class="input-glass" placeholder="user@example.com" required />
      </div>
      <div class="space-y-1.5">
        <label class="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Password</label>
        <div class="relative">
          <input v-model="password" type="password" class="input-glass pr-10" placeholder="••••••••••••" required />
          <Lock class="absolute right-3.5 top-3.5 w-5 h-5 text-slate-600" />
        </div>
      </div>
      <button type="submit" :disabled="isLoading" class="btn-glow w-full flex items-center justify-center gap-2">
        <Loader2 v-if="isLoading" class="w-5 h-5 animate-spin" />
        <span v-else>Connect Account</span>
        <ArrowRight v-if="!isLoading" class="w-5 h-5 opacity-90" />
      </button>
    </form>

    <div class="my-8 flex items-center gap-4 opacity-50">
      <div class="h-px bg-white/20 flex-grow"></div>
      <span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Or manually</span>
      <div class="h-px bg-white/20 flex-grow"></div>
    </div>

    <div class="flex gap-2">
      <input v-model="manualKey" type="password" placeholder="Paste AuthKey..." class="input-glass text-sm py-2.5" />
      <button @click="handleKeyLogin" :disabled="isLoading || !manualKey" class="px-5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium transition-colors border border-white/5">
        Go
      </button>
    </div>
  </div>
</template>