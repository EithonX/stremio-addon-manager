<script setup>
import { shallowRef, computed, onMounted, onUnmounted, useTemplateRef } from 'vue'
import { ChevronDown, Edit2, Trash2, Check, Lock } from 'lucide-vue-next'
import ConfirmationModal from './ui/ConfirmationModal.vue'
import { useSavedAccounts } from '../features/accounts/useSavedAccounts'

const emit = defineEmits(['selected'])

const {
  savedAccounts,
  defaultSavedAccount,
  ensureNormalized,
  removeSavedAccount,
  renameSavedAccount,
} = useSavedAccounts()
const DEFAULT_EMAIL = defaultSavedAccount.email

const selectedEmail = shallowRef(DEFAULT_EMAIL)
const isEditing = shallowRef(false)
const editLabel = shallowRef('')
const isDropdownOpen = shallowRef(false)
const dropdownRef = useTemplateRef('dropdownRef')

// Confirmation Modal State
const showConfirm = shallowRef(false)

// Computed
const displayAccounts = computed(() => {
  // Sort accounts by label/email
  const sorted = [...savedAccounts.value].sort((a, b) => {
    const left = (a.label || a.email || '').toLowerCase()
    const right = (b.label || b.email || '').toLowerCase()
    return left.localeCompare(right)
  })
  return sorted
})

const selectedAccount = computed(() => 
  savedAccounts.value.find(a => a.email === selectedEmail.value)
)

const currentLabel = computed(() => {
  if (selectedEmail.value === DEFAULT_EMAIL) return defaultSavedAccount.label
  return selectedAccount.value?.label || selectedAccount.value?.email || 'Unknown Account'
})

// Actions
function selectAccount(email) {
  selectedEmail.value = email || DEFAULT_EMAIL
  const account = savedAccounts.value.find(a => a.email === email) || { ...defaultSavedAccount }
  emit('selected', account)
  isDropdownOpen.value = false
}

function confirmRemove() {
  if (!selectedEmail.value) return
  showConfirm.value = true
}

function handleRemoveConfirm() {
  removeSavedAccount(selectedEmail.value)
  selectedEmail.value = DEFAULT_EMAIL
  emit('selected', { ...defaultSavedAccount })
  showConfirm.value = false
}

function startRename() {
  if (!selectedAccount.value) return
  editLabel.value = selectedAccount.value.label
  isEditing.value = true
}

function saveRename() {
  if (!selectedAccount.value) return
  renameSavedAccount(selectedEmail.value, editLabel.value)
  isEditing.value = false
}

// Click Outside
function handleClickOutside(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isDropdownOpen.value = false
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    isDropdownOpen.value = false
  }
}

onMounted(() => {
  ensureNormalized()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div v-if="savedAccounts.length > 0" class="w-full space-y-2">
    <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
      Saved account
    </label>
    
    <div class="flex gap-2">
      <!-- Custom Dropdown -->
      <div ref="dropdownRef" class="relative flex-grow min-w-0">
        <button 
          @click="isDropdownOpen = !isDropdownOpen"
          type="button"
          aria-haspopup="listbox"
          :aria-expanded="isDropdownOpen"
          class="relative flex h-11 w-full items-center rounded-xl border border-zinc-200 bg-zinc-50/80 pl-3.5 pr-10 text-left text-sm text-zinc-900 outline-none transition-all hover:border-zinc-300 focus-visible:border-blue-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-blue-500/10 dark:border-white/10 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:border-white/20 dark:focus-visible:border-blue-500 dark:focus-visible:bg-zinc-950"
        >
          <span class="block min-w-0 truncate font-medium">{{ currentLabel }}</span>
          
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 dark:text-zinc-400">
            <ChevronDown class="w-4 h-4 transition-transform duration-200" :class="{ 'rotate-180': isDropdownOpen }" />
          </div>
        </button>

        <!-- Dropdown Menu -->
        <transition 
          enter-active-class="transition duration-100 ease-out" 
          enter-from-class="transform scale-95 opacity-0" 
          enter-to-class="transform scale-100 opacity-100"
          leave-active-class="transition duration-75 ease-in" 
          leave-from-class="transform scale-100 opacity-100" 
          leave-to-class="transform scale-95 opacity-0"
        >
          <div 
            v-if="isDropdownOpen" 
            role="listbox"
            class="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-2xl border border-zinc-200 bg-white/95 p-1 shadow-xl shadow-zinc-900/10 backdrop-blur custom-scrollbar dark:border-white/10 dark:bg-zinc-900/95 dark:shadow-black/30"
          >
            <!-- Default Option -->
             <button
                @click="selectAccount(DEFAULT_EMAIL)"
                type="button"
                role="option"
                :aria-selected="selectedEmail === DEFAULT_EMAIL"
                class="flex min-h-10 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                :class="selectedEmail === DEFAULT_EMAIL ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5'"
              >
                <span class="truncate">{{ defaultSavedAccount.label }}</span>
                <Check v-if="selectedEmail === DEFAULT_EMAIL" class="w-4 h-4" />
              </button>

             <!-- Saved Accounts -->
             <button
                v-for="acc in displayAccounts" 
                :key="acc.email" 
                @click="selectAccount(acc.email)"
                type="button"
                role="option"
                :aria-selected="selectedEmail === acc.email"
                class="flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                :class="selectedEmail === acc.email ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5'"
              >
                <div class="flex min-w-0 flex-col pr-2">
                  <span class="flex items-center gap-1.5 truncate font-medium">
                    {{ acc.label }}
                    <Lock v-if="acc.protected" class="w-3 h-3 text-amber-500 shrink-0" />
                  </span>
                  <span v-if="acc.label !== acc.email" class="text-xs text-zinc-400 truncate">{{ acc.email }}</span>
                </div>
                <Check v-if="selectedEmail === acc.email" class="w-4 h-4 flex-shrink-0" />
              </button>
              
              <div v-if="displayAccounts.length === 0" class="px-3 py-2 text-xs text-zinc-400 text-center italic">
                No saved accounts
              </div>
          </div>
        </transition>
      </div>
      
      <div v-if="selectedEmail !== DEFAULT_EMAIL" class="flex gap-2 animate-fade-in">
        <button 
          @click.stop="startRename"
          type="button"
          title="Rename account"
          aria-label="Rename saved account"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/80 text-zinc-500 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/10 dark:border-white/10 dark:bg-zinc-950/50 dark:text-zinc-400 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
        >
          <Edit2 class="w-4 h-4" />
        </button>
        
        <button 
          @click.stop="confirmRemove"
          type="button"
          title="Remove account"
          aria-label="Remove saved account"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/80 text-zinc-500 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/10 dark:border-white/10 dark:bg-zinc-950/50 dark:text-zinc-400 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Edit Label Modal/Input (Inline for simplicity) -->
    <div v-if="isEditing" class="mt-2 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-2.5 dark:border-white/10 dark:bg-zinc-950/40">
      <input 
        v-model="editLabel"
        ref="editInput"
        class="h-9 min-w-0 flex-grow rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus-visible:border-blue-400 focus-visible:ring-4 focus-visible:ring-blue-500/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-visible:border-blue-500"
        placeholder="Account label"
        @keyup.enter="saveRename"
        @keyup.esc="isEditing = false"
      />
      <button 
        @click="saveRename"
        type="button"
        class="h-9 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-sm shadow-blue-500/15 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20"
      >
        Save
      </button>
      <button 
        @click="isEditing = false"
        type="button"
        class="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Cancel
      </button>
    </div>

    <!-- Confirmation Modal -->
    <ConfirmationModal 
      :show="showConfirm"
      title="Remove saved account?"
      :message="`Remove ${currentLabel} from saved accounts on this device? This will not affect your Stremio account.`"
      confirm-text="Remove"
      type="danger"
      @close="showConfirm = false"
      @confirm="handleRemoveConfirm"
    />

  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-5px); }
  to { opacity: 1; transform: translateX(0); }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent; 
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgb(228 228 231);
  border-radius: 9999px;
}
</style>
