<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ChevronDown, Edit2, Trash2, User } from 'lucide-vue-next'
import { useStorage } from '@vueuse/core'

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

// Computed
const displayAccounts = computed(() => {
  // Sort accounts by label/email
  const sorted = [...savedAccounts.value].sort((a, b) => {
    const left = (a.label || a.email || '').toLowerCase()
    const right = (b.label || b.email || '').toLowerCase()
    return left.localeCompare(right)
  })
  return [defaultAccount, ...sorted]
})

const selectedAccount = computed(() => 
  savedAccounts.value.find(a => a.email === selectedEmail.value)
)

// Actions
function selectAccount(email) {
  selectedEmail.value = email || DEFAULT_EMAIL
  const account = savedAccounts.value.find(a => a.email === email) || { ...defaultAccount }
  emit('selected', account)
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

function removeSelected() {
  if (!selectedEmail.value) return
  
  if (confirm(`Remove saved account "${selectedAccount.value?.label || selectedEmail.value}"?`)) {
    savedAccounts.value = savedAccounts.value.filter(a => a.email !== selectedEmail.value)
    selectedEmail.value = DEFAULT_EMAIL
    emit('selected', { ...defaultAccount })
  }
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
      <div class="relative flex-grow">
        <select
          v-model="selectedEmail"
          @change="selectAccount($event.target.value)"
          class="w-full h-11 pl-4 pr-10 appearance-none bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
        >
          <option :value="DEFAULT_EMAIL">{{ defaultAccount.label }}</option>
          <option 
            v-for="acc in savedAccounts" 
            :key="acc.email" 
            :value="acc.email"
          >
            {{ acc.label }} {{ acc.label !== acc.email ? `(${acc.email})` : '' }}
          </option>
        </select>
        
        <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-500">
          <ChevronDown class="w-4 h-4" />
        </div>
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
          @click="removeSelected"
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
</style>
