<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Edit2, Trash2, User, Check } from 'lucide-vue-next'
import { useStorage } from '@vueuse/core'
import ConfirmationModal from './ui/ConfirmationModal.vue'

const emit = defineEmits(['selected'])

// Use vueuse useStorage for easy persistence
const savedAccounts = useStorage('sam_saved_accounts', []) // [{ email, label, password, authKey }]
const DEFAULT_EMAIL = ''

const defaultAccount = {
  email: DEFAULT_EMAIL,
  label: '-- Select Saved Account --',
  password: '',
  authKey: '',
}

const selectedEmail = ref(DEFAULT_EMAIL)
const isEditing = ref(false)
const editLabel = ref('')
const isDropdownOpen = ref(false)
const dropdownRef = ref(null)

// Confirmation Modal State
const showConfirm = ref(false)
const confirmCallback = ref(null)

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
  if (selectedEmail.value === DEFAULT_EMAIL) return defaultAccount.label
  return selectedAccount.value?.label || selectedAccount.value?.email || 'Unknown Account'
})

// Actions
function selectAccount(email) {
  selectedEmail.value = email || DEFAULT_EMAIL
  const account = savedAccounts.value.find(a => a.email === email) || { ...defaultAccount }
  emit('selected', account)
  isDropdownOpen.value = false
}

function saveAccount({ email, password, authKey, label }) {
  const trimmedEmail = (email || '').trim()
  if (!trimmedEmail) return

  const existingIdx = savedAccounts.value.findIndex(a => a.email.toLowerCase() === trimmedEmail.toLowerCase())
  
  const newAccount = {
    email: trimmedEmail,
    label: (label || label === '') ? label : (existingIdx >= 0 ? savedAccounts.value[existingIdx].label : trimmedEmail),
    password: password || '',
    authKey: authKey || '',
    updatedAt: Date.now()
  }

  if (existingIdx >= 0) {
    savedAccounts.value[existingIdx] = { ...savedAccounts.value[existingIdx], ...newAccount }
  } else {
    // Default label if new
    if (!newAccount.label) newAccount.label = trimmedEmail
    savedAccounts.value.push(newAccount)
  }
}

function confirmRemove() {
  if (!selectedEmail.value) return
  showConfirm.value = true
}

function handleRemoveConfirm() {
  savedAccounts.value = savedAccounts.value.filter(a => a.email !== selectedEmail.value)
  selectedEmail.value = DEFAULT_EMAIL
  emit('selected', { ...defaultAccount })
  showConfirm.value = false
}

function startRename() {
  if (!selectedAccount.value) return
  editLabel.value = selectedAccount.value.label
  isEditing.value = true
}

function saveRename() {
  if (!selectedAccount.value) return
  const idx = savedAccounts.value.findIndex(a => a.email === selectedEmail.value)
  if (idx >= 0) {
    savedAccounts.value[idx].label = editLabel.value || savedAccounts.value[idx].email
  }
  isEditing.value = false
}

// Click Outside
function handleClickOutside(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Expose methods for parent
defineExpose({
  save: saveAccount
})
</script>

<template>
  <div class="w-full space-y-2">
    <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
      Switch Account
    </label>
    
    <div class="flex gap-2">
      <!-- Custom Dropdown -->
      <div class="relative flex-grow" ref="dropdownRef">
        <button 
          @click="isDropdownOpen = !isDropdownOpen"
          type="button"
          class="w-full h-11 pl-4 pr-10 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-left flex items-center"
        >
          <span class="truncate block w-full">{{ currentLabel }}</span>
          
          <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-500">
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
            class="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 max-h-60 overflow-auto custom-scrollbar p-1 space-y-0.5"
          >
            <!-- Default Option -->
             <button
                @click="selectAccount(DEFAULT_EMAIL)"
                class="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between group transition-colors"
                :class="selectedEmail === DEFAULT_EMAIL ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'"
              >
                <span>{{ defaultAccount.label }}</span>
                <Check v-if="selectedEmail === DEFAULT_EMAIL" class="w-4 h-4" />
              </button>

             <!-- Saved Accounts -->
             <button
                v-for="acc in displayAccounts" 
                :key="acc.email" 
                @click="selectAccount(acc.email)"
                class="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between group transition-colors"
                :class="selectedEmail === acc.email ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'"
              >
                <div class="flex flex-col truncate pr-2">
                  <span class="font-medium truncate">{{ acc.label }}</span>
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
          @click="startRename"
          title="Rename Account"
          class="h-11 w-11 flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-900 transition-all"
        >
          <Edit2 class="w-4 h-4" />
        </button>
        
        <button 
          @click="confirmRemove"
          title="Remove Account"
          class="h-11 w-11 flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-500 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900 transition-all"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Edit Label Modal/Input (Inline for simplicity) -->
    <div v-if="isEditing" class="flex gap-2 items-center mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
      <input 
        v-model="editLabel"
        ref="editInput"
        class="flex-grow bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        placeholder="Account Label"
        @keyup.enter="saveRename"
        @keyup.esc="isEditing = false"
      />
      <button 
        @click="saveRename"
        class="text-xs font-bold text-blue-600 dark:text-blue-400 px-3 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
      >
        Save
      </button>
      <button 
        @click="isEditing = false"
        class="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-2 py-1.5"
      >
        Cancel
      </button>
    </div>

    <!-- Confirmation Modal -->
    <ConfirmationModal 
      :show="showConfirm"
      title="Remove Account?"
      :message="`Are you sure you want to remove '${currentLabel}' from saved accounts?`"
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
  @apply bg-zinc-200 dark:bg-zinc-600 rounded-full;
}
</style>
