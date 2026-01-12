<template>
  <footer class="mt-auto border-t border-zinc-200 bg-white py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
    <div class="mx-auto max-w-7xl px-4">
      <p class="mb-2 flex items-center justify-center gap-1.5">
        Made with 
        <span class="inline-block animate-pulse text-red-500" aria-label="love">❤️</span> 
        by 
        <a 
          href="https://github.com/EithonX" 
          class="font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          EithonX
        </a>
      </p>
      <p class="text-xs text-zinc-400 dark:text-zinc-600">
        Based on open source work by 
        <a 
          href="https://github.com/pancake3000/stremio-addon-manager" 
          class="text-zinc-500 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-500 dark:hover:text-zinc-400"
          target="_blank" 
          rel="noopener noreferrer"
        >
          Pancake3000
        </a>
      </p>
    </div>
  </footer>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.1);
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>