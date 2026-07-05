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
import { normalizeAddonCollection } from './features/addons/addonCollection'
import { getAddonCollection, loginToStremio, setAddonCollection } from './features/api/stremioApi'
import { useSavedAccounts } from './features/accounts/useSavedAccounts'
import { useNotification } from './composables/useNotification'

// Logic
const authKey = useStorage('stremio_auth_key', '')
const step = ref(1)
const isLoading = ref(false)
const isAuthChecking = ref(true)
const addons = ref([])

const { savedAccounts, ensureNormalized, upsertSavedAccount } = useSavedAccounts()
const { notification, notify } = useNotification()
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

const loadAddons = async () => {
  isLoading.value = true
  try {
    const data = await getAddonCollection(authKey.value)
    if (Array.isArray(data.result?.addons)) {
      addons.value = normalizeAddonCollection(data.result.addons)
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
    isLoading.value = false
  }
}

const login = async ({ email, password, rememberMe, protectWithPin, rememberPin }) => {
  isLoading.value = true
  try {
    const data = await loginToStremio(email, password)
    if (data.result?.authKey) {
      if (rememberMe && protectWithPin && (!rememberPin || rememberPin.length < 4)) {
        throw new Error('PIN must be at least 4 characters to protect saved AuthKey.')
      }

      authKey.value = data.result.authKey
      currentSessionEmail.value = email
      if (rememberMe) {
          const normalizedEmail = (email || '').trim()
          const existing = savedAccounts.value.find(
            (account) => account.email.toLowerCase() === normalizedEmail.toLowerCase(),
          )
          const authKeyHash = await hashAuthKey(data.result.authKey)
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

          upsertSavedAccount(newAcc)
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
  await loadAddons()
}

const syncAddons = async () => {
  isLoading.value = true
  try {
    const data = await setAddonCollection(authKey.value, addons.value)
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

const handleAddonsUpdate = (nextAddons) => {
  addons.value = normalizeAddonCollection(nextAddons)
}

const removeAddon = (index) => {
  addons.value = addons.value.filter((_, addonIndex) => addonIndex !== index)
}

onMounted(() => {
  ensureNormalized()

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
          @update:addons="handleAddonsUpdate" 
          @sync="syncAddons" 
          @reload="loadAddons"
          @remove="removeAddon"
        />
      </template>
    </main>

    <Footer />
  </div>
</template>
