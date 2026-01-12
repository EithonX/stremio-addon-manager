<script setup>
import { X, AlertTriangle, HelpCircle } from 'lucide-vue-next'
defineProps(['isOpen'])
defineEmits(['close'])
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div @click="$emit('close')" class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"></div>

    <div class="glass-card w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6 sm:p-8 relative animate-modal-pop shadow-2xl bg-midnight-950">
      <button @click="$emit('close')" class="absolute top-4 right-4 text-slate-500 hover:text-white">
        <X class="w-6 h-6" />
      </button>

      <div class="space-y-6">
        <header>
          <h2 class="text-2xl font-bold text-white mb-2">About & FAQ</h2>
          <p class="text-slate-400 text-sm">Everything you need to know about managing your addons safely.</p>
        </header>

        <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-4">
          <AlertTriangle class="w-6 h-6 text-red-500 shrink-0" />
          <div class="space-y-1">
            <h3 class="font-bold text-red-400 text-sm uppercase">Disclaimer</h3>
            <p class="text-xs text-red-200/80 leading-relaxed">
              This is a community tool. It uses the official Stremio API but is not an official product. 
              We do not store your credentials. Use at your own risk.
            </p>
          </div>
        </div>

        <div class="space-y-4">
          <details class="group bg-white/5 rounded-xl border border-white/5 open:bg-white/10 transition-colors">
            <summary class="flex items-center justify-between p-4 cursor-pointer font-medium text-slate-200">
              <span>Why use this tool?</span>
              <HelpCircle class="w-4 h-4 text-slate-500" />
            </summary>
            <div class="px-4 pb-4 text-sm text-slate-400 leading-relaxed">
              Stremio doesn't natively allow you to reorder installed addons. This often forces users to uninstall and reinstall addons just to fix the list order. This tool solves that by letting you drag-and-drop to reorder instantly.
            </div>
          </details>

          <details class="group bg-white/5 rounded-xl border border-white/5 open:bg-white/10 transition-colors">
            <summary class="flex items-center justify-between p-4 cursor-pointer font-medium text-slate-200">
              <span>Are my credentials safe?</span>
              <HelpCircle class="w-4 h-4 text-slate-500" />
            </summary>
            <div class="px-4 pb-4 text-sm text-slate-400 leading-relaxed">
              Yes. Your password is <strong class="text-white">never</strong> saved. It is used once to generate an <code>AuthKey</code> from Stremio's API. This key is stored locally in your browser so you don't have to login every time, but you can log out to clear it instantly.
            </div>
          </details>

          <details class="group bg-white/5 rounded-xl border border-white/5 open:bg-white/10 transition-colors">
            <summary class="flex items-center justify-between p-4 cursor-pointer font-medium text-slate-200">
              <span>Can I move Cinemeta catalogs?</span>
              <HelpCircle class="w-4 h-4 text-slate-500" />
            </summary>
            <div class="px-4 pb-4 text-sm text-slate-400 leading-relaxed">
              Yes! You can finally move the default Cinemeta catalogs (Popular/Featured) down the list. However, the "Continue Watching" row is pinned by Stremio and cannot be moved.
            </div>
          </details>
          
          <details class="group bg-white/5 rounded-xl border border-white/5 open:bg-white/10 transition-colors">
            <summary class="flex items-center justify-between p-4 cursor-pointer font-medium text-slate-200">
              <span>How to find my AuthKey manually?</span>
              <HelpCircle class="w-4 h-4 text-slate-500" />
            </summary>
            <div class="px-4 pb-4 text-sm text-slate-400 leading-relaxed">
              1. Log into <a href="https://web.stremio.com" target="_blank" class="text-brand-primary underline">Stremio Web</a>.<br>
              2. Open Developer Console (F12).<br>
              3. Type: <code>JSON.parse(localStorage.getItem("profile")).auth.key</code><br>
              4. Copy the result and paste it into the manual login field.
            </div>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>