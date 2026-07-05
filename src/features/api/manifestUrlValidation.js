const PRIVATE_IPV4_RANGES = [
  { first: 10, secondMin: 0, secondMax: 255 },
  { first: 172, secondMin: 16, secondMax: 31 },
  { first: 192, secondMin: 168, secondMax: 168 },
  { first: 169, secondMin: 254, secondMax: 254 },
]

function parseIPv4(hostname) {
  const parts = hostname.split('.')

  if (parts.length !== 4) {
    return null
  }

  const bytes = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return null
    }

    const byte = Number(part)
    return byte >= 0 && byte <= 255 ? byte : null
  })

  return bytes.every((byte) => byte !== null) ? bytes : null
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

function isPrivateIPv4(bytes) {
  if (bytes[0] === 0 || bytes[0] === 127) {
    return true
  }

  return PRIVATE_IPV4_RANGES.some((range) => (
    bytes[0] === range.first &&
    bytes[1] >= range.secondMin &&
    bytes[1] <= range.secondMax
  ))
}

function isBlockedHostname(hostname) {
  const normalized = normalizeHostname(hostname)

  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true
  }

  const ipv4 = parseIPv4(normalized)
  if (ipv4) {
    return isPrivateIPv4(ipv4)
  }

  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.') ||
    normalized.startsWith('::ffff:169.254.')
  ) {
    return true
  }

  const mapped172 = normalized.match(/^::ffff:172\.(\d{1,3})\./)
  if (mapped172) {
    const second = Number(mapped172[1])
    return second >= 16 && second <= 31
  }

  return false
}

export function validateManifestUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, message: 'Manifest URL is required.' }
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, message: 'Manifest URL is invalid.' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Manifest URL must use http or https.' }
  }

  if (parsed.username || parsed.password) {
    return { ok: false, message: 'Manifest URL must not include credentials.' }
  }

  if (isBlockedHostname(parsed.hostname)) {
    return { ok: false, message: 'Manifest URL host is not allowed.' }
  }

  return { ok: true, url: parsed.toString() }
}
