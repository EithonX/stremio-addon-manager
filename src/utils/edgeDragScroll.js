const EDGE_SIZE = 160
const MIN_SPEED = 6
const MAX_SPEED = 30

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getScrollDelta(position, start, end) {
  if (position < start + EDGE_SIZE) {
    const intensity = clamp((start + EDGE_SIZE - position) / EDGE_SIZE, 0, 1)
    return -Math.max(MIN_SPEED, Math.ceil(MAX_SPEED * intensity * intensity))
  }

  if (position > end - EDGE_SIZE) {
    const intensity = clamp((position - (end - EDGE_SIZE)) / EDGE_SIZE, 0, 1)
    return Math.max(MIN_SPEED, Math.ceil(MAX_SPEED * intensity * intensity))
  }

  return 0
}

function scrollWindow(delta) {
  const currentTop = window.scrollY || document.documentElement.scrollTop
  const maxTop = document.documentElement.scrollHeight - window.innerHeight
  if ((delta < 0 && currentTop <= 0) || (delta > 0 && currentTop >= maxTop)) return
  window.scrollBy(0, delta)
}

function scrollElement(element, delta) {
  if (!element) return
  const maxTop = element.scrollHeight - element.clientHeight
  if ((delta < 0 && element.scrollTop <= 0) || (delta > 0 && element.scrollTop >= maxTop)) return
  element.scrollTop += delta
}

export function createEdgeDragScroll(getTarget) {
  let frameId = null
  let active = false
  let lastClientY = null

  const updatePointer = (event) => {
    if (typeof event.clientY === 'number') {
      lastClientY = event.clientY
    }
  }

  const tick = () => {
    if (!active) return

    const target = getTarget?.()
    if (target && typeof lastClientY === 'number') {
      if (target === window) {
        const delta = getScrollDelta(lastClientY, 0, window.innerHeight)
        if (delta !== 0) scrollWindow(delta)
      } else {
        const bounds = target.getBoundingClientRect()
        const delta = getScrollDelta(lastClientY, bounds.top, bounds.bottom)
        if (delta !== 0) scrollElement(target, delta)
      }
    }

    frameId = window.requestAnimationFrame(tick)
  }

  const start = () => {
    if (active) return
    active = true
    document.addEventListener('dragover', updatePointer, { capture: true, passive: true })
    frameId = window.requestAnimationFrame(tick)
  }

  const stop = () => {
    active = false
    lastClientY = null
    document.removeEventListener('dragover', updatePointer, { capture: true })
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  return { start, stop }
}
