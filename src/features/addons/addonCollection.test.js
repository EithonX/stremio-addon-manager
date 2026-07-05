import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getCatalogBackupKey,
  hasManifestResource,
  normalizeAddonRecord,
  normalizeManifestUrl,
  removeManifestResource,
  restoreCatalogExtraBackups,
} from './addonCollection.js'

test('normalizeManifestUrl serializes http(s) and stremio manifest URLs', () => {
  assert.equal(normalizeManifestUrl(' https://example.com/manifest.json '), 'https://example.com/manifest.json')
  assert.equal(normalizeManifestUrl('stremio://example.com/manifest.json'), 'https://example.com/manifest.json')
  assert.equal(normalizeManifestUrl('ftp://example.com/manifest.json'), '')
  assert.equal(normalizeManifestUrl('not a url'), '')
})

test('normalizeAddonRecord preserves unknown top-level fields while normalizing transportUrl', () => {
  const normalized = normalizeAddonRecord({
    transportUrl: 'stremio://example.com/manifest.json',
    manifest: { id: 'addon.id', version: '1.0.0' },
    flags: { protected: true },
    installedAt: 123,
    custom: { source: 'backup' },
  })

  assert.equal(normalized.installedAt, 123)
  assert.equal(normalized.transportUrl, 'https://example.com/manifest.json')
  assert.deepEqual(normalized.custom, { source: 'backup' })
  assert.deepEqual(normalized.flags, { protected: true })
})

test('hasManifestResource supports string and object resources', () => {
  assert.equal(hasManifestResource({ resources: ['meta'] }, 'meta'), true)
  assert.equal(hasManifestResource({ resources: [{ name: 'meta', types: ['movie'] }] }, 'meta'), true)
  assert.equal(hasManifestResource({ resources: [{ name: 'stream' }] }, 'meta'), false)
  assert.equal(hasManifestResource({}, 'meta'), false)
})

test('removeManifestResource removes string and object resources by name', () => {
  assert.deepEqual(
    removeManifestResource({ resources: ['meta', 'stream'] }, 'meta'),
    { resources: ['stream'] },
  )

  assert.deepEqual(
    removeManifestResource({
      resources: [
        { name: 'meta', types: ['movie'], idPrefixes: ['tt'] },
        { name: 'stream', types: ['movie'] },
      ],
    }, 'meta'),
    { resources: [{ name: 'stream', types: ['movie'] }] },
  )
})

test('restoreCatalogExtraBackups deep clones backup extras', () => {
  const catalogs = [{ id: 'cat', type: 'movie', __dragKey: 'cat-1', extra: [] }]
  const backups = [{
    backupKey: getCatalogBackupKey(catalogs[0], 0),
    originalIndex: 0,
    id: 'cat',
    type: 'movie',
    extra: [{ name: 'genre', options: ['action'] }],
  }]

  restoreCatalogExtraBackups(catalogs, backups)
  catalogs[0].extra[0].options.push('drama')

  assert.deepEqual(backups[0].extra, [{ name: 'genre', options: ['action'] }])
})

test('restoreCatalogExtraBackups restores only the matching duplicate catalog', () => {
  const catalogs = [
    { id: 'cat', type: 'movie', __dragKey: 'dup-1', extra: [{ name: 'search' }] },
    { id: 'cat', type: 'movie', __dragKey: 'dup-2', extra: [{ name: 'search' }] },
  ]
  const backups = [{
    backupKey: getCatalogBackupKey(catalogs[1], 1),
    originalIndex: 1,
    id: 'cat',
    type: 'movie',
    extra: [{ name: 'genre', options: ['drama'] }],
  }]

  restoreCatalogExtraBackups(catalogs, backups)

  assert.deepEqual(catalogs[0].extra, [{ name: 'search' }])
  assert.deepEqual(catalogs[1].extra, [{ name: 'genre', options: ['drama'] }])
})

test('restoreCatalogExtraBackups falls back to originalIndex when drag key changed', () => {
  const catalogs = [
    { id: 'cat', type: 'movie', __dragKey: 'new-1', extra: [{ name: 'search' }] },
    { id: 'cat', type: 'movie', __dragKey: 'new-2', extra: [{ name: 'search' }] },
  ]
  const backups = [{
    backupKey: 'drag:old-2',
    originalIndex: 1,
    id: 'cat',
    type: 'movie',
    extra: [{ name: 'genre', options: ['comedy'] }],
  }]

  restoreCatalogExtraBackups(catalogs, backups)

  assert.deepEqual(catalogs[0].extra, [{ name: 'search' }])
  assert.deepEqual(catalogs[1].extra, [{ name: 'genre', options: ['comedy'] }])
})
