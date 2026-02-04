<script setup>
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import Draggable from 'vuedraggable'
import { Move, Trash2, Home, Compass, Edit3, Code, RotateCcw, Save, X, Search, Grid, FileText, Copy, Check } from 'lucide-vue-next'
import { useClipboard } from '@vueuse/core'
import AddonFeatures from './AddonFeatures.vue'
import Modal from './ui/Modal.vue'
import ConfirmationModal from './ui/ConfirmationModal.vue'

const props = defineProps({
  manifest: { type: Object, required: true },
  manifestURL: { type: String, default: '' },
  highlightCatalog: { type: [String, Object], default: null },
  flags: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update-manifest', 'cancel'])

const isAdvancedMode = ref(false)
const formModel = ref({
  name: '', description: '', logo: '', background: '', catalogs: [], resources: []
})
const jsonModel = ref('')
const initialManifest = ref(null)
const isResetting = ref(false)
const hasUnsavedChanges = ref(false)

// Cleanup/Optimization State to allow restoring within session
const removedCapabilities = ref({
  search: [],
  catalogs: [],
  meta: false
})

// Clipboard
const { copy, copied } = useClipboard({ source: jsonModel })

// Confirmation State
const confirmModal = ref({
  show: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  type: 'danger',
  action: null
})

const lineCount = computed(() => {
  return jsonModel.value.split('\n').length
})

function handleInput(e) {
  // Sync height of wrapper based on content
  const textarea = e.target
  const wrapper = textarea.parentElement
  if(wrapper) {
      wrapper.style.height = 'auto'
      wrapper.style.height = textarea.scrollHeight + 'px'
      
      // Also sync width for horizontal scroll
      wrapper.style.width = 'auto'
      wrapper.style.width = textarea.scrollWidth + 'px'
  }
}

// Initialize
watch(() => props.manifest, (newManifest) => {
  const clone = JSON.parse(JSON.stringify(newManifest))
  ensureCatalogDragKeys(clone.catalogs)
  formModel.value = clone
  syncJsonModel()
  initialManifest.value = JSON.parse(JSON.stringify(clone))
  hasUnsavedChanges.value = false
  
  // Reset removed state on new manifest load
  removedCapabilities.value = { search: [], catalogs: [], meta: false }
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

// Optimization Helpers
function isSearchExtra(extra) {
  return extra.name === 'search'
}

function hasSearchExtra(catalog) {
  return catalog.extra?.some(isSearchExtra)
}

function isDedicatedSearch(catalog) {
  // Considered dedicated if it HAS search extra AND (it's the only extra OR name implies search)
  // Also if search is required, it's likely dedicated/search-only behavior
  if (!hasSearchExtra(catalog)) return false
  const search = catalog.extra.find(isSearchExtra)
  if (search.isRequired) return true
  if (catalog.extra.length === 1) return true
  if (catalog.name.toLowerCase().includes('search')) return true
  return false
}

function isHybridSearch(catalog) {
  return hasSearchExtra(catalog) && !isDedicatedSearch(catalog)
}

function hasCapability(type) {
  if (type === 'search') {
    // Has capability if any catalog provides search (Dedicated or Hybrid)
    return formModel.value.catalogs?.some(hasSearchExtra)
  }
  if (type === 'catalogs') {
    // Has capability if any catalog provides content (Hybrid or Content-Only)
    // Content-Only = No Search Extra OR Hybrid (has search but also content)
    // Basically: Any catalog that is NOT Dedicated Search (which is invisible anyway usually)
    // Or more strictly: Any catalog that has non-search extras OR no extras?
    // Let's simpler: If it's NOT dedicated search, it's a content catalog.
    return formModel.value.catalogs?.some(c => !isDedicatedSearch(c))
  }
  if (type === 'meta') {
    return formModel.value.resources?.includes('meta')
  }
  return false
}

function toggleOptimization(type) {
  const enabled = hasCapability(type)
  
  if (type === 'search') {
    if (enabled) {
      // Disable Search:
      // 1. Dedicated Search Catalogs -> DELETE (Store backup)
      // 2. Hybrid Catalogs -> STRIP 'search' extra (Store backup)
      
      const dedicated = []
      const hybridBackups = [] // { index, extra }
      
      formModel.value.catalogs = formModel.value.catalogs.filter((c, idx) => {
        if (isDedicatedSearch(c)) {
          dedicated.push(c)
          return false // Remove
        }
        if (isHybridSearch(c)) {
          // Strip search extra
          const searchExtra = c.extra.find(isSearchExtra)
          hybridBackups.push({ id: c.id, type: c.type, extra: searchExtra })
          c.extra = c.extra.filter(e => !isSearchExtra(e))
          return true // Keep
        }
        return true
      })
      
      removedCapabilities.value.search = { dedicated, hybridBackups }
    } else {
      // Enable Search:
      // 1. Restore Dedicated
      // 2. Restore Hybrid extras
      const { dedicated, hybridBackups } = removedCapabilities.value.search
      
      if (dedicated && dedicated.length) {
        formModel.value.catalogs.push(...dedicated)
      }
      
      if (hybridBackups && hybridBackups.length) {
        formModel.value.catalogs.forEach(c => {
          // Find matching backup
          const backup = hybridBackups.find(b => b.id === c.id && b.type === c.type)
          if (backup && !hasSearchExtra(c)) {
            if (!c.extra) c.extra = []
            c.extra.push(backup.extra)
          }
        })
      }
      
      removedCapabilities.value.search = [] 
    }
  }
  
  if (type === 'catalogs') {
    if (enabled) {
      // Disable Home Catalogs:
      // 1. Content-Only (No Search) -> DELETE
      // 2. Hybrid -> STRIP non-search extras. Ensure search isRequired=true (to hide from home).
      
      const contentOnly = []
      const hybridBackups = [] 
      
      formModel.value.catalogs = formModel.value.catalogs.filter(c => {
        if (isDedicatedSearch(c)) return true // Keep dedicated search
        
        if (hasSearchExtra(c)) {
          // Hybrid: Become Search-Only
          // Backup original extras
          hybridBackups.push({ id: c.id, type: c.type, extra: [...c.extra] })
          
          // Keep ONLY search extra
          const searchExtra = c.extra.find(isSearchExtra)
          // Force isRequired = true to likely hide from Home
          searchExtra.isRequired = true 
          c.extra = [searchExtra]
          return true
        } else {
          // Content-Only: Delete
          contentOnly.push(c)
          return false
        }
      })
      
      removedCapabilities.value.catalogs = { contentOnly, hybridBackups }
    } else {
      // Enable Home Catalogs:
      const { contentOnly, hybridBackups } = removedCapabilities.value.catalogs
      
      if (contentOnly && contentOnly.length) {
        formModel.value.catalogs.push(...contentOnly)
      }
      
      if (hybridBackups && hybridBackups.length) {
        formModel.value.catalogs.forEach(c => {
          const backup = hybridBackups.find(b => b.id === c.id && b.type === c.type)
          if (backup) {
            // Restore full extras
            c.extra = backup.extra
          }
        })
      }
      removedCapabilities.value.catalogs = []
    }
  }
  
  if (type === 'meta') {
    const r = formModel.value.resources || []
    if (enabled) {
      // Disable: remove 'meta'
      formModel.value.resources = r.filter(x => x !== 'meta')
      removedCapabilities.value.meta = true
    } else {
      // Enable: add 'meta' (if it was removed or just add it)
      if (!r.includes('meta')) formModel.value.resources.push('meta')
      removedCapabilities.value.meta = false
    }
  }
  
  syncJsonModel()
}

// Catalog Helpers
function hasSystemExtra(catalog) {
  if (!Array.isArray(catalog.extra)) return false
  return catalog.extra.some(e => ['lastVideosIds', 'calendarVideosIds'].includes(e.name))
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
  confirmModal.value = {
    show: true,
    title: 'Delete Catalog?',
    message: 'Are you sure you want to delete this catalog? This action cannot be undone.',
    confirmText: 'Delete',
    type: 'danger',
    action: () => {
      formModel.value.catalogs.splice(index, 1)
      syncJsonModel()
      confirmModal.value.show = false
    }
  }
}

// Basic Syntax Highlighting for JSON
function highlightJson(json) {
  if (!json) return ''
  // Escape HTML
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Regex tokens
  return escaped.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'text-purple-600 dark:text-purple-400' // number
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'text-blue-600 dark:text-blue-400 font-semibold' // key
      } else {
        cls = 'text-green-600 dark:text-green-400' // string
      }
    } else if (/true|false/.test(match)) {
      cls = 'text-orange-600 dark:text-orange-400 font-bold' // boolean
    } else if (/null/.test(match)) {
      cls = 'text-red-500 dark:text-red-400 font-bold italic' // null
    }
    return '<span class="' + cls + '">' + match + '</span>'
  })
}

// Reset Logic
function handleReset() {
  confirmModal.value = {
    show: true,
    title: 'Reset to Default?',
    message: 'Reset addon to original defaults? All unsaved changes will be lost.',
    confirmText: 'Reset',
    type: 'danger',
    action: executeReset
  }
}

async function executeReset() {
  confirmModal.value.show = false
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
    hasUnsavedChanges.value = true 
    
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
    <div class="px-4 md:px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
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
    <div class="space-y-6 px-4 md:px-6 pt-4 pb-6">
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

        <div class="pt-4">
           <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 block">Optimization</label>
           <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
             <!-- Search Toggle -->
             <button 
               @click="toggleOptimization('search')"
               class="flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center gap-2"
               :class="hasCapability('search') ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300' : 'bg-zinc-50 border-zinc-200 text-zinc-400 dark:bg-zinc-800/50 dark:border-zinc-700'"
             >
                <Search class="w-6 h-6" />
                <span class="text-xs font-bold">Search</span>
                <span class="text-[10px] opacity-70">{{ hasCapability('search') ? 'Enabled' : 'Removed' }}</span>
             </button>

             <!-- Catalogs Toggle -->
             <button 
               @click="toggleOptimization('catalogs')"
               class="flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center gap-2"
               :class="hasCapability('catalogs') ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300' : 'bg-zinc-50 border-zinc-200 text-zinc-400 dark:bg-zinc-800/50 dark:border-zinc-700'"
             >
                <Grid class="w-6 h-6" />
                <span class="text-xs font-bold">Catalogs</span>
                <span class="text-[10px] opacity-70">{{ hasCapability('catalogs') ? 'Enabled' : 'Removed' }}</span>
             </button>

             <!-- Metadata Toggle -->
             <button 
               @click="toggleOptimization('meta')"
               class="flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center gap-2"
               :class="hasCapability('meta') ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300' : 'bg-zinc-50 border-zinc-200 text-zinc-400 dark:bg-zinc-800/50 dark:border-zinc-700'"
             >
                <FileText class="w-6 h-6" />
                <span class="text-xs font-bold">Metadata</span>
                <span class="text-[10px] opacity-70">{{ hasCapability('meta') ? 'Enabled' : 'Removed' }}</span>
             </button>
           </div>
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
              <div class="group bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 flex items-center gap-2 md:gap-3 transition-all hover:border-blue-400 dark:hover:border-blue-600">
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
                <span class="px-1.5 md:px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] md:text-xs font-mono text-zinc-500 font-medium w-auto text-center shrink-0">
                  {{ element.type }}
                </span>

                <!-- Name Input -->
                <input 
                  v-model="element.name" 
                  class="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-medium placeholder-zinc-400 text-zinc-900 dark:text-zinc-100 focus:ring-0"
                  placeholder="Catalog Name"
                />

                <!-- Delete -->
                <button 
                  v-if="!hasSystemExtra(element) && !hasSearchExtra(element)"
                  @click="deleteCatalog(index)"
                  class="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                  title="Delete Catalog"
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
      <div v-else class="flex-1 flex relative font-mono text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden group focus-within:ring-2 focus-within:ring-blue-500 min-h-[500px]">
         
         <!-- Line Numbers -->
         <div class="bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 text-right select-none px-2 py-4 border-r border-zinc-200 dark:border-zinc-700 min-w-[3rem]" aria-hidden="true">
            <div v-for="n in lineCount" :key="n">{{ n }}</div>
         </div>

         <!-- Editor Area Container - Need scroll container here -->
         <div class="relative flex-1 overflow-auto no-scrollbar">
             <!-- Formatting Wrapper -->
             <div class="relative min-w-full inline-block min-h-full">
                 <!-- Highlights Overlay -->
                 <pre 
                  aria-hidden="true" 
                  class="absolute inset-0 p-4 pointer-events-none whitespace-pre text-transparent z-0"
                  style="font-family: inherit;"
                  v-html="highlightJson(jsonModel)"
                 ></pre>
                 
                 <!-- Textarea -->
                 <textarea 
                  v-model="jsonModel"
                  class="w-full h-full absolute inset-0 bg-transparent text-transparent caret-zinc-900 dark:caret-white p-4 outline-none resize-none z-10 whitespace-pre overflow-hidden"
                  style="font-family: inherit;"
                  spellcheck="false"
                  @input="handleInput"
                ></textarea>
             </div>
         </div>

         <!-- Copy Button -->
         <button 
           @click="copy(jsonModel)" 
           class="absolute top-4 right-4 z-20 p-2 rounded-lg bg-white/10 backdrop-blur-sm hover:bg-white/20 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors border border-zinc-200/50 dark:border-zinc-700/50"
           title="Copy JSON"
         >
           <Check v-if="copied" class="w-4 h-4 text-emerald-500" />
           <Copy v-else class="w-4 h-4" />
         </button>
      </div>
    </div>

    <!-- Footer Actions (Station) -->
    <div class="sticky bottom-0 px-4 md:px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col-reverse md:flex-row justify-between items-center gap-4 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
      
      <button 
        @click="handleReset"
        class="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-500 hover:text-red-600 transition-colors border border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg"
        :disabled="isResetting"
      >
        <RotateCcw class="w-4 h-4" :class="{ 'animate-spin': isResetting }" />
        {{ isResetting ? 'Resetting...' : 'Reset to Default' }}
      </button>

      <div class="flex gap-3 w-full md:w-auto">
        <button 
          @click="$emit('cancel')"
          class="flex-1 md:flex-none px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg"
        >
          Cancel
        </button>
        <button 
          @click="handleSubmit"
          :disabled="!hasUnsavedChanges"
          class="flex-1 md:flex-none btn-primary justify-center"
          :class="{ 'opacity-50 cursor-not-allowed': !hasUnsavedChanges }"
        >
          <Save class="w-4 h-4" />
          Save Changes
        </button>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <ConfirmationModal 
      :show="confirmModal.show"
      :title="confirmModal.title"
      :message="confirmModal.message"
      :confirm-text="confirmModal.confirmText"
      :type="confirmModal.type"
      @close="confirmModal.show = false"
      @confirm="confirmModal.action && confirmModal.action()"
    />
  </div>
</template>

<style scoped>
textarea {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace; /* Nicer coding font if available */
}

/* Custom Scrollbar for this component */
/* Only show custom scrollbars on devices with fine pointers (mouse) */
@media (pointer: fine) {
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: transparent; 
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-zinc-200 dark:bg-zinc-700 rounded-full;
  }
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-zinc-300 dark:bg-zinc-600;
  }
}

/* Hide scrollbars on touch devices or when explicitly requested */
@media (pointer: coarse) {
  ::-webkit-scrollbar {
    display: none;
  }
  * {
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
