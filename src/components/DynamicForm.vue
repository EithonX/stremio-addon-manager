<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import Draggable from 'vuedraggable'
import { Move, Trash2, Home, Compass, Edit3, Code, RotateCcw, Save, Search, Grid, FileText, ChevronUp, ChevronDown, X, Layers } from 'lucide-vue-next'
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
import { fetchAddonManifest } from '../features/api/stremioApi'

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
    const data = await fetchAddonManifest(props.manifestURL)
    
    // Verify it's a valid manifest
    if (!data.id || !data.version) throw new Error('Invalid manifest response')

    sanitizeBaseManifest.value = deepClone(data)
    const clone = normalizeEditableManifest(data)
    ensureCatalogDragKeys(clone.catalogs)
    formModel.value = clone
    syncJsonModel()
    
    // Update initialManifest so "Save" button becomes disabled if it matches original
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
    <div class="sticky top-0 z-30 flex items-center justify-between gap-3 rounded-t-2xl border-b border-zinc-200/80 dark:border-white/5 bg-white/90 dark:bg-zinc-900/85 backdrop-blur-md px-4 md:px-6 py-3.5">
      <div class="min-w-0">
        <h3 class="truncate text-base md:text-lg font-semibold leading-tight text-zinc-900 dark:text-white">
          {{ formModel.name || 'Untitled Addon' }}
        </h3>
        <p class="text-xs text-zinc-500 dark:text-zinc-500">Edit manifest</p>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Segmented Form / JSON toggle -->
        <div class="flex items-center rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 dark:border-white/10 dark:bg-zinc-950/50">
          <button
            @click="isAdvancedMode && toggleEditMode()"
            class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
            :class="!isAdvancedMode ? 'bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-300' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'"
          >
            <Edit3 class="h-3.5 w-3.5" />
            Form
          </button>
          <button
            @click="!isAdvancedMode && toggleEditMode()"
            class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
            :class="isAdvancedMode ? 'bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-300' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'"
          >
            <Code class="h-3.5 w-3.5" />
            JSON
          </button>
        </div>

        <button
          @click="$emit('cancel')"
          class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title="Close"
          aria-label="Close editor"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- Scrollable Content -->
    <!-- Removed overflow-y-auto from here, relying on inner container if needed or letting parent handle it? -->
    <!-- The user complained about "inner scroll" being ugly. 
         Ideally, the modal body (parent) scrolls, and this form just expands. 
         But we set h-[80vh] on line 189. 
         Let's remove fixed height and let it flow. -->
    <div class="space-y-5 px-4 md:px-6 pt-5 pb-6">
      <template v-if="!isAdvancedMode">
        <!-- Details -->
        <section class="rounded-2xl border border-zinc-200 bg-white/70 p-4 md:p-5 backdrop-blur-sm dark:border-white/5 dark:bg-zinc-900/40">
          <h4 class="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Details</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Name</label>
              <input v-model="formModel.name" class="input-field" placeholder="Addon Name" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Description</label>
              <input v-model="formModel.description" class="input-field" placeholder="Description" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Logo URL</label>
              <input v-model="formModel.logo" class="input-field" placeholder="https://..." />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Background URL</label>
              <input v-model="formModel.background" class="input-field" placeholder="https://..." />
            </div>
          </div>
        </section>

        <!-- Capabilities & Optimization -->
        <section class="rounded-2xl border border-zinc-200 bg-white/70 p-4 md:p-5 backdrop-blur-sm dark:border-white/5 dark:bg-zinc-900/40">
          <div class="mb-2.5">
            <h4 class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Capabilities</h4>
          </div>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <!-- Search Toggle -->
            <div
              class="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors"
              :class="hasCapability('search') ? 'border-blue-500/30 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/5' : 'border-zinc-200 bg-zinc-50/50 dark:border-white/5 dark:bg-zinc-950/30'"
            >
              <div
                class="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors"
                :class="hasCapability('search') ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800/60 dark:text-zinc-500'"
              >
                <Search class="h-3.5 w-3.5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium leading-tight text-zinc-900 dark:text-zinc-100">Search Support</p>
                <p class="truncate text-[11px] text-zinc-500 dark:text-zinc-500">{{ hasCapability('search') ? 'Included' : 'Optimized out' }}</p>
              </div>
              <button
                @click="toggleOptimization('search')"
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                :class="hasCapability('search') ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'"
                role="switch"
                :aria-checked="hasCapability('search')"
              >
                <div
                  class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                  :class="hasCapability('search') ? 'translate-x-4' : 'translate-x-0'"
                ></div>
              </button>
            </div>

            <!-- Catalogs Toggle -->
            <div
              class="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors"
              :class="hasCapability('catalogs') ? 'border-emerald-500/30 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5' : 'border-zinc-200 bg-zinc-50/50 dark:border-white/5 dark:bg-zinc-950/30'"
            >
              <div
                class="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors"
                :class="hasCapability('catalogs') ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800/60 dark:text-zinc-500'"
              >
                <Grid class="h-3.5 w-3.5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium leading-tight text-zinc-900 dark:text-zinc-100">Home Catalogs</p>
                <p class="truncate text-[11px] text-zinc-500 dark:text-zinc-500">{{ hasCapability('catalogs') ? 'Visible on Home' : 'Search only' }}</p>
              </div>
              <button
                @click="toggleOptimization('catalogs')"
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                :class="hasCapability('catalogs') ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'"
                role="switch"
                :aria-checked="hasCapability('catalogs')"
              >
                <div
                  class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                  :class="hasCapability('catalogs') ? 'translate-x-4' : 'translate-x-0'"
                ></div>
              </button>
            </div>

            <!-- Metadata Toggle -->
            <div
              class="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors"
              :class="hasCapability('meta') ? 'border-purple-500/30 bg-purple-50/40 dark:border-purple-500/30 dark:bg-purple-500/5' : 'border-zinc-200 bg-zinc-50/50 dark:border-white/5 dark:bg-zinc-950/30'"
            >
              <div
                class="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors"
                :class="hasCapability('meta') ? 'bg-purple-500/10 text-purple-500 dark:text-purple-400' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800/60 dark:text-zinc-500'"
              >
                <FileText class="h-3.5 w-3.5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium leading-tight text-zinc-900 dark:text-zinc-100">Metadata</p>
                <p class="truncate text-[11px] text-zinc-500 dark:text-zinc-500">{{ hasCapability('meta') ? 'Detailed info' : 'Basic info' }}</p>
              </div>
              <button
                @click="toggleOptimization('meta')"
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                :class="hasCapability('meta') ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'"
                role="switch"
                :aria-checked="hasCapability('meta')"
              >
                <div
                  class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                  :class="hasCapability('meta') ? 'translate-x-4' : 'translate-x-0'"
                ></div>
              </button>
            </div>
          </div>
        </section>

        <!-- Catalogs Editor -->
        <section class="space-y-3">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-2">
              <h4 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Catalogs</h4>
              <span class="rounded-full border border-zinc-200 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-zinc-500 dark:border-white/10 dark:bg-zinc-800/80 dark:text-zinc-400">
                {{ formModel.catalogs.length }}
              </span>
            </div>
            <span class="text-xs text-zinc-400 dark:text-zinc-500">Drag to reorder</span>
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
              <div class="reorder-card group flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white/85 px-2 py-1.5 shadow-sm shadow-zinc-200/50 backdrop-blur-sm transition-all hover:border-blue-300 dark:border-white/5 dark:bg-zinc-900/60 dark:shadow-black/20 dark:hover:border-blue-500/40 sm:gap-2 sm:px-2.5">
                <!-- Drag Handle -->
                <div class="drag-handle shrink-0 touch-none cursor-grab rounded-lg p-1 text-zinc-300 transition-colors hover:bg-blue-50 hover:text-blue-500 active:cursor-grabbing dark:text-zinc-700 dark:hover:bg-blue-500/10 dark:hover:text-blue-300" role="button" aria-label="Drag catalog to reorder">
                  <Move class="h-4 w-4" />
                </div>

                <!-- Visibility Toggle -->
                <button
                  v-if="!hasSystemExtra(element)"
                  @click="toggleCatalogVisibility(element)"
                  class="shrink-0 rounded-lg p-1.5 transition-colors"
                  :class="isCatalogVisible(element) ? 'bg-blue-500/10 text-blue-500 ring-1 ring-inset ring-blue-500/20 dark:text-blue-300' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'"
                  :title="isCatalogVisible(element) ? 'Visible' : 'Hidden'"
                >
                  <component :is="hasSearchExtra(element) ? Compass : Home" class="h-4 w-4" />
                </button>
                <div v-else class="h-7 w-7 shrink-0">
                  <!-- Placeholder spacing -->
                </div>

                <!-- Name Input -->
                <input
                  v-model="element.name"
                  class="min-w-0 flex-1 truncate rounded-md border-none bg-transparent px-1.5 py-1 text-sm font-medium text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:bg-zinc-100 focus:ring-0 dark:text-zinc-100 dark:focus:bg-zinc-800/60"
                  placeholder="Catalog Name"
                />

                <!-- Type Chip -->
                <span class="shrink-0 rounded-md bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[10px] font-medium lowercase leading-none text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400">
                  {{ element.type }}
                </span>

                <!-- Delete (separate) -->
                <button
                  v-if="!hasSystemExtra(element) && !hasSearchExtra(element)"
                  @click="deleteCatalog(index)"
                  class="ml-1 shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  title="Delete Catalog"
                >
                  <Trash2 class="h-4 w-4" />
                </button>

                <!-- Move up/down group -->
                <div class="flex shrink-0 flex-col rounded-md border border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-zinc-950/30">
                  <button
                    type="button"
                    @click="moveCatalog(index, -1)"
                    :disabled="index === 0"
                    class="rounded-t-md px-1 py-0.5 text-zinc-400 transition-colors hover:text-blue-600 disabled:opacity-25 disabled:hover:text-zinc-400 dark:hover:text-blue-300"
                    title="Move catalog up"
                  >
                    <ChevronUp class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    @click="moveCatalog(index, 1)"
                    :disabled="index === formModel.catalogs.length - 1"
                    class="rounded-b-md px-1 py-0.5 text-zinc-400 transition-colors hover:text-blue-600 disabled:opacity-25 disabled:hover:text-zinc-400 dark:hover:text-blue-300"
                    title="Move catalog down"
                  >
                    <ChevronDown class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </template>
          </Draggable>
          
          <div v-if="formModel.catalogs.length === 0" class="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-7 text-center dark:border-white/10 dark:bg-zinc-900/30">
            <Layers class="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
            <p class="text-xs text-zinc-500 dark:text-zinc-400">No catalogs found in this addon.</p>
          </div>
        </section>
      </template>

      <!-- Advanced JSON Editor -->
      <ManifestJsonEditor v-else v-model="jsonModel" />
    </div>

    <!-- Footer Actions (Station) -->
    <div class="sticky bottom-0 z-20 flex flex-col-reverse items-center justify-between gap-3 rounded-b-2xl border-t border-zinc-200/80 bg-white/90 px-4 py-3.5 backdrop-blur-md dark:border-white/5 dark:bg-zinc-900/85 md:flex-row md:px-6">

      <button
        @click="handleReset"
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 md:w-auto"
        :disabled="isResetting"
      >
        <RotateCcw class="h-4 w-4" :class="{ 'animate-spin': isResetting }" />
        {{ isResetting ? 'Resetting...' : 'Reset to Default' }}
      </button>

      <div class="flex w-full gap-2.5 md:w-auto">
        <button
          @click="$emit('cancel')"
          class="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800 md:flex-none"
        >
          Cancel
        </button>
        <button
          @click="handleSubmit"
          :disabled="!hasUnsavedChanges"
          class="flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all active:scale-95 md:flex-none"
          :class="hasUnsavedChanges
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700'
            : 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-white/5 dark:bg-zinc-800/50 dark:text-zinc-600'"
        >
          <Save class="h-4 w-4" />
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
