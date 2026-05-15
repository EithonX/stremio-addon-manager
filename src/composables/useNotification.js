import { onUnmounted, ref } from 'vue'

export function useNotification() {
  const notification = ref({
    show: false,
    type: '',
    message: '',
  })

  let hideTimeoutId = null

  function clearHideTimer() {
    if (hideTimeoutId !== null) {
      clearTimeout(hideTimeoutId)
      hideTimeoutId = null
    }
  }

  function hideNotification() {
    notification.value = {
      ...notification.value,
      show: false,
    }
  }

  function notify(type, message, duration = 4000) {
    clearHideTimer()
    notification.value = {
      show: true,
      type,
      message,
    }

    hideTimeoutId = setTimeout(() => {
      hideNotification()
      hideTimeoutId = null
    }, duration)
  }

  onUnmounted(() => {
    clearHideTimer()
  })

  return {
    notification,
    notify,
    hideNotification,
  }
}
