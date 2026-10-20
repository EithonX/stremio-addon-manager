import { deepClone, validateAndNormalizeAddonCollection } from './addonCollection.js'
import { stableSnapshot } from './manifestSchema.js'

export function validatedCollection(addons) {
  // Never silently filter an account's data, including descriptors we cannot edit.
  if (!Array.isArray(addons)) throw new Error('Stremio did not return an addon collection.')
  return validateAndNormalizeAddonCollection(addons)
}

export function protectSystemAddons(base, next) {
  for (const addon of base.filter(item => item.flags?.protected)) {
    const retained = next.find(item => item.transportUrl === addon.transportUrl)
    if (!retained?.flags?.protected) throw new Error(`Keep the protected addon “${addon.manifest.name}” and its protection flag.`)
  }
}

export function collectionChanges(base, next) {
  const before = new Map(base.map((item, index) => [item.transportUrl, { item, index }]))
  const after = new Map(next.map((item, index) => [item.transportUrl, { item, index }]))
  const changes = []
  for (const [url, { item, index }] of before) {
    if (!after.has(url)) changes.push({ kind: 'Remove', name: item.manifest.name })
    else {
      const target = after.get(url)
      if (stableSnapshot(item) !== stableSnapshot(target.item)) changes.push({ kind: 'Edit', name: target.item.manifest.name })
      if (index !== target.index) changes.push({ kind: 'Move', name: target.item.manifest.name, position: target.index + 1 })
    }
  }
  for (const [url, { item }] of after) if (!before.has(url)) changes.push({ kind: 'Add', name: item.manifest.name })
  return changes
}

export function mergeCollections(base, local, remote) {
  const maps = [base, local, remote].map(items => new Map(items.map(item => [item.transportUrl, item])))
  const [before, ours, theirs] = maps
  const result = new Map()
  const conflicts = []
  for (const url of new Set(maps.flatMap(map => [...map.keys()]))) {
    const b = before.get(url), l = ours.get(url), r = theirs.get(url)
    const localChanged = stableSnapshot(b) !== stableSnapshot(l)
    const remoteChanged = stableSnapshot(b) !== stableSnapshot(r)
    if (localChanged && remoteChanged && stableSnapshot(l) !== stableSnapshot(r)) {
      conflicts.push((l || r || b).manifest.name)
      continue
    }
    const value = localChanged ? l : r
    if (value) result.set(url, deepClone(value))
  }
  const shared = new Set(base.filter(a => ours.has(a.transportUrl) && theirs.has(a.transportUrl)).map(a => a.transportUrl))
  const order = items => items.filter(a => shared.has(a.transportUrl)).map(a => a.transportUrl)
  const originalOrder = stableSnapshot(order(base))
  const localOrder = stableSnapshot(order(local)), remoteOrder = stableSnapshot(order(remote))
  if (localOrder !== originalOrder && remoteOrder !== originalOrder && localOrder !== remoteOrder) conflicts.push('Addon order')
  if (conflicts.length) return { addons: null, conflicts }
  const first = localOrder !== originalOrder ? local : remote
  const second = first === local ? remote : local
  const ordered = [...new Set([...first, ...second].map(a => a.transportUrl))].filter(url => result.has(url)).map(url => result.get(url))
  protectSystemAddons(remote, ordered)
  return { addons: validatedCollection(ordered), conflicts: [] }
}
