<script setup>
import { computed, shallowRef, watch } from 'vue'
import { GripVertical, Trash2, ExternalLink, ShieldCheck, Copy, Settings } from '@lucide/vue'
import AddonFeatures from './AddonFeatures.vue'
import { safeImageUrl } from '../features/addons/manifestSchema.js'

const props = defineProps({
  addon: {
    type: Object,
    required: true
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  isBusy: { type: Boolean, default: false },
})

const emit = defineEmits(['remove', 'edit', 'move'])

const manifest = computed(() => props.addon.manifest || {})
const isProtected = computed(() => props.addon.flags?.protected)
const logo = computed(() => safeImageUrl(manifest.value.logo) || 'https://www.stremio.com/website/stremio-logo-small.png')
const logoFailed = shallowRef(false)

const displayInitial = computed(() => ((manifest.value.name || '').trim().charAt(0) || '?').toUpperCase())

const manifestDomain = computed(() => {
  if (!props.addon.transportUrl) return ''
  try {
    return new URL(props.addon.transportUrl.replace('stremio://', 'https://')).hostname
  } catch {
    return ''
  }
})

const configureUrl = computed(() => {
  try {
    const url = new URL(props.addon.transportUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (!/\/manifest\.json$/.test(url.pathname)) return null
    url.pathname = url.pathname.replace(/\/manifest\.json$/, '/configure')
    return url.href
  } catch { return null }
})

const copyUrl = async () => {
  try {
    await navigator.clipboard.writeText(props.addon.transportUrl)
  } catch (error) {
    alert('Failed to copy manifest URL. Please copy it manually.')
  }
}

watch(logo, () => {
  logoFailed.value = false
})
</script>

<template>
  <div class="reorder-card group relative grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 rounded-2xl border border-zinc-200 bg-white/85 p-2.5 shadow-sm shadow-zinc-200/70 backdrop-blur-sm transition-all hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 dark:border-white/5 dark:bg-zinc-900/70 dark:shadow-black/20 dark:hover:border-blue-500/40 sm:flex sm:flex-row sm:gap-3 sm:p-3">
    <div 
      class="drag-handle row-span-2 -ml-1 touch-none self-center rounded-xl p-1.5 transition-colors sm:ml-0"
      role="button"
      tabindex="0"
      aria-label="Reorder addon: drag or use Arrow Up and Arrow Down"
      aria-keyshortcuts="ArrowUp ArrowDown"
      @keydown.up.prevent="!isLocked && !isBusy && emit('move', -1)"
      @keydown.down.prevent="!isLocked && !isBusy && emit('move', 1)"
      :aria-disabled="isLocked"
      :class="isLocked ? 'cursor-not-allowed text-zinc-200 dark:text-zinc-800' : 'cursor-grab text-zinc-300 hover:bg-blue-50 hover:text-blue-500 active:cursor-grabbing dark:text-zinc-700 dark:hover:bg-blue-500/10 dark:hover:text-blue-300'"
    >
      <GripVertical class="h-4 w-4 sm:h-5 sm:w-5" />
    </div>

    <div class="relative row-span-2 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 text-sm font-bold text-zinc-400 shadow-inner dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-600 sm:h-12 sm:w-12">
      <span>{{ displayInitial }}</span>
      <img 
        v-if="!logoFailed"
        :src="logo" 
        class="absolute inset-0 h-full w-full object-contain bg-white p-1.5 dark:bg-zinc-950"
        loading="lazy"
        alt=""
        @error="logoFailed = true"
      />
    </div>

    <div class="min-w-0 flex-grow overflow-hidden">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="min-w-0 line-clamp-2 break-words text-sm font-semibold text-zinc-950 dark:text-zinc-100 sm:line-clamp-none sm:truncate sm:text-base">
          {{ manifest.name }}
        </h3>
        <span v-if="manifest.version" class="hidden shrink-0 rounded-full border border-zinc-200 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-zinc-500 dark:border-white/10 dark:bg-zinc-800/80 dark:text-zinc-400 sm:inline-flex">
          v{{ manifest.version }}
        </span>
      </div>
      
      <p class="hidden truncate text-sm text-zinc-500 dark:text-zinc-400 sm:block">
        {{ manifest.description }}
      </p>

      <div class="hidden items-center gap-2 sm:flex">
        <span v-if="manifestDomain" class="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
          {{ manifestDomain }}
        </span>
        <AddonFeatures :manifest="manifest" class="hidden lg:flex" />
      </div>
    </div>

    <div class="flex shrink-0 items-center justify-self-end gap-0.5 self-center rounded-xl border border-zinc-200 bg-zinc-50/80 p-1 dark:border-white/10 dark:bg-zinc-950/45">
      <a 
        v-if="manifest.behaviorHints?.configurable && configureUrl"
        :href="configureUrl" 
        target="_blank"
        rel="noreferrer"
        class="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-white hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-300"
        title="Configure Addon"
        aria-label="Configure addon"
      >
        <ExternalLink class="h-4 w-4" />
      </a>

      <button 
        type="button"
        @click="copyUrl"
        class="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-white hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        title="Copy Manifest URL"
        aria-label="Copy manifest URL"
      >
        <Copy class="h-4 w-4" />
      </button>

      <button 
        type="button"
        :disabled="isBusy"
        @click="$emit('edit')"
        class="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-white hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-300"
        title="Edit Manifest"
        aria-label="Edit manifest"
      >
        <Settings class="h-4 w-4" />
      </button>

      <button 
        v-if="!isProtected" 
        type="button"
        :disabled="isBusy"
        @click="$emit('remove')"
        class="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
        title="Remove Addon"
        aria-label="Remove addon"
      >
        <Trash2 class="h-4 w-4" />
      </button>
      
      <div v-else class="cursor-not-allowed rounded-lg p-1.5 text-zinc-300 dark:text-zinc-600" title="Protected System Addon" aria-label="Protected system addon">
        <ShieldCheck class="h-4 w-4" />
      </div>
    </div>
  </div>
</template>
