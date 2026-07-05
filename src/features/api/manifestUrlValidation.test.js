import assert from 'node:assert/strict'
import test from 'node:test'

import { validateManifestUrl } from './manifestUrlValidation.js'

test('validateManifestUrl allows public https manifest URLs', () => {
  const result = validateManifestUrl('https://example.com/manifest.json')

  assert.equal(result.ok, true)
  assert.equal(result.url, 'https://example.com/manifest.json')
})

test('validateManifestUrl rejects non-http protocols', () => {
  assert.equal(validateManifestUrl('ftp://example.com/manifest.json').ok, false)
})

test('validateManifestUrl rejects localhost hosts', () => {
  assert.equal(validateManifestUrl('http://localhost/manifest.json').ok, false)
})

test('validateManifestUrl rejects loopback IPv4 hosts', () => {
  assert.equal(validateManifestUrl('http://127.0.0.1/manifest.json').ok, false)
})

test('validateManifestUrl rejects private IPv4 hosts', () => {
  assert.equal(validateManifestUrl('http://192.168.1.1/manifest.json').ok, false)
})

test('validateManifestUrl rejects 10.0.0.1', () => {
  assert.equal(validateManifestUrl('http://10.0.0.1/manifest.json').ok, false)
})

test('validateManifestUrl rejects 172.16.0.1', () => {
  assert.equal(validateManifestUrl('http://172.16.0.1/manifest.json').ok, false)
})

test('validateManifestUrl rejects 172.31.255.255', () => {
  assert.equal(validateManifestUrl('http://172.31.255.255/manifest.json').ok, false)
})

test('validateManifestUrl allows 172.32.0.1', () => {
  assert.equal(validateManifestUrl('http://172.32.0.1/manifest.json').ok, true)
})

test('validateManifestUrl rejects link-local metadata IPv4 host', () => {
  assert.equal(validateManifestUrl('http://169.254.169.254/latest/meta-data').ok, false)
})

test('validateManifestUrl rejects IPv6 localhost host', () => {
  assert.equal(validateManifestUrl('http://[::1]/manifest.json').ok, false)
})

test('validateManifestUrl rejects URLs with credentials', () => {
  assert.equal(validateManifestUrl('https://user:pass@example.com/manifest.json').ok, false)
})
