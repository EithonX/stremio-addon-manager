<script setup>
import { ref, watch } from 'vue'

const props = defineProps(['src', 'alt'])
const hasError = ref(false)
const fallback = '/logo.svg'

// Reset error if the URL changes
watch(() => props.src, () => {
  hasError.value = false
})
</script>

<template>
  <div class="shrink-0 relative">
    <img 
      v-if="!hasError"
      :src="src || fallback" 
      :alt="alt"
      class="w-10 h-10 md:w-12 md:h-12 rounded-lg object-contain bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 p-1"
      @error="hasError = true"
    />
    
    <img 
      v-else
      :src="fallback" 
      :alt="alt"
      class="w-10 h-10 md:w-12 md:h-12 rounded-lg object-contain bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 p-1"
    />
  </div>
</template>