<script setup>
import { useDark, useToggle } from '@vueuse/core'
import { Moon, Sun } from 'lucide-vue-next'

// useDark() automatically syncs with local storage and OS preference
// It adds the 'dark' class to the <html> tag
const isDark = useDark()
const toggleDark = useToggle(isDark)
</script>

<template>
  <button 
    @click="toggleDark()" 
    class="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
    aria-label="Toggle Theme"
  >
    <Sun v-if="!isDark" class="w-5 h-5" />
    <Moon v-else class="w-5 h-5" />
  </button>
</template>