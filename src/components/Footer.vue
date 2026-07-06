<script setup>
import { Github, Heart } from 'lucide-vue-next'

const appVersion = __APP_VERSION__
const repoUrl = 'https://github.com/EithonX/stremio-addon-manager'
</script>

<template>
  <footer class="mt-auto border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
    <div class="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-5 sm:flex-row sm:justify-between sm:gap-4 sm:px-8">

      <!-- primary: made by + source -->
      <p class="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        Made with
        <Heart class="h-3.5 w-3.5 animate-heartbeat fill-red-500 text-red-500" aria-label="love" />
        by
        <a
          href="https://github.com/EithonX"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          EithonX
        </a>
        <span class="text-zinc-300 dark:text-zinc-700">·</span>
        <a
          :href="repoUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          <Github class="h-3.5 w-3.5" />
          Source
        </a>
      </p>

      <!-- secondary: version + attribution -->
      <p class="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-600">
        <span class="font-medium">v{{ appVersion }}</span>
        <span class="text-zinc-300 dark:text-zinc-700">·</span>
        <a
          href="https://github.com/pancake3000/stremio-addon-manager"
          target="_blank"
          rel="noopener noreferrer"
          class="transition-colors hover:text-zinc-600 dark:hover:text-zinc-400"
        >
          based on Pancake3000
        </a>
      </p>

    </div>
  </footer>
</template>

<style scoped>
@keyframes heartbeat {
  0%, 100% {
    transform: scale(1);
  }
  15% {
    transform: scale(1.25);
  }
  30% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.15);
  }
  60% {
    transform: scale(1);
  }
}

.animate-heartbeat {
  animation: heartbeat 2.5s ease-in-out infinite;
}
</style>
