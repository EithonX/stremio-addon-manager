<script setup>
import { AlertTriangle, Info } from 'lucide-vue-next'
import Modal from './Modal.vue'

defineProps({
  show: Boolean,
  title: String,
  message: String,
  confirmText: { type: String, default: 'Confirm' },
  cancelText: { type: String, default: 'Cancel' },
  type: { type: String, default: 'danger' }, // 'danger' | 'info'
  isLoading: Boolean
})

const emit = defineEmits(['close', 'confirm'])
</script>

<template>
  <Modal 
    :show="show" 
    @close="$emit('close')"
    max-width="max-w-sm"
    :title="title || 'Confirm Action'"
    no-padding
  >
    <div class="p-6 text-center">
      <div 
        class="mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-6 relative"
        :class="type === 'danger' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'"
      >
         <!-- Pulse effect -->
         <div class="absolute inset-0 rounded-full animate-ping opacity-20" :class="type === 'danger' ? 'bg-red-400' : 'bg-blue-400'"></div>
         <AlertTriangle v-if="type === 'danger'" class="w-8 h-8 relative z-10" />
         <Info v-else class="w-8 h-8 relative z-10" />
      </div>

      <h3 class="text-lg font-bold text-zinc-900 dark:text-white mb-2">
        {{ title }}
      </h3>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-8 leading-relaxed">
        {{ message }}
      </p>

      <div class="flex gap-3 justify-center">
        <button 
          @click="$emit('close')"
          class="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700"
        >
          {{ cancelText }}
        </button>
        <button 
          @click="$emit('confirm')"
          class="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all shadow-md active:scale-95"
          :class="type === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </Modal>
</template>
