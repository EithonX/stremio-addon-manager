<script setup>
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { Loader2, GripVertical, Trash2, ExternalLink, ShieldCheck } from 'lucide-vue-next'
import AddonIcon from './AddonIcon.vue'

const props = defineProps(['addons', 'isLoading'])
const emit = defineEmits(['update:addons', 'sync', 'remove'])

// 1. Setup two-way binding for the list
const localAddons = computed({
  get: () => props.addons,
  set: (val) => emit('update:addons', val)
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 pb-24">
    <div class="py-8 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
      <div>
        <h2 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Your Library</h2>
        <p class="text-zinc-500 mt-1">Drag items to reorder. Sync to save changes.</p>
      </div>
      
      <button 
        @click="$emit('sync')" 
        :disabled="isLoading" 
        class="btn-primary w-full sm:w-auto min-w-[160px] shadow-lg shadow-blue-600/10"
      >
        <Loader2 v-if="isLoading" class="w-5 h-5 animate-spin" />
        <span v-else>Sync to Stremio</span>
      </button>
    </div>

    <div class="card-base overflow-hidden min-h-[400px] ring-1 ring-zinc-900/5 dark:ring-white/5">
      <div v-if="addons.length === 0" class="flex flex-col items-center justify-center h-80 text-zinc-500">
        <Loader2 class="w-10 h-10 animate-spin mb-4 text-blue-600 opacity-50" />
        <p class="text-lg font-medium">Loading your profile...</p>
      </div>

      <draggable 
        v-else
        v-model="localAddons" 
        item-key="transportUrl"
        handle=".drag-handle"
        :animation="200"
        :force-fallback="true"
        :scroll-sensitivity="200"
        class="divide-y divide-zinc-100 dark:divide-zinc-800"
      >
        <template #item="{ element, index }">
          <div class="group flex items-center gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors bg-white dark:bg-zinc-900 select-none">
            
            <div class="drag-handle cursor-grab active:cursor-grabbing p-2 -ml-2 text-zinc-300 hover:text-blue-600 transition-colors touch-none">
              <GripVertical class="w-6 h-6" />
            </div>

            <AddonIcon :src="element.manifest.logo" :alt="element.manifest.name" />

            <div class="flex-grow min-w-0 pr-4">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-bold text-zinc-900 dark:text-zinc-100 truncate text-base">
                  {{ element.manifest.name }}
                </h3>
                <span v-if="element.manifest.version" class="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded font-medium border border-zinc-200 dark:border-zinc-700">
                  v{{ element.manifest.version }}
                </span>
              </div>
              <p class="text-sm text-zinc-500 truncate mt-1 max-w-xl">
                {{ element.manifest.description }}
              </p>
            </div>

            <div class="flex items-center gap-2">
              <a 
                v-if="element.manifest.behaviorHints?.configurable"
                :href="element.transportUrl.replace('stremio://', 'https://').replace('/manifest.json', '/configure')" 
                target="_blank"
                class="p-2 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                title="Configure"
              >
                <ExternalLink class="w-5 h-5" />
              </a>
              
              <button 
                v-if="!element.flags?.protected" 
                @click="$emit('remove', index)"
                class="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                title="Remove"
              >
                <Trash2 class="w-5 h-5" />
              </button>
              
              <div v-else class="p-2 text-zinc-300 dark:text-zinc-700 cursor-not-allowed opacity-50" title="System Addon (Protected)">
                <ShieldCheck class="w-5 h-5" />
              </div>
            </div>
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>