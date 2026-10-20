import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultDraft, createManifestDraft, effectiveManifest, catalogIdentity, supportsHome, supportsSearch, draftSupports, committedManifestDrafts } from './manifestDraft.js'
import { validateManifest, validateAddonCollection, safeImageUrl } from './manifestSchema.js'

const manifest = catalogs => ({ id: 'fixture', version: '1.0.0', name: 'Fixture', types: ['movie'], resources: [{ name: 'meta', types: ['movie'], idPrefixes: ['tt'] }, 'stream'], catalogs, providerField: { preserve: true } })
const fixtures = [
  { id: 'optional-search', type: 'movie', extra: [{ name: 'search' }] },
  { id: 'hybrid', type: 'movie', extra: [{ name: 'search' }, { name: 'genre', options: ['Drama'] }, { name: 'skip' }] },
  { id: 'required-search', type: 'movie', extra: [{ name: 'search', isRequired: true }] },
  { id: 'skip-only', type: 'movie', extra: [{ name: 'skip' }] },
  { id: 'plain', type: 'movie' },
  { id: 'legacy', type: 'movie', extraSupported: ['search', 'skip'], extraRequired: ['search'] },
]
test('optional search is home-eligible; optional skip is visible; legacy required search is understood', () => {
  assert.equal(supportsHome(fixtures[0]), true)
  assert.equal(supportsHome(fixtures[3]), true)
  assert.equal(supportsHome(fixtures[5]), false)
  assert.equal(supportsSearch(fixtures[5]), true)
})
test('turning off search preserves home-only and optional-search catalogs', () => {
  const draft = defaultDraft(manifest(fixtures)); draft.settings.search = false
  const output = effectiveManifest(draft)
  assert.deepEqual(output.catalogs.map(c => c.id), ['optional-search', 'hybrid', 'skip-only', 'plain'])
  assert.ok(output.catalogs.every(c => !supportsSearch(c)))
  assert.deepEqual(output.catalogs.find(c => c.id === 'plain'), fixtures[4])
})
test('all capability toggle combinations round-trip losslessly without changing order', () => {
  const source = manifest(fixtures), draft = defaultDraft(source)
  for (const type of ['home', 'search', 'meta', 'home', 'search', 'meta']) {
    draft.settings[type] = !draft.settings[type]
    effectiveManifest(draft)
  }
  assert.deepEqual(effectiveManifest(draft), source)
})
test('saving and reopening a disabled draft preserves source catalogs, extras and resource constraints', () => {
  const draft = defaultDraft(manifest(fixtures)); draft.settings.home = false; draft.settings.meta = false
  const output = effectiveManifest(draft)
  const loaded = createManifestDraft(output, JSON.parse(JSON.stringify(draft)))
  assert.equal(loaded.warning, '')
  loaded.draft.settings.home = true; loaded.draft.settings.meta = true
  assert.deepEqual(effectiveManifest(loaded.draft), manifest(fixtures))
})
test('unsynced editor changes cannot replace the remembered restoration source for server data', () => {
  const original = defaultDraft(manifest(fixtures)); original.settings.search = false
  const remote = [{ transportUrl: 'https://provider.example.com/manifest.json', manifest: effectiveManifest(original) }]
  const key = remote[0].transportUrl
  const staged = JSON.parse(JSON.stringify(original)); staged.manifest.name = 'Unsynced rename'
  const committed = committedManifestDrafts(remote, { [key]: staged }, { [key]: original })
  const reopened = createManifestDraft(remote[0].manifest, committed[key]).draft
  reopened.settings.search = true
  assert.deepEqual(effectiveManifest(reopened), manifest(fixtures))
})
test('exclude/include is exact and does not invent a genre or other endpoint parameter', () => {
  const source = manifest([fixtures[4]]), draft = defaultDraft(source)
  draft.settings.excluded = [catalogIdentity(fixtures[4])]
  assert.deepEqual(effectiveManifest(draft).catalogs, [])
  draft.settings.excluded = []
  assert.deepEqual(effectiveManifest(draft), source)
})
test('metadata cannot be invented by enabling a capability not present in source', () => {
  const draft = defaultDraft({ ...manifest([]), resources: ['stream'] })
  assert.equal(draftSupports(draft, 'meta'), false)
  draft.settings.meta = true
  assert.deepEqual(effectiveManifest(draft).resources, ['stream'])
})
test('old saved customization cannot overwrite a changed provider/server manifest', () => {
  const saved = defaultDraft(manifest(fixtures)), remote = manifest(fixtures)
  remote.version = '2.0.0'; remote.name = 'Changed remotely'
  const restored = createManifestDraft(remote, saved)
  assert.match(restored.warning, /remote manifest changed/)
  assert.equal(restored.draft.manifest.name, 'Changed remotely')
})
test('system calendar/notification catalogs survive home/search optimizations', () => {
  const system = { id: 'calendar', type: 'series', extra: [{ name: 'calendarVideosIds', isRequired: true }] }
  const draft = defaultDraft(manifest([system])); draft.settings.home = false; draft.settings.search = false
  assert.deepEqual(effectiveManifest(draft).catalogs, [system])
})
test('schema rejects truthy but invalid fields and malformed versions with useful paths', () => {
  for (const bad of [{ id: 123 }, { version: {} }, { version: '01.0.0' }, { resources: 'meta' }, { types: false }]) {
    assert.throws(() => validateManifest({ ...manifest([]), ...bad }), /manifest\./)
  }
  assert.doesNotThrow(() => validateManifest({ ...manifest([]), version: '1.2.3-beta.1+build.4' }))
})
test('schema rejects duplicate catalog identities and malformed extras', () => {
  assert.throws(() => validateManifest(manifest([fixtures[0], fixtures[0]])), /duplicate catalog/)
  assert.throws(() => validateManifest(manifest([{ id: 'x', type: 'movie', extra: [{ name: 'search', isRequired: 'yes' }] }])), /isRequired/)
})
test('same manifest id with distinct configured transport URLs remains supported', () => {
  const a = { transportUrl: 'https://provider.example.com/config-a/manifest.json', manifest: manifest([]) }
  const b = { ...a, transportUrl: 'https://provider.example.com/config-b/manifest.json' }
  assert.doesNotThrow(() => validateAddonCollection([a, b]))
  assert.throws(() => validateAddonCollection([a, a]), /duplicate transport/)
})
test('cosmetic image failures do not prevent preserving an account; unsafe protocols never render', () => {
  assert.doesNotThrow(() => validateManifest({ ...manifest([]), logo: 'unavailable-image' }))
  assert.equal(safeImageUrl('javascript:alert(1)'), '')
  assert.equal(safeImageUrl('https://name:secret@provider.example.com/logo.png'), '')
  assert.equal(safeImageUrl('https://provider.example.com/logo.png'), 'https://provider.example.com/logo.png')
})
