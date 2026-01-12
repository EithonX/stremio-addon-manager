<script setup>
import { ShieldCheck, LogOut } from 'lucide-vue-next'
import ThemeToggle from './ThemeToggle.vue'

defineProps(['isLoggedIn'])
defineEmits(['logout'])
</script>

<template>
  <nav class="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl">
    <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      
      <div class="flex items-center gap-3 md:gap-4">
        <div class="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20 ring-4 ring-blue-50 dark:ring-blue-900/20">
          <ShieldCheck class="w-6 h-6" />
        </div>
        <div class="flex flex-col justify-center">
          <h1 class="font-bold text-xl md:text-2xl leading-none tracking-tight text-zinc-900 dark:text-zinc-100">Addon Manager</h1>
          <p class="text-[11px] md:text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">Reimagined by EithonX</p>
        </div>
      </div>

      <div class="flex items-center gap-3 md:gap-4">
        <button 
          v-if="isLoggedIn" 
          @click="$emit('logout')" 
          class="hidden sm:flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-lg transition-all"
        >
          <LogOut class="w-4 h-4" />
          <span>Disconnect</span>
        </button>
        <div class="h-6 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>
        <ThemeToggle />
      </div>

    </div>
  </nav>
</template>