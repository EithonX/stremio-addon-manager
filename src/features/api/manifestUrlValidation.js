function blockedIPv4(host) {
  const bytes = host.split('.').map(Number)
  if (bytes.length !== 4 || bytes.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return true
  const [a, b, c] = bytes
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
    a === 192 && (b === 168 || b === 0 || b === 2) ||
    a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
    a === 203 && b === 0 && c === 113
}
function publicIPv6(host) {
  const parts = host.split('::')
  if (parts.length > 2) return false
  const left = parts[0] ? parts[0].split(':') : []
  const right = parts[1] ? parts[1].split(':') : []
  const missing = 8 - left.length - right.length
  if (missing < 0 || parts.length === 1 && missing !== 0 || parts.length === 2 && missing < 1) return false
  const words = [...left, ...Array(parts.length === 2 ? missing : 0).fill('0'), ...right]
  if (words.length !== 8 || words.some(p => !/^[0-9a-f]{1,4}$/.test(p))) return false
  const [first, second] = words.map(p => parseInt(p, 16))
  // Only ordinary global unicast literals. This rejects all mapped, loopback,
  // unspecified, ULA, link-local, multicast and transition-address spellings.
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
}

export function validateManifestUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return { ok: false, message: 'Manifest URL is required.' }
  let parsed
  try { parsed = new URL(rawUrl) } catch { return { ok: false, message: 'Manifest URL is invalid.' } }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, message: 'Manifest URL must use http or https.' }
  if (parsed.username || parsed.password) return { ok: false, message: 'Manifest URL must not include embedded credentials.' }
  if (parsed.port && !['80', '443'].includes(parsed.port)) return { ok: false, message: 'Manifest URLs must use a standard web port (80 or 443).' }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  const blocked = !host || host.includes(':') ? !publicIPv6(host) :
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ? blockedIPv4(host) :
      !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|home|invalid|test)$/.test(host)
  if (blocked) return { ok: false, message: 'Manifest URL must use a public web host.' }
  if (!host.includes(':')) parsed.hostname = host
  parsed.hash = ''
  return { ok: true, url: parsed.href }
}

export function trustedManifestOrigin(url, configuredOrigins = '') {
  const allowed = String(configuredOrigins).split(',').map(value => value.trim()).filter(Boolean)
  return allowed.some(value => {
    try {
      const parsed = new URL(value)
      return !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash && parsed.origin === new URL(url).origin
    } catch { return false }
  })
}
