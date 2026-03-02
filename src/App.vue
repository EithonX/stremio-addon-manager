<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { CheckCircle2, AlertCircle } from 'lucide-vue-next'

import NavBar from './components/NavBar.vue'
import LandingPage from './components/LandingPage.vue'
import ManagerDashboard from './components/ManagerDashboard.vue'
import Footer from './components/Footer.vue'

import SkeletonLoader from './components/ui/SkeletonLoader.vue'
import { encryptAuthKey, hashAuthKey } from './utils/cryptoVault'

// Logic
const API_BASE = "/api/"
const authKey = useStorage('stremio_auth_key', '')
const step = ref(1)
const isLoading = ref(false)
const isAuthChecking = ref(true)
const notification = ref({ show: false, type: '', message: '' })
const addons = ref([])

const savedAccounts = useStorage('sam_saved_accounts', [])
const currentSessionEmail = ref('')
const currentAuthKeyHash = ref('')

const currentUserEmail = computed(() => {
  if (!authKey.value) return ''
  if (currentSessionEmail.value) return currentSessionEmail.value
  const accounts = Array.isArray(savedAccounts.value) ? savedAccounts.value : []
  const account = accounts.find((a) => (
    (a.authKey && a.authKey === authKey.value) ||
    (currentAuthKeyHash.value && a.authKeyHash === currentAuthKeyHash.value)
  ))
  return account?.label || account?.email || 'Guest'
})

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
  } finally {
    isAuthChecking.value = false
  }
}

const login = async ({ email, password, rememberMe, protectWithPin, rememberPin }) => {
  isLoading.value = true
  try {
    const res = await fetch(`${API_BASE}login`, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (data.result?.authKey) {
      if (rememberMe && protectWithPin && (!rememberPin || rememberPin.length < 4)) {
        throw new Error('PIN must be at least 4 characters to protect saved AuthKey.')
      }

      authKey.value = data.result.authKey
      currentSessionEmail.value = email
      if (rememberMe) {
          const idx = savedAccounts.value.findIndex(a => (a.email || '').toLowerCase() === email.toLowerCase())
          const existing = idx >= 0 ? savedAccounts.value[idx] : null
          const authKeyHash = await hashAuthKey(data.result.authKey)
          const normalizedEmail = (email || '').trim()
          const rememberSecurely = Boolean(protectWithPin)

          const newAcc = {
            email: normalizedEmail,
            authKeyHash,
            protected: rememberSecurely,
            authKey: data.result.authKey,
            label: existing?.label || normalizedEmail,
            updatedAt: Date.now()
          }

          if (rememberSecurely) {
            const encrypted = await encryptAuthKey(data.result.authKey, rememberPin)
            delete newAcc.authKey
            Object.assign(newAcc, encrypted)
          }

          if (idx >= 0) savedAccounts.value[idx] = newAcc
          else savedAccounts.value.push(newAcc)
      }
      
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

const logout = () => {
  authKey.value = null
  currentSessionEmail.value = ''
  addons.value = []
  step.value = 1
  notify('success', 'Disconnected successfully')
}

onMounted(() => {
  if (!Array.isArray(savedAccounts.value)) {
    savedAccounts.value = []
  } else {
    // Security hardening: drop legacy password fields and normalize saved account shape.
    savedAccounts.value = savedAccounts.value
      .filter((account) => account && typeof account.email === 'string' && account.email.trim())
      .map((account) => {
        const clean = {
          email: account.email.trim(),
          label: account.label || account.email.trim(),
          updatedAt: account.updatedAt || Date.now(),
          authKeyHash: account.authKeyHash || '',
          protected: Boolean(account.protected)
        }

        if (clean.protected && account.authKeyEncrypted && account.authKeyIv && account.authKeySalt) {
          clean.authKeyEncrypted = account.authKeyEncrypted
          clean.authKeyIv = account.authKeyIv
          clean.authKeySalt = account.authKeySalt
          clean.authKeyKdfIterations = account.authKeyKdfIterations || 310000
        } else if (typeof account.authKey === 'string' && account.authKey) {
          clean.authKey = account.authKey
          clean.protected = false
        }

        return clean
      })
  }

  if (authKey.value) {
    loadAddons()
  } else {
    isAuthChecking.value = false
  }
})

watch(authKey, async (value) => {
  if (!value) {
    currentAuthKeyHash.value = ''
    return
  }
  try {
    currentAuthKeyHash.value = await hashAuthKey(value)
  } catch {
    currentAuthKeyHash.value = ''
  }
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
    <NavBar :isLoggedIn="step === 2" :userEmail="currentUserEmail" @logout="logout" />
    
    <main class="flex-grow">
      <transition enter-active-class="transition ease-out duration-300" enter-from-class="translate-y-full opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition ease-in duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="notification.show" :class="notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'" class="fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 font-medium">
          <AlertCircle v-if="notification.type === 'error'" class="w-5 h-5" />
          <CheckCircle2 v-else class="w-5 h-5" />
          {{ notification.message }}
        </div>
      </transition>

      <SkeletonLoader v-if="isAuthChecking" />

      <template v-else>
        <LandingPage v-if="step === 1" :isLoading="isLoading" @login="login" @loginKey="loginKey" />
        
        <ManagerDashboard 
          v-else 
          :addons="addons" 
          :isLoading="isLoading" 
          @update:addons="addons = $event" 
          @sync="syncAddons" 
          @remove="addons.splice($event, 1)"
        />
      </template>
    </main>

    <Footer />
  </div>
</template>
