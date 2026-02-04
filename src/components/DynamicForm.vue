<script setup>
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import Draggable from 'vuedraggable'
import { Move, Trash2, Home, Compass, Edit3, Code, RotateCcw, Save, X } from 'lucide-vue-next'
import AddonFeatures from './AddonFeatures.vue'
import Modal from './ui/Modal.vue'

const props = defineProps({
  manifest: { type: Object, required: true },
  manifestURL: { type: String, default: '' },
  highlightCatalog: { type: [String, Object], default: null },
  flags: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update-manifest', 'cancel'])

const isAdvancedMode = ref(false)
const formModel = ref({
  name: '', description: '', logo: '', background: '', catalogs: []
})
const jsonModel = ref('')
const initialManifest = ref(null)
const isResetting = ref(false)
const hasUnsavedChanges = ref(false)

// Initialize
watch(() => props.manifest, (newManifest) => {
  const clone = JSON.parse(JSON.stringify(newManifest))
  ensureCatalogDragKeys(clone.catalogs)
  formModel.value = clone
  syncJsonModel()
  initialManifest.value = JSON.parse(JSON.stringify(clone))
  hasUnsavedChanges.value = false
}, { immediate: true })

// Deep watch for changes
watch(formModel, checkForChanges, { deep: true })
watch(jsonModel, () => { if (isAdvancedMode.value) checkForChanges() })

function checkForChanges() {
  if (!initialManifest.value) return
  
  let currentState, initialState
  try {
    if (isAdvancedMode.value) {
      currentState = JSON.stringify(JSON.parse(jsonModel.value))
      initialState = JSON.stringify(toSanitizedManifest(initialManifest.value))
    } else {
      currentState = JSON.stringify(toSanitizedManifest(formModel.value))
      initialState = JSON.stringify(toSanitizedManifest(initialManifest.value))
    }
    hasUnsavedChanges.value = currentState !== initialState
  } catch (e) {
    hasUnsavedChanges.value = true
  }
}

function toSanitizedManifest(model) {
  const clone = JSON.parse(JSON.stringify(model))
  if (Array.isArray(clone.catalogs)) {
    clone.catalogs.forEach(c => delete c.__dragKey)
  }
  return clone
}

function syncJsonModel() {
  jsonModel.value = JSON.stringify(toSanitizedManifest(formModel.value), null, 2)
}

function ensureCatalogDragKeys(catalogs) {
  if (!Array.isArray(catalogs)) return
  const stamp = Date.now()
  catalogs.forEach((c, idx) => {
    if (!c.__dragKey) c.__dragKey = `${c.type}-${stamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`
  })
}

function toggleEditMode() {
  if (isAdvancedMode.value) {
    // Switch to Form
    try {
      const parsed = JSON.parse(jsonModel.value)
      ensureCatalogDragKeys(parsed.catalogs)
      formModel.value = parsed
      isAdvancedMode.value = false
    } catch (e) {
      alert('Invalid JSON. Please fix errors before switching.')
    }
  } else {
    // Switch to JSON
    syncJsonModel()
    isAdvancedMode.value = true
  }
}

function handleSubmit() {
  if (isAdvancedMode.value) {
    try {
      const parsed = JSON.parse(jsonModel.value)
      emit('update-manifest', toSanitizedManifest(parsed))
    } catch(e) {
      alert('Invalid JSON')
    }
  } else {
    emit('update-manifest', toSanitizedManifest(formModel.value))
  }
}

// Catalog Helpers
function hasSystemExtra(catalog) {
  if (!Array.isArray(catalog.extra)) return false
  return catalog.extra.some(e => ['lastVideosIds', 'calendarVideosIds'].includes(e.name))
}

function hasSearchExtra(catalog) {
  return catalog.extra?.some(e => e.name === 'search')
}

function isCatalogVisible(catalog) {
  if (hasSearchExtra(catalog)) {
    const search = catalog.extra.find(e => e.name === 'search')
    return search && !search.isRequired
  }
  if (catalog.extra?.some(e => e.name === 'genre')) {
    const genre = catalog.extra.find(e => e.name === 'genre')
    return genre && !genre.isRequired
  }
  return !catalog.extra?.length // Visible by default if no extras
}

function toggleCatalogVisibility(catalog) {
  const isVisible = isCatalogVisible(catalog)
  if (!Array.isArray(catalog.extra)) catalog.extra = []
  
  // Search Extra Logic
  const searchExtra = catalog.extra.find(e => e.name === 'search')
  if (searchExtra) {
    if (isVisible) searchExtra.isRequired = true // Hide
    else delete searchExtra.isRequired // Show
  }
  
  // Genre Extra Logic
  const genreExtra = catalog.extra.find(e => e.name === 'genre')
  if (genreExtra) {
    if (isVisible) genreExtra.isRequired = true // Hide
    else delete genreExtra.isRequired // Show
  } else if (!searchExtra && catalog.extra.length === 0 && isVisible) {
    // Add genre extra to hide generic catalogs
    catalog.extra.push({ name: 'genre', isRequired: true, options: [], optionsLimit: 1 })
  }
  
  syncJsonModel()
}

function deleteCatalog(index) {
  if (confirm('Delete this catalog?')) {
    formModel.value.catalogs.splice(index, 1)
    syncJsonModel()
  }
}

// Fix reset logic to properly fetch and parse
async function handleReset() {
  if (!confirm('Reset addon to original defaults? All changes will be lost.')) return
  isResetting.value = true
  
  try {
    // 1. Convert stremio:// to https://
    let url = props.manifestURL.replace('stremio://', 'https://')
    
    // 2. Add timestamp to bypass cache
    const separator = url.includes('?') ? '&' : '?'
    const fetchUrl = `${url}${separator}t=${Date.now()}`
    
    const res = await fetch(fetchUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    
    // 3. Verify it's a valid manifest
    if (!data.id || !data.version) throw new Error('Invalid manifest response')

    const clone = JSON.parse(JSON.stringify(data))
    ensureCatalogDragKeys(clone.catalogs)
    formModel.value = clone
    syncJsonModel()
    
    // 4. Update initialManifest so "Save" button becomes disabled if it matches original
    // OR should we consider a reset as a "change" that needs saving?
    // User wants to "Reset", usually meaning "Revert to factory".
    // If they save, it overwrites their stored config with factory default.
    // So yes, we mark it as unsaved changes compared to *current stored state*.
    hasUnsavedChanges.value = true 

    // Optional: Auto-save? No, let user confirm via Save button.
    alert('Reset successful. Click "Save Changes" to apply.')
    
  } catch(e) {
    alert('Failed to reset: ' + e.message)
    console.error(e)
  } finally {
    isResetting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col">
    <div class="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
      <h3 class="text-xl font-semibold text-zinc-900 dark:text-white truncate pr-4">
        Edit {{ formModel.name || 'Addon' }}
      </h3>
      <div class="flex gap-2">
        <button 
          @click="toggleEditMode"
          class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <component :is="isAdvancedMode ? Edit3 : Code" class="w-4 h-4" />
          {{ isAdvancedMode ? 'Form Mode' : 'JSON Mode' }}
        </button>
      </div>
    </div>

    <!-- Scrollable Content -->
    <!-- Removed overflow-y-auto from here, relying on inner container if needed or letting parent handle it? -->
    <!-- The user complained about "inner scroll" being ugly. 
         Ideally, the modal body (parent) scrolls, and this form just expands. 
         But we set h-[80vh] on line 189. 
         Let's remove fixed height and let it flow. -->
    <div class="space-y-6 pt-4 pb-8">
      <template v-if="!isAdvancedMode">
        <!-- Basic Info -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
            <input v-model="formModel.name" class="input-field" placeholder="Addon Name" />
          </div>
           <div class="space-y-2">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</label>
             <input v-model="formModel.description" class="input-field" placeholder="Description" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo URL</label>
             <input v-model="formModel.logo" class="input-field" placeholder="https://..." />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Background URL</label>
             <input v-model="formModel.background" class="input-field" placeholder="https://..." />
          </div>
        </div>

        <div class="pt-2">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">Capabilities</label>
          <AddonFeatures :manifest="formModel" />
        </div>

        <hr class="border-zinc-100 dark:border-zinc-800" />

        <!-- Catalogs Editor -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="text-lg font-medium text-zinc-900 dark:text-zinc-100">Catalogs</h4>
            <span class="text-xs text-zinc-500">Drag to reorder</span>
          </div>

          <Draggable 
            v-model="formModel.catalogs"
            item-key="__dragKey"
            handle=".drag-handle"
            ghost-class="sortable-ghost"
            class="space-y-3"
          >
            <template #item="{ element, index }">
              <div class="group bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 flex items-center gap-3 transition-all hover:border-blue-400 dark:hover:border-blue-600">
                <!-- Drag Handle -->
                <div class="drag-handle p-2 cursor-grab text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                  <Move class="w-4 h-4" />
                </div>
                
                <!-- Visibility Toggle -->
                <button 
                  v-if="!hasSystemExtra(element)"
                  @click="toggleCatalogVisibility(element)"
                  class="p-2 rounded-lg transition-colors"
                  :class="isCatalogVisible(element) ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-zinc-400 hover:text-zinc-600 bg-zinc-100 dark:bg-zinc-800'"
                  :title="isCatalogVisible(element) ? 'Visible' : 'Hidden'"
                >
                  <component :is="hasSearchExtra(element) ? Compass : Home" class="w-4 h-4" />
                </button>
                <div v-else class="w-8 h-8 flex items-center justify-center">
                    <!-- Placeholder spacing -->
                </div>

                <!-- Type Badge -->
                <span class="px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-zinc-500 font-medium w-16 text-center shrink-0">
                  {{ element.type }}
                </span>

                <!-- Name Input -->
                <input 
                  v-model="element.name" 
                  class="flex-1 bg-transparent border-none outline-none text-sm font-medium placeholder-zinc-400 text-zinc-900 dark:text-zinc-100 focus:ring-0"
                  placeholder="Catalog Name"
                />

                <!-- Delete -->
                <button 
                  v-if="!hasSystemExtra(element) && !hasSearchExtra(element)"
                  @click="deleteCatalog(index)"
                  class="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </template>
          </Draggable>
          
          <div v-if="formModel.catalogs.length === 0" class="text-center py-8 text-zinc-500 italic bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700">
            No catalogs found in this addon.
          </div>
        </div>
      </template>

      <!-- Advanced JSON Editor -->
      <div v-else class="h-full">
         <textarea 
          v-model="jsonModel"
          class="w-full min-h-[500px] font-mono text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="sticky bottom-0 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm -mx-6 -mb-6 mt-6 flex justify-between items-center z-10">
      <button 
        @click="handleReset"
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-red-600 transition-colors"
        :disabled="isResetting"
      >
        <RotateCcw class="w-4 h-4" :class="{ 'animate-spin': isResetting }" />
        {{ isResetting ? 'Resetting...' : 'Reset to Default' }}
      </button>

      <div class="flex gap-3">
        <button 
          @click="$emit('cancel')"
          class="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
        <button 
          @click="handleSubmit"
          :disabled="!hasUnsavedChanges"
          class="btn-primary"
          :class="{ 'opacity-50 cursor-not-allowed': !hasUnsavedChanges }"
        >
          <Save class="w-4 h-4" />
          Save Changes
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Reusing style.css scrollbar */
</style>
