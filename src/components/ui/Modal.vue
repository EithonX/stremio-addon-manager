<script>
// Reference-counted body scroll lock shared across ALL Modal instances.
// Must live in a plain <script> block: <script setup> top-level state is
// compiled into setup() and would be per-instance, defeating the counter.
// Nested/overlapping modals stay locked until the last one releases its lock.
let modalBodyLockCount = 0
let previousBodyOverflow = ''
let modalStack = []
let nextModalId = 1
let previousAppInert = false

function lockBodyScroll() {
  if (typeof document === 'undefined') return
  if (modalBodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const app = document.getElementById('app')
    if (app) { previousAppInert = app.inert; app.inert = true }
  }
  modalBodyLockCount += 1
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return
  if (modalBodyLockCount === 0) return
  modalBodyLockCount -= 1
  if (modalBodyLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow
    previousBodyOverflow = ''
    const app = document.getElementById('app')
    if (app) app.inert = previousAppInert
  }
}

function registerModal(id) {
  if (!modalStack.includes(id)) {
    modalStack.push(id)
  }
}

function unregisterModal(id) {
  modalStack = modalStack.filter((modalId) => modalId !== id)
}

function isTopModal(id) {
  return modalStack[modalStack.length - 1] === id
}
</script>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { X } from '@lucide/vue'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  show: {
    type: Boolean,
    default: false
  },
  maxWidth: {
    type: String,
    default: 'max-w-2xl'
  },
  noPadding: {
    type: Boolean,
    default: false
  },
  noHeader: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const isOpen = ref(props.show)
const isVisible = ref(props.show)
const contentRef = useTemplateRef('content')
const panelRef = useTemplateRef('panel')
const modalId = nextModalId++
const titleId = `sam-dialog-${modalId}`
let returnFocus = null
let closeTimerId = null
// Whether this instance currently holds a body scroll lock (prevents double lock/unlock).
let hasBodyLock = false
let isRegisteredInStack = false

function acquireBodyLock() {
  if (!hasBodyLock) {
    lockBodyScroll()
    hasBodyLock = true
  }
}

function releaseBodyLock() {
  if (hasBodyLock) {
    unlockBodyScroll()
    hasBodyLock = false
  }
}

function registerInModalStack() {
  if (!isRegisteredInStack) {
    registerModal(modalId)
    isRegisteredInStack = true
  }
}

function unregisterFromModalStack() {
  if (isRegisteredInStack) {
    unregisterModal(modalId)
    isRegisteredInStack = false
  }
}

function clearCloseTimer() {
  if (closeTimerId !== null) {
    clearTimeout(closeTimerId)
    closeTimerId = null
  }
}

watch(() => props.show, (val) => {
  clearCloseTimer()
  if (val) {
    returnFocus = document.activeElement
    isOpen.value = true
    // Small delay to allow enter transition
    requestAnimationFrame(() => {
      isVisible.value = true
    })
    registerInModalStack()
    acquireBodyLock()
    nextTick(() => {
      if (!props.show || !isTopModal(modalId)) return
      const preferred = panelRef.value?.querySelector('[autofocus], input:not([type="hidden"]), textarea, select')
      ;(preferred || focusableElements()[0] || panelRef.value)?.focus()
    })
  } else {
    isVisible.value = false
    // Wait for transition to finish before hiding
    closeTimerId = setTimeout(() => {
      isOpen.value = false
      closeTimerId = null
    }, 300)
    unregisterFromModalStack()
    releaseBodyLock()
    restoreFocus()
  }
}, { immediate: true })

const close = () => {
  emit('close')
}
function focusableElements() {
  return [...(panelRef.value?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]') || [])].filter(element => element.getClientRects().length && !element.closest('[inert]'))
}
function restoreFocus() {
  nextTick(() => { if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus() })
}

// Close on Escape key
const handleKeydown = (e) => {
  if (!props.show || !isTopModal(modalId)) return
  if (e.key === 'Escape' && props.show && isTopModal(modalId)) {
    e.preventDefault()
    close()
  }
  if (e.key === 'Tab') {
    const elements = focusableElements()
    const first = elements[0], last = elements[elements.length - 1]
    if (!first) { e.preventDefault(); panelRef.value?.focus(); return }
    if (!panelRef.value?.contains(document.activeElement) || e.shiftKey && document.activeElement === first || !e.shiftKey && document.activeElement === last) {
      e.preventDefault(); (e.shiftKey ? last : first).focus()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  clearCloseTimer()
  document.removeEventListener('keydown', handleKeydown)
  unregisterFromModalStack()
  releaseBodyLock()
  restoreFocus()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" :aria-labelledby="!noHeader ? titleId : undefined" :aria-label="noHeader ? title || 'Dialog' : undefined">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        :class="isVisible ? 'opacity-100' : 'opacity-0'" @click="close"></div>

      <!-- Modal Panel -->
      <div 
        ref="panel"
        tabindex="-1"
        class="relative w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl ring-1 ring-zinc-900/5 dark:ring-white/10 flex flex-col max-h-full transition-all duration-300 transform scale-95 opacity-0"
        :class="[
          maxWidth, 
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        ]"
      >
        <!-- Header -->
        <div v-if="!noHeader" class="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h3 :id="titleId" class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ title || 'Dialog' }}
          </h3>
          <button 
            aria-label="Close dialog"
            @click="close"
            class="p-2 -mr-2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Content (Scrollable) -->
        <div ref="content" class="flex-1 overflow-y-auto custom-scrollbar" :class="noPadding ? '' : 'p-6'">
          <slot :scroll-container="contentRef"></slot>
        </div>

        <!-- Footer (Optional) -->
        <div v-if="$slots.footer" class="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-b-2xl flex justify-end gap-3">
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgb(228 228 231);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgb(212 212 216);
}
</style>
