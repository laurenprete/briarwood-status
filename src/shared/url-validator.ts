import { URL } from 'url'
import { resolve4, resolve6 } from 'dns/promises'

/**
 * SSRF-safe URL validation.
 * Blocks private/reserved IPs (v4 + v6), loopback, link-local,
 * metadata endpoints, and non-http(s) schemes before any outbound fetch.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
])

/** Returns true if an IPv4 address falls in a private/reserved range. */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true // malformed → treat as blocked
  }

  const [a, b] = parts

  if (a === 10) return true                           // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true    // 172.16.0.0/12
  if (a === 192 && b === 168) return true             // 192.168.0.0/16
  if (a === 127) return true                          // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true             // 169.254.0.0/16 (link-local / AWS metadata)
  if (a === 0) return true                            // 0.0.0.0/8

  return false
}

/** Returns true if an IPv6 address falls in a private/reserved range. */
function isPrivateIpv6(ip: string): boolean {
  // Normalize: expand :: and lowercase
  const normalized = ip.toLowerCase().trim()

  // Loopback ::1
  if (normalized === '::1' || normalized === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return true
  }

  // Unspecified ::
  if (normalized === '::' || normalized === '0000:0000:0000:0000:0000:0000:0000:0000') {
    return true
  }

  // Extract the first segment to check prefix ranges
  const firstSegment = normalized.split(':')[0]
  if (!firstSegment) return true // malformed

  const firstValue = parseInt(firstSegment, 16)
  if (Number.isNaN(firstValue)) return true // malformed

  // fc00::/7 — Unique Local Addresses (ULA, private)
  // Covers fc00::/8 and fd00::/8
  if ((firstValue & 0xfe00) === 0xfc00) return true

  // fe80::/10 — Link-local
  if ((firstValue & 0xffc0) === 0xfe80) return true

  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — check the embedded IPv4
  const ipv4Mapped = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (ipv4Mapped) {
    return isPrivateIpv4(ipv4Mapped[1])
  }

  return false
}

export interface UrlValidationResult {
  valid: boolean
  error?: string
  url?: URL
}

/**
 * Validates a monitor URL is safe to fetch.
 * Checks scheme, hostname blocklist, and resolves DNS to block private IPs (v4 + v6).
 */
export async function validateMonitorUrl(raw: string): Promise<UrlValidationResult> {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  // Scheme check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'URL must use http or https' }
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: 'URL points to a blocked internal hostname' }
  }

  // If the hostname is a raw IPv4, check it directly
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateIpv4(hostname)) {
      return { valid: false, error: 'URL must not point to a private or reserved IP address' }
    }
    return { valid: true, url: parsed }
  }

  // If the hostname is a bracketed IPv6 (parsed.hostname strips brackets), check it
  if (hostname.includes(':')) {
    if (isPrivateIpv6(hostname)) {
      return { valid: false, error: 'URL must not point to a private or reserved IPv6 address' }
    }
    return { valid: true, url: parsed }
  }

  // Resolve DNS and check all returned IPs (both A and AAAA records)
  try {
    const [ipv4s, ipv6s] = await Promise.all([
      resolve4(hostname).catch(() => [] as string[]),
      resolve6(hostname).catch(() => [] as string[]),
    ])

    for (const ip of ipv4s) {
      if (isPrivateIpv4(ip)) {
        return { valid: false, error: `URL hostname resolves to a private IPv4 address (${ip})` }
      }
    }

    for (const ip of ipv6s) {
      if (isPrivateIpv6(ip)) {
        return { valid: false, error: `URL hostname resolves to a private IPv6 address (${ip})` }
      }
    }
  } catch {
    // DNS resolution failed — the checker will handle the actual fetch error.
    // Don't block creation just because DNS is temporarily unavailable.
  }

  return { valid: true, url: parsed }
}
