<script setup>
import { ref, onMounted } from 'vue'
import { useStorage } from '@vueuse/core'
import { CheckCircle2, AlertCircle } from 'lucide-vue-next'

import NavBar from './components/NavBar.vue'
import LandingPage from './components/LandingPage.vue'
import ManagerDashboard from './components/ManagerDashboard.vue'
import Footer from './components/Footer.vue'

// Logic
const API_BASE = "/api/"
const authKey = useStorage('stremio_auth_key', '')
const step = ref(1)
const isLoading = ref(false)
const notification = ref({ show: false, type: '', message: '' })
const addons = ref([])

const notify = (type, msg) => {
  notification.value = { show: true, type, message: msg }
  setTimeout(() => notification.value.show = false, 4000)
}

const loadAddons = async () => {
  try {
    const res = await fetch(`${API_BASE}addonCollectionGet`, {
      method: 'POST',
      body: JSON.stringify({ type: 'AddonCollectionGet', authKey: authKey.value, update: true })
    })
    const data = await res.json()
    if (data.result?.addons) {
      addons.value = data.result.addons
      step.value = 2
    } else {
      throw new Error("Session expired. Please login again.")
    }
  } catch (e) {
    notify('error', e.message)
    authKey.value = null
    step.value = 1
  }
}

const login = async ({ email, password }) => {
  isLoading.value = true
  try {
    const res = await fetch(`${API_BASE}login`, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (data.result?.authKey) {
      authKey.value = data.result.authKey
      await loadAddons()
    } else {
      throw new Error(data.error?.message || "Invalid credentials")
    }
  } catch (e) {
    notify('error', e.message)
  } finally {
    isLoading.value = false
  }
}

const loginKey = async (key) => {
  authKey.value = key
  isLoading.value = true
  await loadAddons()
  isLoading.value = false
}

const syncAddons = async () => {
  isLoading.value = true
  try {
    const res = await fetch(`${API_BASE}addonCollectionSet`, {
      method: 'POST',
      body: JSON.stringify({ type: 'AddonCollectionSet', authKey: authKey.value, addons: addons.value })
    })
    const data = await res.json()
    if (data.result?.success) {
      notify('success', 'Library synced successfully!')
    } else {
      throw new Error("Sync failed.")
    }
  } catch (e) {
    notify('error', e.message)
  } finally {
    isLoading.value = false
  }
}

// 4. This is the logout function called by both components
const logout = () => {
  authKey.value = null
  addons.value = []
  step.value = 1
  notify('success', 'Disconnected successfully')
}

onMounted(() => {
  if (authKey.value) loadAddons()
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
    <NavBar :isLoggedIn="step === 2" @logout="logout" />
    
    <main class="flex-grow">
      <transition enter-active-class="transition ease-out duration-300" enter-from-class="translate-y-full opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition ease-in duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="notification.show" :class="notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'" class="fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 font-medium">
          <AlertCircle v-if="notification.type === 'error'" class="w-5 h-5" />
          <CheckCircle2 v-else class="w-5 h-5" />
          {{ notification.message }}
        </div>
      </transition>

      <LandingPage v-if="step === 1" :isLoading="isLoading" @login="login" @loginKey="loginKey" />
      
      <ManagerDashboard 
        v-else 
        :addons="addons" 
        :isLoading="isLoading" 
        @update:addons="addons = $event" 
        @sync="syncAddons" 
        @remove="addons.splice($event, 1)"
        @logout="logout" 
      />
    </main>

    <Footer />
  </div>
</template>