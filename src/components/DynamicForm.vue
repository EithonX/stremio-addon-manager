<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import Draggable from 'vuedraggable'
import { Move, Trash2, Home, Compass, Edit3, Code, RotateCcw, Save, Search, Grid, FileText, ChevronUp, ChevronDown } from 'lucide-vue-next'
import AddonFeatures from './AddonFeatures.vue'
import ConfirmationModal from './ui/ConfirmationModal.vue'
import { createEdgeDragScroll } from '../utils/edgeDragScroll'
import ManifestJsonEditor from './editor/ManifestJsonEditor.vue'
import {
  deepClone,
  findCatalogBackup,
  findManifestResource,
  getCatalogBackupKey,
  hasManifestResource,
  removeManifestResource,
  restoreCatalogExtraBackups,
} from '../features/addons/addonCollection'

const props = defineProps({
  manifest: { type: Object, required: true },
  manifestURL: { type: String, default: '' },
  highlightCatalog: { type: [String, Object], default: null },
  flags: { type: Object, default: () => ({}) },
  scrollContainer: { type: Object, default: null },
})

const emit = defineEmits(['update-manifest', 'cancel'])

const isAdvancedMode = ref(false)
const formModel = ref({
  name: '', description: '', logo: '', background: '', catalogs: [], resources: []
})
const jsonModel = ref('')
const initialManifest = ref(null)
const sanitizeBaseManifest = ref(null)
const isResetting = ref(false)
const hasUnsavedChanges = ref(false)
const isCatalogDragging = ref(false)

const DEFAULT_MANIFEST = {
  name: '',
  description: '',
  logo: '',
  background: '',
  catalogs: [],
  resources: [],
}

const OPTIONAL_DEFAULT_FIELDS = {
  logo: '',
  background: '',
  catalogs: [],
  resources: [],
}

function resolveScrollContainer() {
  const container = props.scrollContainer

  if (container?.value instanceof HTMLElement) {
    return container.value
  }

  if (container instanceof HTMLElement) {
    return container
  }

  return null
}

const catalogEdgeDragScroll = createEdgeDragScroll(resolveScrollContainer)

// Cleanup/Optimization State to allow restoring within session
const removedCapabilities = ref({
  search: [],
  catalogs: [],
  meta: null
})

// Confirmation State
const confirmModal = ref({
  show: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  type: 'danger',
  action: null
})

const dragTouchDelay = 180
const dragTouchThreshold = 8
const dragFallbackTolerance = 10
const useFallbackDrag = useMediaQuery('(pointer: coarse)')

function normalizeEditableManifest(manifest) {
  const clone = manifest && typeof manifest === 'object' && !Array.isArray(manifest) ? deepClone(manifest) : {}

  return {
    ...DEFAULT_MANIFEST,
    ...clone,
    catalogs: Array.isArray(clone.catalogs) ? clone.catalogs.filter(isEditableCatalog) : [],
    resources: Array.isArray(clone.resources) ? clone.resources : [],
  }
}

function isEditableCatalog(catalog) {
  return catalog !== null && typeof catalog === 'object' && !Array.isArray(catalog)
}

function hasOwnField(source, field) {
  return source !== null && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, field)
}

function isDefaultEmptyField(value, defaultValue) {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(value) && value.length === 0
  }

  return value === defaultValue
}

function pruneUnchangedDefaultFields(manifest, baseManifest = sanitizeBaseManifest.value) {
  Object.entries(OPTIONAL_DEFAULT_FIELDS).forEach(([field, defaultValue]) => {
    if (!hasOwnField(baseManifest, field) && isDefaultEmptyField(manifest[field], defaultValue)) {
      delete manifest[field]
    }
  })

  return manifest
}

function createCatalogBackup(catalog, index, extra) {
  return {
    backupKey: getCatalogBackupKey(catalog, index),
    originalIndex: index,
    id: catalog?.id,
    type: catalog?.type,
    extra: deepClone(extra),
  }
}

function getCatalogs() {
  if (!Array.isArray(formModel.value.catalogs)) {
    formModel.value.catalogs = []
  }

  return formModel.value.catalogs
}

function getResources() {
  if (!Array.isArray(formModel.value.resources)) {
    formModel.value.resources = []
  }

  return formModel.value.resources
}

// Initialize
watch(() => props.manifest, (newManifest) => {
  sanitizeBaseManifest.value = newManifest && typeof newManifest === 'object' ? deepClone(newManifest) : {}
  const clone = normalizeEditableManifest(newManifest)
  ensureCatalogDragKeys(clone.catalogs)
  formModel.value = clone
  syncJsonModel()
  initialManifest.value = deepClone(clone)
  hasUnsavedChanges.value = false
  
  // Reset removed state on new manifest load
  removedCapabilities.value = { search: [], catalogs: [], meta: null }
}, { immediate: true })

// Deep watch for changes
watch(formModel, checkForChanges, { deep: true })
watch(jsonModel, () => { if (isAdvancedMode.value) checkForChanges() })

function checkForChanges() {
  if (!initialManifest.value) return
  
  let currentState, initialState
  try {
    if (isAdvancedMode.value) {
      currentState = JSON.stringify(toSanitizedManifest(JSON.parse(jsonModel.value)))
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
  const clone = normalizeEditableManifest(model)
  if (Array.isArray(clone.catalogs)) {
    clone.catalogs.forEach(c => delete c.__dragKey)
  }
  return pruneUnchangedDefaultFields(clone)
}

function syncJsonModel() {
  jsonModel.value = JSON.stringify(toSanitizedManifest(formModel.value), null, 2)
}

function ensureCatalogDragKeys(catalogs) {
  if (!Array.isArray(catalogs)) return
  const stamp = Date.now()
  catalogs.forEach((c, idx) => {
    if (!c || typeof c !== 'object') return
    if (!c.__dragKey) c.__dragKey = `${c.type}-${stamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`
  })
}

function toggleEditMode() {
  if (isAdvancedMode.value) {
    // Switch to Form
    try {
      const parsed = JSON.parse(jsonModel.value)
      const normalized = normalizeEditableManifest(parsed)
      ensureCatalogDragKeys(normalized.catalogs)
      formModel.value = normalized
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
  return extra?.name === 'search'
}

function hasSearchExtra(catalog) {
  return Array.isArray(catalog?.extra) && catalog.extra.some(isSearchExtra)
}

function isDedicatedSearch(catalog) {
  // Considered dedicated if it HAS search extra AND (it's the only extra OR name implies search)
  // Also if search is required, it's likely dedicated/search-only behavior
  if (!hasSearchExtra(catalog)) return false
  const extras = Array.isArray(catalog?.extra) ? catalog.extra : []
  const search = extras.find(isSearchExtra)
  if (search?.isRequired) return true
  if (extras.length === 1) return true
  if (String(catalog?.name ?? '').toLowerCase().includes('search')) return true
  return false
}

function isHybridSearch(catalog) {
  return hasSearchExtra(catalog) && !isDedicatedSearch(catalog)
}

function hasCapability(type) {
  if (type === 'search') {
    // Has capability if any catalog provides search (Dedicated or Hybrid)
    return getCatalogs().some(hasSearchExtra)
  }
  if (type === 'catalogs') {
    // Has capability if any catalog provides content (Hybrid or Content-Only)
    // Content-Only = No Search Extra OR Hybrid (has search but also content)
    // Basically: Any catalog that is NOT Dedicated Search (which is invisible anyway usually)
    // Or more strictly: Any catalog that has non-search extras OR no extras?
    // Let's simpler: If it's NOT dedicated search, it's a content catalog.
    return getCatalogs().some(c => !isDedicatedSearch(c))
  }
  if (type === 'meta') {
    return hasManifestResource(formModel.value, 'meta')
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
      
      formModel.value.catalogs = getCatalogs().filter((c, index) => {
        if (isDedicatedSearch(c)) {
          dedicated.push(deepClone(c))
          return false // Remove
        }
        if (isHybridSearch(c)) {
          // Strip search extra
          const searchExtra = c.extra.find(isSearchExtra)
          hybridBackups.push(createCatalogBackup(c, index, searchExtra))
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
        formModel.value.catalogs.push(...deepClone(dedicated))
      }
      
      if (hybridBackups && hybridBackups.length) {
        getCatalogs().forEach((c, index) => {
          // Find matching backup
          const backup = findCatalogBackup(c, index, hybridBackups)
          if (backup && !hasSearchExtra(c)) {
            if (!c.extra) c.extra = []
            c.extra.push(deepClone(backup.extra))
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
      
      formModel.value.catalogs = getCatalogs().filter((c, index) => {
        if (isDedicatedSearch(c)) return true // Keep dedicated search
        
        if (hasSearchExtra(c)) {
          // Hybrid: Become Search-Only
          // Backup original extras
          hybridBackups.push(createCatalogBackup(c, index, c.extra))
          
          // Keep ONLY search extra
          const searchExtra = deepClone(c.extra.find(isSearchExtra))
          // Force isRequired = true to likely hide from Home
          searchExtra.isRequired = true 
          c.extra = [searchExtra]
          return true
        } else {
          // Content-Only: Delete
          contentOnly.push(deepClone(c))
          return false
        }
      })
      
      removedCapabilities.value.catalogs = { contentOnly, hybridBackups }
    } else {
      // Enable Home Catalogs:
      const { contentOnly, hybridBackups } = removedCapabilities.value.catalogs
      
      if (contentOnly && contentOnly.length) {
        formModel.value.catalogs.push(...deepClone(contentOnly))
      }
      
      if (hybridBackups && hybridBackups.length) {
        restoreCatalogExtraBackups(getCatalogs(), hybridBackups)
      }
      removedCapabilities.value.catalogs = []
    }
  }
  
  if (type === 'meta') {
    if (enabled) {
      // Disable: remove 'meta'
      removedCapabilities.value.meta = deepClone(findManifestResource(formModel.value, 'meta') ?? 'meta')
      formModel.value.resources = removeManifestResource(formModel.value, 'meta').resources
    } else {
      // Enable: add 'meta' (if it was removed or just add it)
      if (!hasManifestResource(formModel.value, 'meta')) {
        getResources().push(deepClone(removedCapabilities.value.meta ?? 'meta'))
      }
      removedCapabilities.value.meta = null
    }
  }
  
  syncJsonModel()
}

// Catalog Helpers
function hasSystemExtra(catalog) {
  if (!Array.isArray(catalog?.extra)) return false
  return catalog.extra.some(e => ['lastVideosIds', 'calendarVideosIds'].includes(e?.name))
}



function isCatalogVisible(catalog) {
  if (hasSearchExtra(catalog)) {
    const search = catalog.extra.find(e => e?.name === 'search')
    return search && !search.isRequired
  }
  if (catalog?.extra?.some(e => e?.name === 'genre')) {
    const genre = catalog.extra.find(e => e?.name === 'genre')
    return genre && !genre.isRequired
  }
  return !catalog?.extra?.length // Visible by default if no extras
}

function toggleCatalogVisibility(catalog) {
  const isVisible = isCatalogVisible(catalog)
  if (!Array.isArray(catalog.extra)) catalog.extra = []
  
  // Search Extra Logic
  const searchExtra = catalog.extra.find(e => e?.name === 'search')
  if (searchExtra) {
    if (isVisible) searchExtra.isRequired = true // Hide
    else delete searchExtra.isRequired // Show
  }
  
  // Genre Extra Logic
  const genreExtra = catalog.extra.find(e => e?.name === 'genre')
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

function moveCatalog(index, direction) {
  const catalogs = getCatalogs()
  const nextIndex = index + direction
  if (!Array.isArray(catalogs) || nextIndex < 0 || nextIndex >= catalogs.length) return

  const [catalog] = catalogs.splice(index, 1)
  catalogs.splice(nextIndex, 0, catalog)
  syncJsonModel()
}

function handleCatalogDragEnd() {
  isCatalogDragging.value = false
  catalogEdgeDragScroll.stop()
  syncJsonModel()
}

function handleCatalogDragStart() {
  isCatalogDragging.value = true
  catalogEdgeDragScroll.start()
}

onUnmounted(() => {
  catalogEdgeDragScroll.stop()
})

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

    sanitizeBaseManifest.value = deepClone(data)
    const clone = normalizeEditableManifest(data)
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
           <div class="flex flex-col gap-3">
             <!-- Search Toggle -->
             <div class="flex items-center justify-between p-3 rounded-xl border bg-white dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-3">
                   <div class="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                      <Search class="w-4 h-4" />
                   </div>
                   <div class="flex flex-col">
                      <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Search Support</span>
                      <span class="text-xs text-zinc-500">{{ hasCapability('search') ? 'Included in manifest' : 'Optimized out' }}</span>
                   </div>
                </div>
                <!-- Switch -->
                <button 
                  @click="toggleOptimization('search')"
                  class="w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  :class="hasCapability('search') ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'"
                >
                  <div 
                    class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm"
                    :class="hasCapability('search') ? 'translate-x-5' : 'translate-x-0'"
                  ></div>
                </button>
             </div>

             <!-- Catalogs Toggle -->
             <div class="flex items-center justify-between p-3 rounded-xl border bg-white dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-3">
                   <div class="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <Grid class="w-4 h-4" />
                   </div>
                   <div class="flex flex-col">
                      <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Home Catalogs</span>
                      <span class="text-xs text-zinc-500">{{ hasCapability('catalogs') ? 'Visible on Home' : 'Search only' }}</span>
                   </div>
                </div>
                <button 
                  @click="toggleOptimization('catalogs')"
                  class="w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  :class="hasCapability('catalogs') ? 'bg-emerald-600' : 'bg-zinc-200 dark:bg-zinc-700'"
                >
                  <div 
                    class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm"
                    :class="hasCapability('catalogs') ? 'translate-x-5' : 'translate-x-0'"
                  ></div>
                </button>
             </div>

             <!-- Metadata Toggle -->
             <div class="flex items-center justify-between p-3 rounded-xl border bg-white dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-3">
                   <div class="p-2 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                      <FileText class="w-4 h-4" />
                   </div>
                   <div class="flex flex-col">
                      <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Metadata</span>
                      <span class="text-xs text-zinc-500">{{ hasCapability('meta') ? 'Detailed info' : 'Basic info' }}</span>
                   </div>
                </div>
                <button 
                  @click="toggleOptimization('meta')"
                  class="w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  :class="hasCapability('meta') ? 'bg-purple-600' : 'bg-zinc-200 dark:bg-zinc-700'"
                >
                  <div 
                    class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm"
                    :class="hasCapability('meta') ? 'translate-x-5' : 'translate-x-0'"
                  ></div>
                </button>
             </div>
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
            filter="button,a,input,textarea,select,label,[data-no-drag]"
            :prevent-on-filter="false"
            ghost-class="sortable-ghost"
            chosen-class="sortable-chosen"
            drag-class="sortable-drag"
            fallback-class="sortable-fallback"
            class="catalog-reorder-list flex flex-col gap-3"
            :animation="220"
            easing="cubic-bezier(0.22, 1, 0.36, 1)"
            :swap-threshold="0.68"
            :scroll-sensitivity="80"
            :scroll-speed="14"
            :force-fallback="useFallbackDrag"
            :fallback-on-body="useFallbackDrag"
            :delay="dragTouchDelay"
            :delay-on-touch-only="true"
            :touch-start-threshold="dragTouchThreshold"
            :fallback-tolerance="dragFallbackTolerance"
            :class="{ 'is-dragging': isCatalogDragging }"
            @start="handleCatalogDragStart"
            @change="syncJsonModel"
            @end="handleCatalogDragEnd"
            @unchoose="catalogEdgeDragScroll.stop(); isCatalogDragging = false"
          >
            <template #item="{ element, index }">
              <div class="reorder-card group bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 flex items-center gap-2 md:gap-3 transition-all hover:border-blue-400 dark:hover:border-blue-600">
                <!-- Drag Handle -->
                <div class="drag-handle touch-none p-2 cursor-grab active:cursor-grabbing rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" role="button" aria-label="Drag catalog to reorder">
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

                <div class="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    @click="moveCatalog(index, -1)"
                    :disabled="index === 0"
                    class="p-1 rounded-md text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors"
                    title="Move catalog up"
                  >
                    <ChevronUp class="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    @click="moveCatalog(index, 1)"
                    :disabled="index === formModel.catalogs.length - 1"
                    class="p-1 rounded-md text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors"
                    title="Move catalog down"
                  >
                    <ChevronDown class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </template>
          </Draggable>
          
          <div v-if="formModel.catalogs.length === 0" class="text-center py-8 text-zinc-500 italic bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700">
            No catalogs found in this addon.
          </div>
        </div>
      </template>

      <!-- Advanced JSON Editor -->
      <ManifestJsonEditor v-else v-model="jsonModel" />
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
    background-color: rgb(228 228 231);
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background-color: rgb(212 212 216);
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
