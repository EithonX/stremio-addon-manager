import { deepClone, getResourceName } from './addonCollection.js'
import { isObject, stableSnapshot, validateManifest } from './manifestSchema.js'

export const catalogIdentity = catalog => JSON.stringify([catalog.type, catalog.id])

export function catalogExtras(catalog) {
  if (Array.isArray(catalog.extra)) return catalog.extra
  return (catalog.extraSupported || []).map(name => ({ name, isRequired: (catalog.extraRequired || []).includes(name) }))
}
export const supportsSearch = catalog => catalogExtras(catalog).some(extra => extra.name === 'search')
export const supportsHome = catalog => catalogExtras(catalog).every(extra => !extra.isRequired)
export const isSystemCatalog = catalog => catalogExtras(catalog).some(extra => ['lastVideosIds', 'calendarVideosIds'].includes(extra.name))

function setSearch(catalog, enabled, required = false) {
  const copy = deepClone(catalog)
  if (Array.isArray(copy.extra)) {
    copy.extra = copy.extra.filter(extra => enabled || extra.name !== 'search')
    if (enabled && required) copy.extra.forEach(extra => { if (extra.name === 'search') extra.isRequired = true })
  }
  if (Array.isArray(copy.extraSupported)) copy.extraSupported = copy.extraSupported.filter(name => enabled || name !== 'search')
  if (Array.isArray(copy.extraRequired) || !Array.isArray(copy.extra)) {
    const previous = copy.extraRequired || []
    if (!enabled) copy.extraRequired = previous.filter(name => name !== 'search')
    else if (required) copy.extraRequired = [...new Set([...previous, 'search'])]
  }
  return copy
}

export function cleanManifest(manifest) {
  const copy = deepClone(manifest)
  copy.catalogs?.forEach(catalog => delete catalog.__dragKey)
  return copy
}

export function createManifestDraft(manifest, saved) {
  validateManifest(manifest)
  if (saved?.version === 1 && isObject(saved.manifest) && isObject(saved.settings)) {
    try {
      const draft = {
        version: 1, manifest: cleanManifest(validateManifest(saved.manifest)),
        settings: {
          search: saved.settings.search !== false, home: saved.settings.home !== false, meta: saved.settings.meta !== false,
          excluded: Array.isArray(saved.settings.excluded) ? saved.settings.excluded.filter(key => typeof key === 'string') : [],
        },
      }
      if (stableSnapshot(effectiveManifest(draft)) === stableSnapshot(manifest)) return { draft, warning: '' }
    } catch { /* A malformed or obsolete saved draft cannot overwrite server data. */ }
    return { draft: defaultDraft(manifest), warning: 'The remote manifest changed. Earlier toggle settings were not applied to this version; your current server data is intact.' }
  }
  return { draft: defaultDraft(manifest), warning: '' }
}

export function defaultDraft(manifest) {
  return { version: 1, manifest: cleanManifest(manifest), settings: { search: true, home: true, meta: true, excluded: [] } }
}

export function effectiveManifest(draft) {
  const result = cleanManifest(draft.manifest)
  const settings = draft.settings
  if (Array.isArray(result.catalogs)) {
    result.catalogs = result.catalogs.flatMap(catalog => {
      if (settings.excluded.includes(catalogIdentity(catalog))) return []
      if (isSystemCatalog(catalog)) return [catalog]
      const search = catalogExtras(catalog).find(extra => extra.name === 'search')
      if (!settings.search && search?.isRequired) return []
      if (!settings.home && (!settings.search || !search)) return []
      if (!settings.home && search) return [setSearch(catalog, true, true)]
      return [settings.search || !search ? catalog : setSearch(catalog, false)]
    })
  }
  if (!settings.meta) result.resources = result.resources.filter(resource => getResourceName(resource) !== 'meta')
  return validateManifest(result)
}

export function draftSupports(draft, type) {
  if (type === 'meta') return draft.manifest.resources.some(resource => getResourceName(resource) === 'meta')
  const catalogs = draft.manifest.catalogs || []
  if (type === 'search') return catalogs.some(supportsSearch)
  return catalogs.some(catalog => !isSystemCatalog(catalog) && supportsHome(catalog))
}

export function exportManifestDraft(manifest, settings) {
  return { version: 1, manifest: cleanManifest(manifest), settings: deepClone(settings) }
}

export function committedManifestDrafts(collection, workingDrafts, previous = {}) {
  const committed = deepClone(previous)
  for (const addon of collection) {
    const draft = workingDrafts[addon.transportUrl]
    if (!draft) continue
    try {
      if (stableSnapshot(effectiveManifest(draft)) === stableSnapshot(addon.manifest)) committed[addon.transportUrl] = deepClone(draft)
    } catch { /* An invalid/staged draft cannot replace synced restoration data. */ }
  }
  return committed
}
