<script setup>
import { computed } from 'vue'
import { GripVertical, Trash2, ExternalLink, ShieldCheck, Copy, Settings } from 'lucide-vue-next'
import AddonFeatures from './AddonFeatures.vue'

const props = defineProps({
  addon: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  }
})

const emit = defineEmits(['remove', 'edit'])

const manifest = computed(() => props.addon.manifest || {})
const isProtected = computed(() => props.addon.flags?.protected)
const logo = computed(() => manifest.value.logo || 'https://www.stremio.com/website/stremio-logo-small.png')

const configureUrl = computed(() => {
  if (!props.addon.transportUrl) return '#'
  return props.addon.transportUrl.replace('stremio://', 'https://').replace('/manifest.json', '/configure')
})

const copyUrl = () => {
  navigator.clipboard.writeText(props.addon.transportUrl)
  alert('Manifest URL copied!') // Simple alert or use a toast if available
}
</script>

<template>
  <div class="group relative flex flex-row items-center gap-3 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-blue-400 dark:hover:border-blue-600 transition-all shadow-sm">
    
    <!-- Drag Handle (Desktop) -->
    <div class="drag-handle sm:self-center cursor-grab active:cursor-grabbing p-1 text-zinc-300 hover:text-blue-500 rounded transition-colors hidden sm:block">
      <GripVertical class="w-5 h-5" />
    </div>

    <!-- Drag Handle (Mobile - Left aligned for easier touch) -->
    <div class="drag-handle self-center cursor-grab active:cursor-grabbing p-1 -ml-1 text-zinc-300 hover:text-blue-500 rounded transition-colors sm:hidden">
      <GripVertical class="w-5 h-5" />
    </div>

    <!-- Logo (Smaller on mobile) -->
    <div class="shrink-0 relative">
      <img 
        :src="logo" 
        class="w-10 h-10 sm:w-14 sm:h-14 rounded-lg object-contain bg-zinc-50 dark:bg-zinc-800 p-1"
        loading="lazy"
        alt=""
      />
    </div>

    <!-- Info -->
    <div class="flex-grow min-w-0 space-y-0.5 sm:space-y-1 overflow-hidden">
      <div class="flex items-center gap-2 flex-wrap">
        <h3 class="font-bold text-zinc-900 dark:text-zinc-100 truncate text-sm sm:text-lg">
          {{ manifest.name }}
        </h3>
        <span v-if="manifest.version" class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700">
          v{{ manifest.version }}
        </span>
      </div>
      
      <!-- Description: Hide on mobile, show 1 line on desktop -->
      <p class="hidden sm:block text-sm text-zinc-500 truncate">
        {{ manifest.description }}
      </p>

      <!-- Features Pills: Hide on mobile -->
       <AddonFeatures :manifest="manifest" class="pt-1 hidden sm:flex" />
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-1 self-center bg-zinc-50 dark:bg-zinc-800/50 p-1 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
      <a 
        v-if="manifest.behaviorHints?.configurable"
        :href="configureUrl" 
        target="_blank"
        class="p-1.5 sm:p-2 text-zinc-400 hover:text-blue-600 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-all"
        title="Configure Addon"
      >
        <ExternalLink class="w-4 h-4" />
      </a>

      <!-- Hide Copy/Edit buttons on mobile to save space -->
      <button 
        @click="copyUrl"
        class="hidden sm:block p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-all"
        title="Copy Manifest URL"
      >
        <Copy class="w-4 h-4" />
      </button>

      <button 
        @click="$emit('edit')"
        class="hidden sm:block p-2 text-zinc-400 hover:text-blue-600 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-all"
        title="Edit Manifest"
      >
        <Settings class="w-4 h-4" />
      </button>
      
      <!-- Mobile More Menu (Replacement for hidden buttons) - For now just show Edit since it's most important? 
           Actually, let's just keep Configure, Edit, Delete on mobile. Copy is less useful on mobile. -->
       <button 
        @click="$emit('edit')"
        class="sm:hidden p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-all"
        title="Edit Manifest"
      >
        <Settings class="w-4 h-4" />
      </button>

      <div class="w-px h-3 sm:h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5 sm:mx-1"></div>

      <button 
        v-if="!isProtected" 
        @click="$emit('remove')"
        class="p-1.5 sm:p-2 text-zinc-400 hover:text-red-600 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-all"
        title="Remove Addon"
      >
        <Trash2 class="w-4 h-4" />
      </button>
      
      <div v-else class="p-1.5 sm:p-2 text-zinc-300 dark:text-zinc-600 cursor-not-allowed" title="Protected System Addon">
        <ShieldCheck class="w-4 h-4" />
      </div>
    </div>
  </div>
</template>
