const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepClone(value) {
  if (value === undefined) {
    return undefined
  }

  return JSON.parse(JSON.stringify(value))
}

export function getResourceName(resource) {
  if (typeof resource === 'string') {
    return resource.trim()
  }

  if (isPlainObject(resource) && typeof resource.name === 'string') {
    return resource.name.trim()
  }

  return ''
}

export function getManifestResources(manifest) {
  return Array.isArray(manifest?.resources) ? manifest.resources : []
}

export function hasManifestResource(manifest, name) {
  const target = typeof name === 'string' ? name.trim() : ''

  if (!target) {
    return false
  }

  return getManifestResources(manifest).some((resource) => getResourceName(resource) === target)
}

export function findManifestResource(manifest, name) {
  const target = typeof name === 'string' ? name.trim() : ''

  if (!target) {
    return undefined
  }

  return getManifestResources(manifest).find((resource) => getResourceName(resource) === target)
}

export function removeManifestResource(manifest, name) {
  if (!isPlainObject(manifest)) {
    return manifest
  }

  const target = typeof name === 'string' ? name.trim() : ''

  if (!target) {
    return {
      ...manifest,
      resources: getManifestResources(manifest),
    }
  }

  return {
    ...manifest,
    resources: getManifestResources(manifest).filter((resource) => getResourceName(resource) !== target),
  }
}

export function getCatalogBackupKey(catalog, index) {
  if (isPlainObject(catalog) && typeof catalog.__dragKey === 'string' && catalog.__dragKey.trim()) {
    return `drag:${catalog.__dragKey}`
  }

  return `index:${index}`
}

export function findCatalogBackup(catalog, index, backups) {
  if (!Array.isArray(backups)) {
    return undefined
  }

  const backupKey = getCatalogBackupKey(catalog, index)
  const backupKeyMatch = backups.find((backup) => (
    isPlainObject(backup) &&
    typeof backup.backupKey === 'string' &&
    backup.backupKey &&
    backup.backupKey === backupKey
  ))

  if (backupKeyMatch) {
    return backupKeyMatch
  }

  return backups.find((backup) => (
    isPlainObject(backup) &&
    Number.isInteger(backup.originalIndex) &&
    backup.originalIndex === index
  ))
}

export function restoreCatalogExtraBackups(catalogs, backups) {
  if (!Array.isArray(catalogs) || !Array.isArray(backups)) {
    return Array.isArray(catalogs) ? catalogs : []
  }

  catalogs.forEach((catalog, index) => {
    const backup = findCatalogBackup(catalog, index, backups)

    if (backup && Object.prototype.hasOwnProperty.call(backup, 'extra')) {
      catalog.extra = deepClone(backup.extra)
    }
  })

  return catalogs
}

// Normalize user-provided manifest URLs without throwing.
// Keeps current stremio:// -> https:// behavior, rejects malformed or non-http(s) URLs,
// and returns the browser-serialized URL string so callers store one canonical value.
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
    ...addon,
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
