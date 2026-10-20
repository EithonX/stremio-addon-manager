<script setup>
import { ref, computed, onUnmounted, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import Draggable from 'vuedraggable'
import { RefreshCw, Upload, Download, Plus, Search, Lock, Unlock, PackageOpen, X, Link2, CircleAlert, LoaderCircle } from '@lucide/vue'
import AddonItem from './AddonItem.vue'
import DynamicForm from './DynamicForm.vue'
import Modal from './ui/Modal.vue'
import ConfirmationModal from './ui/ConfirmationModal.vue'
import { createEdgeDragScroll } from '../utils/edgeDragScroll'
import { validateAddonCollection } from '../features/addons/manifestSchema.js'
import { protectSystemAddons } from '../features/addons/collectionSync.js'
import { createManifestDraft } from '../features/addons/manifestDraft.js'
import {
  normalizeAddonCollection,
  normalizeAddonRecord,
  normalizeManifestUrl,
  parseAddonBackup,
} from '../features/addons/addonCollection'
import { fetchAddonManifest } from '../features/api/stremioApi'

const props = defineProps({
  addons: {
    type: Array,
    required: true
  },
  editorStates: { type: Object, default: () => ({}) },
  recovery: { type: Object, default: null },
  conflict: { type: Object, default: null },
  uncertainWrite: { type: Boolean, default: false },
  isLoading: {
    type: Boolean,
    default: false
  },
  hasUnsyncedChanges: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:addons', 'update:editor-states', 'editor-dirty', 'sync', 'reload', 'remove', 'merge'])

// Local State
const searchQuery = ref('')
const isEditModalOpen = ref(false)
const isAddModalOpen = ref(false)
const newAddonUrl = ref('')
const isAddingAddon = ref(false)
const addAddonError = ref('')
const backupRestoreError = ref('')
const isLocked = ref(false)
const isDragging = ref(false)
const localAddons = ref([])

const currentEditTransport = ref('')
const currentEditDraft = ref(null)
const currentEditManifest = ref(null)
const currentEditURL = ref('')
const isEditDirty = ref(false)
const edgeDragScroll = createEdgeDragScroll(() => window)

// Confirmation State
const confirmModal = ref({
  show: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  type: 'info',
  action: null
})

// Computed
const isSearching = computed(() => searchQuery.value.trim().length > 0)
const canDrag = computed(() => !isSearching.value && !isLocked.value && !props.isLoading)
const isSyncDisabled = computed(() => props.isLoading || !props.hasUnsyncedChanges && !props.uncertainWrite)

const displayedAddons = computed(() => {
  if (!isSearching.value) return localAddons.value
  const q = searchQuery.value.toLowerCase()
  return localAddons.value.filter(addon => 
    addon.manifest.name.toLowerCase().includes(q) || 
    addon.manifest.description.toLowerCase().includes(q) ||
    addon.transportUrl.toLowerCase().includes(q)
  )
})

const totalAddonCount = computed(() => localAddons.value.length)
const shownAddonCount = computed(() => displayedAddons.value.length)
const dashboardSubtitle = computed(() => {
  if (isSearching.value) {
    return `${shownAddonCount.value} of ${totalAddonCount.value} shown`
  }
  return `${totalAddonCount.value} loaded`
})
const hasSearchNoResults = computed(() => isSearching.value && totalAddonCount.value > 0 && shownAddonCount.value === 0)

const dragTouchDelay = 180
const dragTouchThreshold = 8
const dragFallbackTolerance = 10
const useFallbackDrag = useMediaQuery('(pointer: coarse)')
let nextAddonClientKey = 1

function ensureAddonClientKeys(addons) {
  if (!Array.isArray(addons)) return addons

  addons.forEach((addon) => {
    if (!addon || typeof addon !== 'object') return

    const descriptor = Object.getOwnPropertyDescriptor(addon, '__clientKey')
    if (descriptor && !descriptor.enumerable && typeof descriptor.value === 'string') return

    Object.defineProperty(addon, '__clientKey', {
      value: `addon-${Date.now()}-${nextAddonClientKey++}`,
      enumerable: false,
      configurable: true,
    })
  })

  return addons
}

watch(
  () => props.addons,
  (addons) => {
    localAddons.value = ensureAddonClientKeys(normalizeAddonCollection(addons))
  },
  { immediate: true },
)

// Actions
const handleEdit = (index) => {
  const addon = displayedAddons.value[index]
  const realIndex = localAddons.value.indexOf(addon)
  
  if (realIndex === -1) return

  currentEditTransport.value = addon.transportUrl
  currentEditDraft.value = props.editorStates[addon.transportUrl] || null
  currentEditManifest.value = JSON.parse(JSON.stringify(addon.manifest))
  currentEditURL.value = addon.transportUrl
  isEditDirty.value = false
  isEditModalOpen.value = true
}

const closeEditModal = () => {
  isEditDirty.value = false
  emit('editor-dirty', false)
  isEditModalOpen.value = false
}

// Backdrop / Escape close for the edit modal (DynamicForm handles its own X/Cancel)
const handleEditModalCloseRequest = () => {
  if (!isEditDirty.value) {
    closeEditModal()
    return
  }

  confirmModal.value = {
    show: true,
    title: 'Discard unsaved changes?',
    message: 'You have manifest edits that have not been saved. Closing the editor will discard them.',
    confirmText: 'Discard changes',
    type: 'danger',
    action: () => {
      closeEditModal()
      confirmModal.value.show = false
    }
  }
}

const handleRemove = (index) => {
  const addon = displayedAddons.value[index]
  const realIndex = localAddons.value.indexOf(addon)
  if (realIndex === -1) return

  const addonName = addon?.manifest?.name || 'this addon'
  confirmModal.value = {
    show: true,
    title: 'Remove addon?',
    message: `Remove ${addonName} from your local list? You still need to sync changes to save this to Stremio.`,
    confirmText: 'Remove',
    type: 'danger',
    action: () => {
      emit('remove', realIndex)
      confirmModal.value.show = false
    }
  }
}

const handleSaveManifest = (newManifest, draft) => {
  const index = localAddons.value.findIndex(addon => addon.transportUrl === currentEditTransport.value)
  if (index < 0) { closeEditModal(); return }
  const next = [...localAddons.value]
  next[index] = { ...next[index], manifest: newManifest }
  validateAddonCollection(next)
  emit('update:addons', next)
  emit('update:editor-states', { ...props.editorStates, [currentEditTransport.value]: draft })
  closeEditModal()
}
function handleMove(index, direction) {
  if (!canDrag.value) return
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= localAddons.value.length) return
  const next = [...localAddons.value]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  emit('update:addons', next)
}
function editorDirtyChanged(value) { isEditDirty.value = value; emit('editor-dirty', value) }

let addAddonRunId = 0
let addAbort = null
const configureRequiredUrl = ref('')

const openAddModal = () => {
    if (props.isLoading) return
    isAddModalOpen.value = true
    configureRequiredUrl.value = ''
    newAddonUrl.value = ''
    addAddonError.value = ''
    isAddingAddon.value = false
}

const closeAddModal = () => {
    addAddonRunId++
    addAbort?.abort()
    isAddingAddon.value = false
    isAddModalOpen.value = false
    newAddonUrl.value = ''
    addAddonError.value = ''
}

const installAddon = async () => {
    if (isAddingAddon.value) return

    const url = normalizeManifestUrl(newAddonUrl.value)
    if (!url) {
      addAddonError.value = 'Use a valid http(s) or stremio:// manifest URL.'
      return
    }

    const runId = ++addAddonRunId
    isAddingAddon.value = true
    addAddonError.value = ''

    try {
      addAbort = new AbortController()
      const manifest = await fetchAddonManifest(url, { signal: addAbort.signal })
      if (manifest.behaviorHints?.configurationRequired) {
        const configure = new URL(url)
        configure.pathname = configure.pathname.replace(/\/manifest\.json$/, '/configure')
        configureRequiredUrl.value = configure.href
        throw new Error('Configure this addon on its provider page, then paste the configured manifest URL.')
      }

      // Ignore results from a stale request or one whose modal was closed.
      if (runId !== addAddonRunId || !isAddModalOpen.value) return

      const nextAddon = normalizeAddonRecord({
        transportUrl: url,
        manifest,
        flags: {},
      })

      if (!nextAddon) {
        throw new Error('Manifest payload is missing required fields (id/version).')
      }

      const existingIndex = localAddons.value.findIndex(addon => addon.transportUrl === nextAddon.transportUrl)
      const apply = () => {
        const next = [...localAddons.value]
        const currentIndex = next.findIndex(addon => addon.transportUrl === nextAddon.transportUrl)
        if (currentIndex >= 0) next[currentIndex] = { ...next[currentIndex], manifest: nextAddon.manifest }
        else next.push(nextAddon)
        validateAddonCollection(next)
        emit('update:addons', next)
        const drafts = { ...props.editorStates }
        delete drafts[nextAddon.transportUrl]
        emit('update:editor-states', drafts)
        confirmModal.value.show = false
      }
      isAddModalOpen.value = false
      if (existingIndex >= 0) {
        confirmModal.value = { show: true, title: 'Update existing addon?', message: 'This URL is already installed. Replace its current manifest with the provider version? Local manifest customizations for this addon will be reset.', confirmText: 'Update addon', type: 'info', action: apply }
      } else apply()
      newAddonUrl.value = ''
      addAddonError.value = ''
    } catch (e) {
      if (runId !== addAddonRunId || !isAddModalOpen.value) return
      addAddonError.value = e?.message
        ? `Couldn't fetch that manifest: ${e.message}`
        : "Couldn't fetch that manifest. Check the URL and try again."
    } finally {
      if (runId === addAddonRunId) isAddingAddon.value = false
    }
}

const downloadBackup = (payload, prefix = 'stremio-addons-backup') => {
  backupRestoreError.value = ''
  const data = JSON.stringify(payload, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${prefix}-${new Date().toISOString().slice(0,10)}.json`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 100)
}

const backupConfig = () => downloadBackup({ formatVersion: 2, createdAt: new Date().toISOString(), addons: localAddons.value, editorStates: props.editorStates })
const backupRecovery = () => { if (props.recovery) downloadBackup(props.recovery, 'stremio-recovery') }

const restoreConfig = () => {
  backupRestoreError.value = ''
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { backupRestoreError.value = 'This backup exceeds the 4 MiB limit.'; return }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const payload = JSON.parse(e.target.result)
        const restoredAddons = parseAddonBackup(payload)
        validateAddonCollection(restoredAddons)
        protectSystemAddons(props.addons, restoredAddons)
        const restoredDrafts = Object.fromEntries(restoredAddons.map(addon => [addon.transportUrl, createManifestDraft(addon.manifest, payload.editorStates?.[addon.transportUrl]).draft]))
        confirmModal.value = {
          show: true,
          title: 'Restore Backup?',
          message: `This replaces your local addon list with ${restoredAddons.length} addons from the backup. You still need to sync changes to save it to Stremio.`,
          confirmText: 'Restore',
          type: 'info',
          action: () => {
            emit('update:addons', restoredAddons)
            emit('update:editor-states', restoredDrafts)
            confirmModal.value.show = false
            backupRestoreError.value = ''
          }
        }
      } catch (err) {
        backupRestoreError.value = err instanceof Error
          ? `Couldn't restore that file: ${err.message}`
          : "Couldn't restore that file. Make sure it's a valid addon backup."
      }
    }
    reader.onerror = () => {
      backupRestoreError.value = "Couldn't read that file. Please try again."
    }
    reader.readAsText(file)
  }
  input.click()
}

function handleAddonDragStart() {
  isDragging.value = true
  edgeDragScroll.start()
}

function handleAddonDragEnd() {
  isDragging.value = false
  edgeDragScroll.stop()
  emit('update:addons', [...localAddons.value])
}

onUnmounted(() => {
  edgeDragScroll.stop()
  addAddonRunId++
  addAbort?.abort()
})
</script>

<template>
  <div class="container relative isolate mx-auto max-w-5xl px-4 py-3">
    <div
      class="mb-3 rounded-2xl border border-zinc-200 bg-white/75 p-3 shadow-sm shadow-zinc-200/60 backdrop-blur-xl transition-all duration-200 ease-out dark:border-white/5 dark:bg-zinc-900/70 dark:shadow-black/30 lg:sticky lg:top-20 lg:z-30"
      :class="[
        isDragging ? 'opacity-0 pointer-events-none -translate-y-4 scale-[0.985]' : 'opacity-100 translate-y-0 scale-100',
        hasUnsyncedChanges ? 'ring-1 ring-amber-400/20 dark:ring-amber-300/15' : ''
      ]"
    >
      <div class="flex flex-col gap-3 lg:hidden">
        <div class="flex min-h-10 items-center justify-between gap-3">
          <div class="min-w-0">
            <h1 class="truncate text-lg font-bold leading-5 tracking-tight text-zinc-950 dark:text-white">
              Your addons
            </h1>
            <div class="mt-0.5 flex min-w-0 items-center gap-1.5">
              <p class="truncate text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                {{ dashboardSubtitle }}
              </p>
              <span
                v-if="hasUnsyncedChanges"
                class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-700 dark:text-amber-200"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                Unsynced
              </span>
            </div>
          </div>

          <button
            type="button"
            @click="$emit('sync')"
            class="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-all"
            :class="hasUnsyncedChanges ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-500 active:scale-[0.98]' : 'cursor-default border border-zinc-200 bg-white/70 text-zinc-500 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400'"
            :disabled="isSyncDisabled"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
            <span>{{ uncertainWrite ? 'Verify sync' : hasUnsyncedChanges ? 'Review sync' : 'Synced' }}</span>
          </button>
        </div>

        <div class="relative w-full">
          <Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            v-model="searchQuery"
            placeholder="Search addons..."
            class="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 pl-8 pr-8 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-100 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
          />
          <button
            v-if="isSearching"
            type="button"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Clear search"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="openAddModal"
            class="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            title="Add New Addon"
          >
            <Plus class="h-4 w-4" />
            <span>Add</span>
          </button>

          <div class="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50/80 p-0.5 dark:border-white/10 dark:bg-zinc-950/50">
            <button type="button" @click="$emit('reload')" :disabled="isLoading" class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-white disabled:opacity-40 dark:hover:bg-zinc-800" aria-label="Reload from Stremio" title="Reload from Stremio"><RefreshCw class="h-4 w-4" /></button>
            <button
              type="button"
              @click="isLocked = !isLocked"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg transition"
              :class="isLocked ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-zinc-500 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
              :title="isLocked ? 'Unlock Reordering' : 'Lock Reordering'"
              :aria-label="isLocked ? 'Unlock reordering' : 'Lock reordering'"
            >
              <Lock v-if="isLocked" class="h-4 w-4" />
              <Unlock v-else class="h-4 w-4" />
            </button>

            <button
              type="button"
              @click="backupConfig"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-blue-300"
              title="Backup Configuration"
              aria-label="Backup configuration"
            >
              <Download class="h-4 w-4" />
            </button>
            <button
              type="button"
              @click="restoreConfig"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-blue-300"
              title="Restore Configuration"
              aria-label="Restore configuration"
            >
              <Upload class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="hidden min-h-12 items-center gap-2.5 lg:flex">
        <div class="w-40 shrink-0 min-w-0 lg:w-44">
          <h1 class="truncate text-lg font-bold leading-5 tracking-tight text-zinc-950 dark:text-white">
            Your addons
          </h1>
          <div class="mt-1 flex min-w-0 items-center gap-1.5">
            <p class="truncate text-xs leading-4 text-zinc-500 dark:text-zinc-400">
              {{ dashboardSubtitle }}
            </p>
            <span
              v-if="hasUnsyncedChanges"
              class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-700 dark:text-amber-200"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
              Unsynced
            </span>
          </div>
        </div>

        <div class="relative min-w-0 flex-1">
          <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            v-model="searchQuery"
            placeholder="Search addons..."
            class="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 pl-9 pr-9 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-100 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
          />
          <button
            v-if="isSearching"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Clear search"
            @click="searchQuery = ''"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            @click="openAddModal"
            class="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 lg:px-4"
            title="Add New Addon"
          >
            <Plus class="h-4 w-4" />
            <span>Add Addon</span>
          </button>

          <div class="flex h-10 items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50/80 p-0.5 dark:border-white/10 dark:bg-zinc-950/50">
            <button type="button" @click="$emit('reload')" :disabled="isLoading" class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-white disabled:opacity-40 dark:hover:bg-zinc-800" aria-label="Reload from Stremio" title="Reload from Stremio"><RefreshCw class="h-4 w-4" /></button>
            <button
              type="button"
              @click="isLocked = !isLocked"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg transition"
              :class="isLocked ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-zinc-500 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
              :title="isLocked ? 'Unlock Reordering' : 'Lock Reordering'"
              :aria-label="isLocked ? 'Unlock reordering' : 'Lock reordering'"
            >
              <Lock v-if="isLocked" class="h-4 w-4" />
              <Unlock v-else class="h-4 w-4" />
            </button>

            <button
              type="button"
              @click="backupConfig"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-blue-300"
              title="Backup Configuration"
              aria-label="Backup configuration"
            >
              <Download class="h-4 w-4" />
            </button>
            <button
              type="button"
              @click="restoreConfig"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-blue-300"
              title="Restore Configuration"
              aria-label="Restore configuration"
            >
              <Upload class="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            @click="$emit('sync')"
            class="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition-all lg:px-4"
            :class="hasUnsyncedChanges ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-500 active:scale-[0.98]' : 'cursor-default border border-zinc-200 bg-white/70 text-zinc-500 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400'"
            :disabled="isSyncDisabled"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
            <span>{{ uncertainWrite ? 'Verify sync' : hasUnsyncedChanges ? 'Review sync' : 'Synced' }}</span>
          </button>
        </div>
      </div>

    </div>

    <div
      v-if="backupRestoreError"
      class="mb-3 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
    >
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" />
      <p class="min-w-0 flex-1 font-medium leading-5">{{ backupRestoreError }}</p>
      <button
        type="button"
        @click="backupRestoreError = ''"
        class="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1 text-rose-500 transition hover:bg-rose-100 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-200"
        aria-label="Dismiss error"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div v-if="conflict" role="status" class="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <p class="font-semibold">Stremio changed since this workspace was loaded.</p>
      <ul class="mt-2 space-y-1"><li v-for="(change, index) in conflict.changes" :key="index">{{ change.kind }}: {{ change.name }}</li></ul>
      <p v-if="conflict.conflicts?.length" class="mt-2">Overlapping changes: {{ conflict.conflicts.join(', ') }}. Your draft is still intact.</p>
      <div class="mt-3 flex flex-wrap gap-3"><button type="button" class="rounded-lg border px-3 py-2" @click="$emit('merge')">Merge non-overlapping changes</button><button type="button" class="rounded-lg border px-3 py-2" @click="backupConfig">Download current draft</button><button type="button" class="rounded-lg border px-3 py-2" @click="$emit('reload')">Reload from Stremio</button></div>
    </div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500"><p>Private backups contain configured addon URLs and may contain service credentials.</p><button v-if="recovery" type="button" @click="backupRecovery" class="rounded-lg border px-3 py-2 font-semibold">Download recovery backup</button></div>
    <div v-if="localAddons.length === 0" class="animate-fade-in-up rounded-3xl border border-zinc-200 bg-white/75 px-6 py-8 text-center shadow-sm dark:border-white/5 dark:bg-zinc-900/60">
      <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-400 shadow-inner dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-500">
        <PackageOpen class="h-6 w-6" />
      </div>
      <h3 class="mb-2 text-lg font-semibold text-zinc-950 dark:text-white">No addons loaded</h3>
      <p class="mx-auto mb-5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        Your list is empty. Reload to import your current profile from Stremio, or add addons manually.
      </p>
      <div class="flex flex-col justify-center gap-2 sm:flex-row">
        <button type="button" @click="$emit('reload')" class="btn-primary h-10 rounded-xl px-4 text-sm" :disabled="isLoading">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" /> Reload from Stremio
        </button>
        <button type="button" @click="openAddModal" class="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
          <Plus class="h-4 w-4" /> Add addon
        </button>
      </div>
    </div>

    <template v-else>
      <Draggable 
        v-if="canDrag"
        :list="localAddons"
        item-key="__clientKey"
        handle=".drag-handle"
        filter="button,a,input,textarea,select,[data-no-drag]"
        :prevent-on-filter="false"
        ghost-class="sortable-ghost"
        chosen-class="sortable-chosen"
        drag-class="sortable-drag"
        fallback-class="sortable-fallback"
        class="reorder-list flex flex-col gap-3 pb-20"
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
        :class="{ 'is-dragging': isDragging }"
        @start="handleAddonDragStart"
        @end="handleAddonDragEnd"
        @unchoose="edgeDragScroll.stop(); isDragging = false"
      >
        <template #item="{ element, index }">
          <AddonItem 
            :addon="element"
            :is-locked="!canDrag"
            :is-busy="isLoading"
            @remove="handleRemove(index)"
            @edit="handleEdit(index)"
            @move="handleMove(index, $event)"
          />
        </template>
      </Draggable>

      <div v-else class="flex flex-col gap-3 pb-20">
         <AddonItem 
            v-for="(element, index) in displayedAddons"
            :key="element.__clientKey"
            :addon="element"
            :is-locked="!canDrag"
            :is-busy="isLoading"
            @remove="handleRemove(index)"
            @edit="handleEdit(index)"
            @move="handleMove(index, $event)"
          />
          <div v-if="hasSearchNoResults" class="rounded-3xl border border-zinc-200 bg-white/75 px-6 py-8 text-center shadow-sm dark:border-white/5 dark:bg-zinc-900/60">
            <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              <Search class="h-4 w-4" />
            </div>
            <h3 class="text-base font-semibold text-zinc-950 dark:text-white">No addons found</h3>
            <p class="mx-auto mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
              Try a different name, description, or manifest URL.
            </p>
            <button
              type="button"
              class="mt-5 inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              @click="searchQuery = ''"
            >
              Clear search
            </button>
          </div>
      </div>
    </template>

    <!-- Add Addon Modal -->
    <Modal
      :show="isAddModalOpen"
      @close="closeAddModal"
      title="Add addon"
      max-width="max-w-md"
    >
      <div class="space-y-3">
        <p class="text-sm text-zinc-600 dark:text-zinc-400">
          Paste a manifest URL or Stremio install link.
        </p>

        <div class="relative">
          <Link2 class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            v-model="newAddonUrl"
            placeholder="https://example.com/manifest.json"
            spellcheck="false"
            autocomplete="off"
            :disabled="isAddingAddon"
            class="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 pl-9 pr-3 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-100 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
            @input="addAddonError = ''"
            @keyup.enter="installAddon"
          />
        </div>

        <p class="px-0.5 text-xs text-zinc-400 dark:text-zinc-500">
          Supports <span class="font-medium text-zinc-500 dark:text-zinc-400">https://.../manifest.json</span> and <span class="font-medium text-zinc-500 dark:text-zinc-400">stremio://</span> links. The manifest is fetched before adding.
        </p>

        <a v-if="configureRequiredUrl" :href="configureRequiredUrl" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 underline">Open provider configuration</a>
        <div
          v-if="addAddonError"
          class="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <CircleAlert class="mt-px h-4 w-4 shrink-0" />
          <span>{{ addAddonError }}</span>
        </div>
      </div>
      <template #footer>
        <button
          type="button"
          @click="closeAddModal"
          class="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-zinc-500 transition hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-200 dark:disabled:hover:text-zinc-400"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="installAddon"
          :disabled="!newAddonUrl || isAddingAddon"
          class="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:bg-blue-600 disabled:active:scale-100"
        >
          <LoaderCircle v-if="isAddingAddon" class="h-4 w-4 animate-spin" />
          <Plus v-else class="h-4 w-4" />
          <span>{{ isAddingAddon ? 'Checking...' : 'Add addon' }}</span>
        </button>
      </template>
    </Modal>

    <!-- Detailed Edit Modal -->
    <Modal
      :show="isEditModalOpen"
      title="Edit manifest"
      @close="handleEditModalCloseRequest"
      max-width="max-w-4xl"
      no-header
      no-padding
      v-slot="{ scrollContainer }"
    >
      <DynamicForm
        v-if="currentEditManifest"
        :manifest="currentEditManifest"
        :manifestURL="currentEditURL"
        :saved-draft="currentEditDraft"
        :scroll-container="scrollContainer"
        @update-manifest="handleSaveManifest"
        @cancel="closeEditModal"
        @dirty-change="editorDirtyChanged"
      />
    </Modal>

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
.animate-fade-in-up {
  animation: fadeInUp 0.5s ease-out;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
