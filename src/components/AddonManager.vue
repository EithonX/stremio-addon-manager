<script setup>
import draggable from 'vuedraggable'
import { Loader2, GripVertical, Trash2, ExternalLink, ShieldCheck } from 'lucide-vue-next'

const props = defineProps(['addons', 'isLoading'])
const emit = defineEmits(['update:addons', 'sync', 'remove'])

// Wrapper for v-model binding
const localAddons = computed({
  get: () => props.addons,
  set: (val) => emit('update:addons', val)
})

import { computed } from 'vue'
</script>

<template>
  <div class="w-full max-w-4xl mx-auto animate-fade-in pb-20">
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 px-2">
      <div>
        <h2 class="text-2xl font-bold text-white">Your Library</h2>
        <p class="text-slate-400 text-sm mt-1">Drag items to reorder. Changes apply after sync.</p>
      </div>
      <button @click="$emit('sync')" :disabled="isLoading" class="btn-glow py-2.5 px-6 text-sm flex items-center justify-center gap-2 w-full sm:w-auto">
        <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
        <span v-else>Sync to Stremio</span>
      </button>
    </div>

    <div class="glass-card rounded-2xl overflow-hidden min-h-[300px] bg-midnight-900/50">
      <div v-if="addons.length === 0" class="flex flex-col items-center justify-center h-64 text-slate-500">
        <Loader2 class="w-10 h-10 animate-spin mb-4 opacity-40" />
        <p>Loading your collection...</p>
      </div>

      <draggable 
        v-else
        v-model="localAddons" 
        item-key="transportUrl"
        handle=".drag-handle"
        :animation="200"
        ghost-class="ghost-item"
        class="divide-y divide-white/5"
      >
        <template #item="{ element, index }">
          <div class="group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-white/[0.02] transition-colors bg-midnight-900/40">
            <div class="drag-handle cursor-grab active:cursor-grabbing p-2 text-slate-600 hover:text-slate-300 transition-colors">
              <GripVertical class="w-5 h-5" />
            </div>

            <div class="shrink-0 relative">
              <img 
                :src="element.manifest.logo || 'https://stremio.com/website/images/favicon.svg'" 
                class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-contain bg-black/30 border border-white/5 p-1"
                @error="$event.target.src = 'https://stremio.com/website/images/favicon.svg'"
              />
            </div>

            <div class="flex-grow min-w-0 pr-2">
              <div class="flex items-center gap-2 mb-0.5">
                <h3 class="font-semibold text-sm sm:text-base text-slate-200 truncate">{{ element.manifest.name }}</h3>
                <span v-if="element.manifest.version" class="hidden sm:inline-block text-[10px] bg-slate-800 text-slate-500 px-1.5 rounded border border-white/5">v{{ element.manifest.version }}</span>
              </div>
              <p class="text-xs text-slate-500 truncate">{{ element.manifest.description }}</p>
            </div>

            <div class="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <a 
                v-if="element.manifest.behaviorHints?.configurable"
                :href="element.transportUrl.replace('stremio://', 'https://').replace('/manifest.json', '/configure')" 
                target="_blank"
                class="p-2 text-slate-500 hover:text-brand-secondary hover:bg-brand-secondary/10 rounded-lg transition-all"
                title="Configure"
              >
                <ExternalLink class="w-4 h-4" />
              </a>
              
              <button 
                v-if="!element.flags?.protected" 
                @click="$emit('remove', index)"
                class="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                title="Remove"
              >
                <Trash2 class="w-4 h-4" />
              </button>
              
              <div v-else class="p-2 text-slate-700 cursor-help" title="Protected System Addon">
                <ShieldCheck class="w-4 h-4" />
              </div>
            </div>
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>

<style scoped>
.ghost-item {
  @apply opacity-60 bg-brand-primary/10 border-brand-primary/30 rounded-lg;
}
</style>