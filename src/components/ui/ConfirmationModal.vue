<script setup>
import { AlertTriangle, Info } from '@lucide/vue'
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
    max-width="max-w-md"
    :title="title || 'Confirm Action'"
    no-padding
  >
    <div class="p-6 pt-5">
      <div class="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl" :class="type === 'danger' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'">
        <AlertTriangle v-if="type === 'danger'" class="h-5 w-5" />
        <Info v-else class="h-5 w-5" />
      </div>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
        {{ message }}
      </p>

      <div class="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button 
          @click="$emit('close')"
          type="button"
          :disabled="isLoading"
          class="min-h-11 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700"
        >
          {{ cancelText }}
        </button>
        <button 
          @click="$emit('confirm')"
          type="button"
          :disabled="isLoading"
          class="min-h-11 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all shadow-md active:scale-95"
          :class="type === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </Modal>
</template>
