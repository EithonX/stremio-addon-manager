const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeManifestUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return ''
  }

  let normalized = rawUrl.trim()

  if (normalized.startsWith('stremio://')) {
    normalized = `https://${normalized.slice('stremio://'.length)}`
  }

  try {
    const parsed = new URL(normalized)

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return ''
    }

    return parsed.toString()
  } catch {
    return ''
  }
}

export function normalizeAddonRecord(addon) {
  if (!isPlainObject(addon)) {
    return null
  }

  const transportUrl = normalizeManifestUrl(addon.transportUrl)
  const manifest = isPlainObject(addon.manifest) ? addon.manifest : null

  if (!transportUrl || !manifest || !manifest.id || !manifest.version) {
    return null
  }

  return {
    transportUrl,
    manifest: {
      ...manifest,
      name:
        typeof manifest.name === 'string' && manifest.name.trim()
          ? manifest.name.trim()
          : String(manifest.id),
      description:
        typeof manifest.description === 'string' ? manifest.description : '',
    },
    flags: isPlainObject(addon.flags) ? { ...addon.flags } : {},
  }
}

export function normalizeAddonCollection(addons) {
  if (!Array.isArray(addons)) {
    return []
  }

  return addons.map(normalizeAddonRecord).filter(Boolean)
}

export function parseAddonBackup(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.addons)) {
    throw new Error('Invalid backup file format.')
  }

  const normalizedAddons = normalizeAddonCollection(payload.addons)

  if (normalizedAddons.length !== payload.addons.length) {
    throw new Error('Backup contains one or more invalid addon entries.')
  }

  return normalizedAddons
}
