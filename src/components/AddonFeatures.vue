<script setup>
import { computed } from 'vue'

const props = defineProps({
  manifest: {
    type: Object,
    required: true
  },
  showText: {
    type: Boolean,
    default: false
  }
})

const features = computed(() => {
  const list = []
  
  if (!props.manifest) return list
  
  const resources = props.manifest.resources || []
  const types = props.manifest.types || []
  const catalogs = props.manifest.catalogs || []
  
  if (catalogs.length > 0) {
    list.push({ label: 'Catalogs', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' })
  }
  
  if (resources.includes('stream')) {
    list.push({ label: 'Streams', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' })
  }
  
  if (resources.includes('subtitles')) {
    list.push({ label: 'Subtitles', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' })
  }
  
  if (resources.includes('meta')) {
    list.push({ label: 'Metadata', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' })
  }
  
  return list
})
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <span 
      v-for="feature in features" 
      :key="feature.label"
      class="px-2.5 py-0.5 rounded-full text-xs font-medium border border-transparent transition-colors"
      :class="feature.color"
    >
      {{ feature.label }}
    </span>
    
    <span v-if="features.length === 0" class="text-xs text-zinc-400 dark:text-zinc-500 italic">
      No specific features
    </span>
  </div>
</template>
