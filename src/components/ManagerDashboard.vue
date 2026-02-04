<script setup>
import { ref, computed } from 'vue'
import Draggable from 'vuedraggable'
import { RefreshCw, Upload, Download, Plus, Search, Lock, Unlock } from 'lucide-vue-next'
import AddonItem from './AddonItem.vue'
import DynamicForm from './DynamicForm.vue'
import Modal from './ui/Modal.vue'
import ConfirmationModal from './ui/ConfirmationModal.vue'

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

const emit = defineEmits(['update:addons', 'sync', 'logout', 'remove'])

// Local State
const searchQuery = ref('')
const isEditModalOpen = ref(false)
const isAddModalOpen = ref(false)
const newAddonUrl = ref('')
const isLocked = ref(false)

const currentEditIndex = ref(null)
const currentEditManifest = ref(null)
const currentEditURL = ref('')

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
  if (!isSearching.value) return props.addons
  const q = searchQuery.value.toLowerCase()
  return props.addons.filter(addon => 
    addon.manifest.name.toLowerCase().includes(q) || 
    addon.manifest.description?.toLowerCase().includes(q) ||
    addon.transportUrl.toLowerCase().includes(q)
  )
})

// Actions
const handleEdit = (index) => {
  const addon = displayedAddons.value[index]
  const realIndex = props.addons.indexOf(addon)
  
  if (realIndex === -1) return

  currentEditIndex.value = realIndex
  currentEditManifest.value = JSON.parse(JSON.stringify(addon.manifest))
  currentEditURL.value = addon.transportUrl
  isEditModalOpen.value = true
}

const handleRemove = (index) => {
  const addon = displayedAddons.value[index]
  const realIndex = props.addons.indexOf(addon)
  if (realIndex !== -1) {
    emit('remove', realIndex)
  }
}

const handleSaveManifest = (newManifest) => {
  const newAddons = [...props.addons]
  if (currentEditIndex.value !== null && newAddons[currentEditIndex.value]) {
    newAddons[currentEditIndex.value].manifest = newManifest
    emit('update:addons', newAddons)
  }
  isEditModalOpen.value = false
}

const openAddModal = () => {
    isAddModalOpen.value = true
    newAddonUrl.value = ''
}

const installAddon = () => {
    const url = newAddonUrl.value.trim()
    if (!url) return 

    if (!url.startsWith('http')) {
      alert('Invalid URL. Must start with http:// or https://')
      return
    }
    
    fetch(url)
      .then(res => res.json())
      .then(manifest => {
        const newAddons = [...props.addons, {
          transportUrl: url,
          manifest: manifest,
          flags: {}
        }]
        emit('update:addons', newAddons)
        isAddModalOpen.value = false
        newAddonUrl.value = ''
      })
      .catch(e => alert(`Failed to load addon: ${e.message}`))
}

const backupConfig = () => {
  const data = JSON.stringify({ addons: props.addons }, null, 2)
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
        const data = JSON.parse(e.target.result)
        if (Array.isArray(data.addons)) {
          confirmModal.value = {
            show: true,
            title: 'Restore Backup?',
            message: `Replace current list with ${data.addons.length} addons from backup? This will overwrite your current list.`,
            confirmText: 'Restore',
            action: () => {
              emit('update:addons', data.addons)
              confirmModal.value.show = false
            }
          }
        } else {
          alert('Invalid backup file format.')
        }
      } catch (err) {
        alert('Failed to parse JSON.')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-5xl">
    <!-- Toolbar -->
    <!-- Toolbar -->
    <!-- Sticky only on medium screens and up to prevent overcrowding on mobile -->
    <!-- Toolbar -->
    <!-- Sticky only on medium screens and up to prevent overcrowding on mobile -->
    <div class="card-base p-4 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center md:sticky top-20 z-30 shadow-xl shadow-zinc-200/50 dark:shadow-black/50 ring-1 ring-zinc-900/5 dark:ring-white/10 bg-white dark:bg-zinc-900 md:bg-white/80 md:dark:bg-zinc-900/80 md:backdrop-blur-md">
      
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
    <div v-if="addons.length === 0" class="text-center py-20 animate-fade-in-up">
      <div class="bg-zinc-50 dark:bg-zinc-800/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-100 dark:border-zinc-700">
        <Upload class="w-10 h-10 text-zinc-400" />
      </div>
      <h3 class="text-xl font-bold text-zinc-900 dark:text-white mb-2">No addons loaded</h3>
      <p class="text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto mb-8">
        Your list is empty. Sync to import your current profile from Stremio, or add addons manually.
      </p>
      <button @click="$emit('sync')" class="btn-primary mx-auto">
        <RefreshCw class="w-4 h-4" /> Load from Stremio
      </button>
    </div>

    <!-- Addon List -->
    <template v-else>
      <Draggable 
        v-if="canDrag"
        :list="addons" 
        item-key="transportUrl"
        handle=".drag-handle"
        ghost-class="sortable-ghost"
        drag-class="sortable-drag"
        class="space-y-4 pb-20"
        @end="$emit('update:addons', addons)"
      >
        <template #item="{ element, index }">
          <AddonItem 
            :addon="element"
            :index="index"
            :is-locked="isLocked"
            @remove="emit('remove', index)"
            @edit="handleEdit(index)"
          />
        </template>
      </Draggable>

      <!-- Read-only List when searching or locked -->
      <div v-else class="space-y-4 pb-20">
         <AddonItem 
            v-for="(element, index) in displayedAddons"
            :key="element.transportUrl"
            :addon="element"
            :index="index"
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
          ref="addInputRef"
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
    >
      <DynamicForm 
        v-if="currentEditManifest"
        :manifest="currentEditManifest"
        :manifestURL="currentEditURL"
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