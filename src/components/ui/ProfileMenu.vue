<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { User, LogOut, ChevronDown, Repeat } from 'lucide-vue-next'

const props = defineProps({
  email: {
    type: String,
    default: 'User'
  }
})

const emit = defineEmits(['logout', 'switch-account'])

const isOpen = ref(false)
const menuRef = ref(null)

const toggleMenu = () => isOpen.value = !isOpen.value

const handleClickOutside = (event) => {
  if (menuRef.value && !menuRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="relative" ref="menuRef">
    <button 
      @click="toggleMenu"
      class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
    >
      <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
        <User class="w-4 h-4" />
      </div>
      <ChevronDown class="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300 transition-colors" />
    </button>

    <transition 
      enter-active-class="transition duration-100 ease-out" 
      enter-from-class="transform scale-95 opacity-0" 
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in" 
      leave-from-class="transform scale-100 opacity-100" 
      leave-to-class="transform scale-95 opacity-0"
    >
      <div 
        v-if="isOpen" 
        class="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 py-1 z-50 origin-top-right"
      >
        <div class="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Signed in as</p>
          <p class="text-sm font-bold text-zinc-900 dark:text-white truncate" :title="email">{{ email }}</p>
        </div>

        <button 
          @click="$emit('switch-account')" 
          class="w-full text-left px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center gap-2 transition-colors"
        >
          <Repeat class="w-4 h-4" />
          Switch Account
        </button>

        <button 
          @click="$emit('logout')" 
          class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
        >
          <LogOut class="w-4 h-4" />
          Log Out
        </button>
      </div>
    </transition>
  </div>
</template>
