<script setup>
import { ShieldCheck, LogOut } from 'lucide-vue-next'
import ThemeToggle from './ThemeToggle.vue'

defineProps(['isLoggedIn'])
defineEmits(['logout'])
</script>

<template>
  <nav class="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl">
    <div class="max-w-6xl mx-auto px-4 sm:px-8 h-16 md:h-20 flex items-center justify-between">
      
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
          <ShieldCheck class="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <div>
          <h1 class="font-bold text-lg md:text-xl leading-none tracking-tight text-zinc-900 dark:text-zinc-100">Stremio Addon Manager</h1>
          <p class="text-[10px] md:text-xs font-bold text-zinc-500 mt-1">v2.0 by EithonX</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button 
          v-if="isLoggedIn" 
          @click="$emit('logout')" 
          class="flex items-center gap-2 text-zinc-500 hover:text-red-600 px-3 py-2 rounded-lg transition-colors"
          title="Disconnect"
        >
          <LogOut class="w-5 h-5" />
          <span class="hidden sm:inline text-sm font-medium">Disconnect</span>
        </button>
        <div class="h-6 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>
        <ThemeToggle />
      </div>

    </div>
  </nav>
</template>