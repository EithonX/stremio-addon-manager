<script setup>
import { ref, computed, onUnmounted, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import Draggable from 'vuedraggable'
import { RefreshCw, Upload, Download, Plus, Search, Lock, Unlock } from 'lucide-vue-next'
import AddonItem from './AddonItem.vue'
import DynamicForm from './DynamicForm.vue'
import Modal from './ui/Modal.vue'
import ConfirmationModal from './ui/ConfirmationModal.vue'
import { createEdgeDragScroll } from '../utils/edgeDragScroll'
import {
  normalizeAddonCollection,
  normalizeAddonRecord,
  normalizeManifestUrl,
  parseAddonBackup,
} from '../features/addons/addonCollection'

const props = defineProps({
  addons: {
    type: Array,
    required: true
  },
  isLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:addons', 'sync', 'reload', 'remove'])

// Local State
const searchQuery = ref('')
const isEditModalOpen = ref(false)
const isAddModalOpen = ref(false)
const newAddonUrl = ref('')
const isLocked = ref(false)
const isDragging = ref(false)
const localAddons = ref([])

const currentEditIndex = ref(null)
const currentEditManifest = ref(null)
const currentEditURL = ref('')
const edgeDragScroll = createEdgeDragScroll(() => window)

// Confirmation State
const confirmModal = ref({
  show: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  action: null
})

// Computed
const isSearching = computed(() => searchQuery.value.trim().length > 0)
const canDrag = computed(() => !isSearching.value && !isLocked.value)

const displayedAddons = computed(() => {
  if (!isSearching.value) return localAddons.value
  const q = searchQuery.value.toLowerCase()
  return localAddons.value.filter(addon => 
    addon.manifest.name.toLowerCase().includes(q) || 
    addon.manifest.description.toLowerCase().includes(q) ||
    addon.transportUrl.toLowerCase().includes(q)
  )
})

const dragTouchDelay = 180
const dragTouchThreshold = 8
const dragFallbackTolerance = 10
const useFallbackDrag = useMediaQuery('(pointer: coarse)')

watch(
  () => props.addons,
  (addons) => {
    localAddons.value = normalizeAddonCollection(addons)
  },
  { immediate: true },
)

// Actions
const handleEdit = (index) => {
  const addon = displayedAddons.value[index]
  const realIndex = localAddons.value.indexOf(addon)
  
  if (realIndex === -1) return

  currentEditIndex.value = realIndex
  currentEditManifest.value = JSON.parse(JSON.stringify(addon.manifest))
  currentEditURL.value = addon.transportUrl
  isEditModalOpen.value = true
}

const handleRemove = (index) => {
  const addon = displayedAddons.value[index]
  const realIndex = localAddons.value.indexOf(addon)
  if (realIndex !== -1) {
    emit('remove', realIndex)
  }
}

const handleSaveManifest = (newManifest) => {
  const newAddons = [...localAddons.value]
  if (currentEditIndex.value !== null && newAddons[currentEditIndex.value]) {
    newAddons[currentEditIndex.value] = {
      ...newAddons[currentEditIndex.value],
      manifest: newManifest,
    }
    emit('update:addons', newAddons)
  }
  isEditModalOpen.value = false
}

const openAddModal = () => {
    isAddModalOpen.value = true
    newAddonUrl.value = ''
}

const installAddon = async () => {
    const url = normalizeManifestUrl(newAddonUrl.value)
    if (!url) {
      alert('Invalid URL. Use a valid http(s) or stremio:// manifest URL.')
      return
    }

    try {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const manifest = await res.json()
      const nextAddon = normalizeAddonRecord({
        transportUrl: url,
        manifest,
        flags: {},
      })

      if (!nextAddon) {
        throw new Error('Manifest payload is missing required fields (id/version).')
      }

      const newAddons = [...localAddons.value, nextAddon]
      emit('update:addons', newAddons)
      isAddModalOpen.value = false
      newAddonUrl.value = ''
    } catch (e) {
      alert(`Failed to load addon: ${e.message}`)
    }
}

const backupConfig = () => {
  const data = JSON.stringify({ addons: localAddons.value }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stremio-addons-backup-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const restoreConfig = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const restoredAddons = parseAddonBackup(JSON.parse(e.target.result))
        confirmModal.value = {
          show: true,
          title: 'Restore Backup?',
          message: `Replace current list with ${restoredAddons.length} addons from backup? This will overwrite your current list.`,
          confirmText: 'Restore',
          action: () => {
            emit('update:addons', restoredAddons)
            confirmModal.value.show = false
          }
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to parse backup file.')
      }
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
})
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-5xl">
    <!-- Sticky only on medium screens and up to prevent overcrowding on mobile -->
    <div
      class="card-base p-4 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center md:sticky top-20 z-30 shadow-xl shadow-zinc-200/50 dark:shadow-black/50 ring-1 ring-zinc-900/5 dark:ring-white/10 bg-white dark:bg-zinc-900 md:bg-white/80 md:dark:bg-zinc-900/80 md:backdrop-blur-md transition-all duration-200 ease-out"
      :class="isDragging ? 'opacity-0 pointer-events-none -translate-y-4 scale-[0.985]' : 'opacity-100 translate-y-0 scale-100'"
    >
      
      <!-- Search Bar (Full width on mobile) -->
      <div class="w-full md:w-auto md:flex-1 md:max-w-md relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input 
          v-model="searchQuery" 
          placeholder="Search addons..." 
          class="input-field pl-10 h-9 md:h-10 text-sm w-full"
        />
      </div>

      <!-- Actions Row -->
      <div class="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end overflow-x-auto no-scrollbar">
        
        <!-- Add Button -->
        <button 
          @click="openAddModal" 
          class="btn-primary h-9 md:h-10 px-3 md:px-4 text-sm whitespace-nowrap bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 dark:hover:bg-zinc-600 shadow-md flex-shrink-0" 
          title="Add New Addon"
        >
          <Plus class="w-4 h-4" />
          <span class="hidden sm:inline">Add Addon</span>
          <span class="sm:hidden">Add</span>
        </button>

        <div class="h-6 w-px bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0"></div>

        <div class="flex items-center gap-1 flex-shrink-0">
           <button 
             @click="isLocked = !isLocked" 
             class="p-1.5 md:p-2 rounded-lg transition-colors border flex-shrink-0"
             :class="isLocked ? 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'text-zinc-500 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'"
             :title="isLocked ? 'Unlock Reordering' : 'Lock Reordering'"
           >
            <Lock v-if="isLocked" class="w-5 h-5" />
            <Unlock v-else class="w-5 h-5" />
          </button>

           <button @click="backupConfig" class="p-1.5 md:p-2 text-zinc-500 hover:text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0" title="Backup Configuration">
            <Download class="w-5 h-5" />
          </button>
          <button @click="restoreConfig" class="p-1.5 md:p-2 text-zinc-500 hover:text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0" title="Restore Configuration">
            <Upload class="w-5 h-5" />
          </button>
        </div>
        
        <div class="h-6 w-px bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0"></div>

        <button 
          @click="$emit('sync')" 
          class="btn-primary h-9 md:h-10 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex-shrink-0" 
          :disabled="isLoading"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
          <span class="hidden sm:inline">Sync to Stremio</span>
          <span class="sm:hidden">Sync</span>
        </button>
      </div>
    </div>

    <!-- Stats / Empty State -->
    <div v-if="localAddons.length === 0" class="text-center py-20 animate-fade-in-up">
      <div class="bg-zinc-50 dark:bg-zinc-800/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-100 dark:border-zinc-700">
        <Upload class="w-10 h-10 text-zinc-400" />
      </div>
      <h3 class="text-xl font-bold text-zinc-900 dark:text-white mb-2">No addons loaded</h3>
      <p class="text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto mb-8">
        Your list is empty. Reload to import your current profile from Stremio, or add addons manually.
      </p>
      <button @click="$emit('reload')" class="btn-primary mx-auto" :disabled="isLoading">
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" /> Reload from Stremio
      </button>
    </div>

    <!-- Addon List -->
    <template v-else>
      <Draggable 
        v-if="canDrag"
        :list="localAddons"
        item-key="transportUrl"
        handle=".drag-handle"
        filter="button,a,input,textarea,select,[data-no-drag]"
        :prevent-on-filter="false"
        ghost-class="sortable-ghost"
        chosen-class="sortable-chosen"
        drag-class="sortable-drag"
        fallback-class="sortable-fallback"
        class="reorder-list flex flex-col gap-4 pb-20"
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
            :is-locked="isLocked"
            @remove="emit('remove', index)"
            @edit="handleEdit(index)"
          />
        </template>
      </Draggable>

      <!-- Read-only List when searching or locked -->
      <div v-else class="flex flex-col gap-4 pb-20">
         <AddonItem 
            v-for="(element, index) in displayedAddons"
            :key="element.transportUrl"
            :addon="element"
            :is-locked="isLocked"
            @remove="handleRemove(index)"
            @edit="handleEdit(index)"
          />
          <div v-if="displayedAddons.length === 0" class="text-center py-10 text-zinc-500">
            No addons found.
          </div>
      </div>
    </template>

    <!-- Add Addon Modal -->
    <Modal
      :show="isAddModalOpen"
      @close="isAddModalOpen = false"
      title="Add New Addon"
      max-width="max-w-md"
    >
      <div class="space-y-4">
        <p class="text-sm text-zinc-600 dark:text-zinc-400">
          Enter the manifest URL of the addon you want to add.
        </p>
        <input 
          v-model="newAddonUrl"
          placeholder="https://example.com/manifest.json" 
          class="input-field"
          @keyup.enter="installAddon"
        />
        <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-xs text-blue-700 dark:text-blue-300">
          <strong>Tip:</strong> If you have a Stremio link (stremio://), just paste it. We'll handle it.
        </div>
      </div>
      <template #footer>
        <button @click="isAddModalOpen = false" class="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Cancel
        </button>
        <button @click="installAddon" class="btn-primary" :disabled="!newAddonUrl">
          Add Addon
        </button>
      </template>
    </Modal>

    <!-- Detailed Edit Modal -->
    <Modal 
      :show="isEditModalOpen" 
      @close="isEditModalOpen = false" 
      max-width="max-w-4xl"
      title="Edit Addon"
      no-padding
      v-slot="{ scrollContainer }"
    >
      <DynamicForm 
        v-if="currentEditManifest"
        :manifest="currentEditManifest"
        :manifestURL="currentEditURL"
        :scroll-container="scrollContainer"
        @update-manifest="handleSaveManifest"
        @cancel="isEditModalOpen = false"
      />
    </Modal>

    <!-- Confirmation Modal -->
    <ConfirmationModal 
      :show="confirmModal.show"
      :title="confirmModal.title"
      :message="confirmModal.message"
      :confirm-text="confirmModal.confirmText"
      type="info"
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
