export class ValidationError extends Error {
  constructor(message, path = 'manifest') {
    super(`${path}: ${message}`)
    this.name = 'ValidationError'
    this.path = path
  }
}

export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/
function requireValue(condition, message, path) {
  if (!condition) throw new ValidationError(message, path)
}
function string(value, path) {
  requireValue(typeof value === 'string' && value.trim().length > 0, 'must be a non-empty string', path)
}
function strings(value, path) {
  requireValue(Array.isArray(value), 'must be an array of strings', path)
  value.forEach((item, i) => string(item, `${path}[${i}]`))
}

export function validateManifest(manifest, path = 'manifest') {
  requireValue(isObject(manifest), 'must be an object', path)
  string(manifest.id, `${path}.id`)
  requireValue(typeof manifest.version === 'string' && SEMVER.test(manifest.version), 'must be a semantic version (for example 1.0.0)', `${path}.version`)
  string(manifest.name, `${path}.name`)
  strings(manifest.types, `${path}.types`)
  requireValue(Array.isArray(manifest.resources), 'must be an array', `${path}.resources`)
  manifest.resources.forEach((resource, i) => {
    const at = `${path}.resources[${i}]`
    if (typeof resource === 'string') string(resource, at)
    else {
      requireValue(isObject(resource), 'must be a resource name or object', at)
      string(resource.name, `${at}.name`)
      if (resource.types != null) strings(resource.types, `${at}.types`)
      if (resource.idPrefixes != null) strings(resource.idPrefixes, `${at}.idPrefixes`)
    }
  })
  if (manifest.idPrefixes != null) strings(manifest.idPrefixes, `${path}.idPrefixes`)
  for (const field of ['description', 'contactEmail']) {
    if (manifest[field] != null) requireValue(typeof manifest[field] === 'string', 'must be a string', `${path}.${field}`)
  }
  for (const field of ['logo', 'background']) {
    // Native clients tolerate unavailable/cosmetically invalid images. Preserve
    // the descriptor; filter unsafe protocols at the rendering boundary instead.
    if (manifest[field] != null) requireValue(typeof manifest[field] === 'string', 'must be a string', `${path}.${field}`)
  }
  if (manifest.behaviorHints != null) {
    requireValue(isObject(manifest.behaviorHints), 'must be an object', `${path}.behaviorHints`)
    for (const field of ['configurable', 'configurationRequired', 'adult', 'p2p', 'epgProvider']) {
      if (manifest.behaviorHints[field] != null) requireValue(typeof manifest.behaviorHints[field] === 'boolean', 'must be true or false', `${path}.behaviorHints.${field}`)
    }
  }
  for (const field of ['catalogs', 'addonCatalogs']) {
    if (manifest[field] == null) continue
    requireValue(Array.isArray(manifest[field]), 'must be an array', `${path}.${field}`)
    const identities = new Set()
    manifest[field].forEach((catalog, i) => {
      const at = `${path}.${field}[${i}]`
      requireValue(isObject(catalog), 'must be an object', at)
      string(catalog.id, `${at}.id`)
      string(catalog.type, `${at}.type`)
      const identity = JSON.stringify([catalog.type, catalog.id])
      requireValue(!identities.has(identity), 'duplicate catalog type/id', at)
      identities.add(identity)
      if (catalog.name != null) requireValue(typeof catalog.name === 'string', 'must be a string', `${at}.name`)
      if (catalog.extra != null) {
        requireValue(Array.isArray(catalog.extra), 'must be an array', `${at}.extra`)
        const names = new Set()
        catalog.extra.forEach((extra, j) => {
          const extraPath = `${at}.extra[${j}]`
          requireValue(isObject(extra), 'must be an object', extraPath)
          string(extra.name, `${extraPath}.name`)
          requireValue(!names.has(extra.name), 'duplicate extra name', extraPath)
          names.add(extra.name)
          if (extra.isRequired != null) requireValue(typeof extra.isRequired === 'boolean', 'must be true or false', `${extraPath}.isRequired`)
          if (extra.options != null) strings(extra.options, `${extraPath}.options`)
          if (extra.optionsLimit != null) requireValue(Number.isSafeInteger(extra.optionsLimit) && extra.optionsLimit > 0, 'must be a positive integer', `${extraPath}.optionsLimit`)
        })
      }
      if (catalog.extraSupported != null) strings(catalog.extraSupported, `${at}.extraSupported`)
      if (catalog.extraRequired != null) strings(catalog.extraRequired, `${at}.extraRequired`)
    })
  }
  return manifest
}

export function safeImageUrl(value) {
  if (typeof value !== 'string') return ''
  if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);/i.test(value)) return value
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}

export function validateAddonCollection(addons, { allowDuplicates = false } = {}) {
  requireValue(Array.isArray(addons), 'must be an array', 'addons')
  const urls = new Set()
  addons.forEach((addon, i) => {
    const path = `addons[${i}]`
    requireValue(isObject(addon), 'must be an object', path)
    let url
    try { url = new URL(addon.transportUrl) } catch { throw new ValidationError('must be an absolute URL', `${path}.transportUrl`) }
    requireValue(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'must use http(s) without embedded credentials', `${path}.transportUrl`)
    requireValue(allowDuplicates || !urls.has(url.href), 'duplicate transport URL; update the existing addon instead', path)
    urls.add(url.href)
    validateManifest(addon.manifest, `${path}.manifest`)
    if (addon.flags != null) {
      requireValue(isObject(addon.flags), 'must be an object', `${path}.flags`)
      for (const flag of ['official', 'protected']) {
        if (addon.flags[flag] != null) requireValue(typeof addon.flags[flag] === 'boolean', 'must be true or false', `${path}.flags.${flag}`)
      }
    }
  })
  return addons
}

export function stableSnapshot(value) {
  function stable(item) {
    if (Array.isArray(item)) return item.map(stable)
    if (!isObject(item)) return item
    return Object.fromEntries(Object.keys(item).sort().filter(key => !['__dragKey', '__clientKey'].includes(key)).map(key => [key, stable(item[key])]))
  }
  return JSON.stringify(stable(value))
}

export function requireConfiguredAddons(addons) {
  addons.forEach((addon, index) => {
    if (addon.manifest.behaviorHints?.configurationRequired) throw new ValidationError(`configure “${addon.manifest.name}” on its provider page before syncing`, `addons[${index}].manifest.behaviorHints.configurationRequired`)
  })
  return addons
}
