<script setup>
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { Loader2, GripVertical, Trash2, ExternalLink, ShieldCheck } from 'lucide-vue-next'

const props = defineProps(['addons', 'isLoading'])
const emit = defineEmits(['update:addons', 'sync', 'remove'])

const localAddons = computed({
  get: () => props.addons,
  set: (val) => emit('update:addons', val)
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 md:px-8 pb-32">
    <div class="py-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
      <div>
        <h2 class="text-4xl font-bold text-zinc-900 dark:text-zinc-100">Your Library</h2>
        <p class="text-xl text-zinc-500 mt-2">Drag items to reorder. Sync to save changes.</p>
      </div>
      
      <button 
        @click="$emit('sync')" 
        :disabled="isLoading" 
        class="btn-primary w-full md:w-auto md:min-w-[200px] shadow-lg shadow-blue-600/20"
      >
        <Loader2 v-if="isLoading" class="w-5 h-5 animate-spin" />
        <span v-else>Sync to Stremio</span>
      </button>
    </div>

    <div class="card-base overflow-hidden min-h-[500px] ring-1 ring-zinc-900/5 dark:ring-white/5">
      <div v-if="addons.length === 0" class="flex flex-col items-center justify-center h-96 text-zinc-500">
        <Loader2 class="w-12 h-12 animate-spin mb-6 text-blue-600 opacity-50" />
        <p class="text-xl font-medium">Loading your profile...</p>
      </div>

      <draggable 
        v-else
        v-model="localAddons" 
        item-key="transportUrl"
        handle=".drag-handle"
        :animation="200"
        ghost-class="bg-blue-50/50 dark:bg-blue-900/20"
        class="divide-y divide-zinc-100 dark:divide-zinc-800"
      >
        <template #item="{ element, index }">
          <div class="group flex items-center gap-6 p-5 md:p-7 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors bg-white dark:bg-zinc-900">
            
            <div class="drag-handle cursor-grab active:cursor-grabbing p-3 -ml-3 text-zinc-300 hover:text-blue-600 transition-colors">
              <GripVertical class="w-8 h-8" />
            </div>

            <div class="shrink-0">
              <img 
                :src="element.manifest.logo || 'https://stremio.com/website/images/favicon.svg'" 
                class="w-14 h-14 md:w-20 md:h-20 rounded-2xl object-contain bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 p-2"
                loading="lazy"
                @error="$event.target.src = 'https://stremio.com/website/images/favicon.svg'"
              />
            </div>

            <div class="flex-grow min-w-0 pr-4">
              <div class="flex flex-wrap items-center gap-3 md:gap-4">
                <h3 class="font-bold text-zinc-900 dark:text-zinc-100 truncate text-lg md:text-xl">
                  {{ element.manifest.name }}
                </h3>
                <span v-if="element.manifest.version" class="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-3 py-1 rounded-full font-bold border border-zinc-200 dark:border-zinc-700">
                  v{{ element.manifest.version }}
                </span>
              </div>
              <p class="text-base md:text-lg text-zinc-500 truncate mt-1.5 md:mt-2 max-w-3xl">
                {{ element.manifest.description }}
              </p>
            </div>

            <div class="flex items-center gap-3">
              <a 
                v-if="element.manifest.behaviorHints?.configurable"
                :href="element.transportUrl.replace('stremio://', 'https://').replace('/manifest.json', '/configure')" 
                target="_blank"
                class="p-3 md:p-4 rounded-xl text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all border border-transparent hover:border-blue-100 dark:hover:border-blue-900/50"
                title="Configure"
              >
                <ExternalLink class="w-6 h-6 md:w-7 md:h-7" />
              </a>
              
              <button 
                v-if="!element.flags?.protected" 
                @click="$emit('remove', index)"
                class="p-3 md:p-4 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/50"
                title="Remove"
              >
                <Trash2 class="w-6 h-6 md:w-7 md:h-7" />
              </button>
              
              <div v-else class="p-3 md:p-4 text-zinc-300 dark:text-zinc-700 cursor-not-allowed opacity-50" title="System Addon (Protected)">
                <ShieldCheck class="w-6 h-6 md:w-7 md:h-7" />
              </div>
            </div>
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>