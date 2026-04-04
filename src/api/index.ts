import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { cors } from 'hono/cors'
import { randomUUID } from 'crypto'
import type { Monitor, MonitorState, StatusSummary, CheckResult } from '../shared/types'
import {
  listMonitors,
  getMonitor,
  putMonitor,
  deleteMonitor,
  queryCheckResults,
  listActiveMonitors,
  getAllMonitorStates,
  writeCheckResult,
  putMonitorState,
} from '../shared/db'
import { authMiddleware } from '../shared/auth'
import { createMonitorSchema, updateMonitorSchema, firstZodError } from '../shared/validation'
import { validateMonitorUrl } from '../shared/url-validator'

const ALLOWED_ORIGINS = [
  'https://status.briarwoodsoftware.com',
  // Allow localhost during development
  ...(process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:5173']
    : []),
]

// Amplify default domains match: https://main.<appid>.amplifyapp.com
const AMPLIFY_ORIGIN_PATTERN = /^https:\/\/main\.[a-z0-9]+\.amplifyapp\.com$/

const app = new Hono().basePath('/api')

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return null
      if (ALLOWED_ORIGINS.includes(origin)) return origin
      if (AMPLIFY_ORIGIN_PATTERN.test(origin)) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
)

// --- Helpers ---

const RANGE_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const DEGRADED_UPTIME_WEIGHT = 0.5

function calculateUptime(checks: CheckResult[]): number | null {
  if (checks.length === 0) return null
  let score = 0
  for (const c of checks) {
    if (c.healthStatus === 'degraded') {
      score += DEGRADED_UPTIME_WEIGHT
    } else if (c.isUp) {
      score += 1
    }
    // unhealthy / down / error = 0
  }
  return Math.round((score / checks.length) * 100 * 100) / 100
}

function parseRange(raw: string | undefined): string {
  if (raw === '7d' || raw === '30d') return raw
  return '24h'
}

/**
 * Compute per-day uptime percentages for the last N days.
 * Returns an array of { date, uptime } from oldest to newest.
 * uptime is null if no checks occurred that day.
 */
function computeDailyUptime(
  checks: CheckResult[],
  days: number,
  nowMs: number
): Array<{ date: string; uptime: number | null; affectedSubsystems?: string[] }> {
  // Build day buckets (midnight UTC boundaries)
  const result: Array<{ date: string; uptime: number | null; affectedSubsystems?: string[] }> = []
  const msPerDay = 24 * 60 * 60 * 1000

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(nowMs - i * msPerDay)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + msPerDay)

    const dayChecks = checks.filter((c) => {
      const t = new Date(c.timestamp).getTime()
      return t >= dayStart.getTime() && t < dayEnd.getTime()
    })

    // Collect subsystems that were degraded or unhealthy on this day
    const affected = new Set<string>()
    for (const c of dayChecks) {
      if (c.checks) {
        for (const [name, check] of Object.entries(c.checks)) {
          if ((check as any).status !== 'healthy') {
            affected.add(name)
          }
        }
      }
    }

    result.push({
      date: dayStart.toISOString().slice(0, 10),
      uptime: calculateUptime(dayChecks),
      ...(affected.size > 0 && { affectedSubsystems: [...affected] }),
    })
  }

  return result
}

// --- In-memory cache for /status (30s TTL) ---

let statusCache: { key: string; data: StatusSummary; expiresAt: number } | null = null
const STATUS_CACHE_TTL_MS = 30_000

// --- Routes ---

// List all monitors
app.get('/monitors', async (c) => {
  try {
    const monitors = await listMonitors()
    monitors.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
    return c.json(monitors)
  } catch (err) {
    console.error('[api] GET /monitors failed', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create a monitor (auth required)
app.post('/monitors', authMiddleware, async (c) => {
  try {
    const rawBody = await c.req.json().catch(() => null)
    if (!rawBody || typeof rawBody !== 'object') {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    const parsed = createMonitorSchema.safeParse(rawBody)
    if (!parsed.success) {
      return c.json({ error: firstZodError(parsed.error) }, 400)
    }

    const body = parsed.data

    // SSRF check on the URL
    const urlCheck = await validateMonitorUrl(body.url)
    if (!urlCheck.valid) {
      return c.json({ error: urlCheck.error }, 400)
    }

    const now = new Date().toISOString()
    const monitor: Monitor = {
      id: randomUUID(),
      name: body.name,
      url: body.url,
      group: body.group,
      expectedStatus: body.expectedStatus,
      isActive: body.isActive,
      alertEmails: body.alertEmails,
      healthCheckEnabled: body.healthCheckEnabled,
      healthCheckPath: body.healthCheckPath,
      isPublic: body.isPublic,
      createdAt: now,
      updatedAt: now,
    }

    await putMonitor(monitor)

    // Run an immediate first check so it doesn't stay "unknown"
    if (monitor.isActive) {
      try {
        // Use health check URL if enabled, otherwise the monitor URL
        const fetchUrl = monitor.healthCheckEnabled
          ? `${monitor.url.replace(/\/+$/, '')}${monitor.healthCheckPath.startsWith('/') ? monitor.healthCheckPath : `/${monitor.healthCheckPath}`}`
          : monitor.url

        const start = Date.now()
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000)
        let statusCode: number | null = null
        let isUp = false
        let error: string | undefined

        try {
          const res = await fetch(fetchUrl, {
            signal: controller.signal,
            redirect: 'follow',
          })
          statusCode = res.status
          isUp = statusCode === monitor.expectedStatus
        } catch (err: any) {
          error =
            err.name === 'AbortError'
              ? 'Timeout (10s)'
              : err.message || 'Network error'
        } finally {
          clearTimeout(timeout)
        }

        const responseTime = Date.now() - start
        const checkTimestamp = new Date().toISOString()

        await writeCheckResult({
          monitorId: monitor.id,
          timestamp: checkTimestamp,
          statusCode,
          responseTime,
          isUp,
          error,
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        })

        // Align with checker state machine: first check = seed state, no alert
        await putMonitorState({
          monitorId: monitor.id,
          currentStatus: isUp ? 'up' : 'unknown',
          lastCheckedAt: checkTimestamp,
          lastStatusChange: checkTimestamp,
          consecutiveFailures: isUp ? 0 : 1,
          downSince: null,
          lastResponseTime: responseTime,
          lastStatusCode: statusCode,
          lastError: error ?? null,
        })
      } catch {
        // Non-blocking — first check failure shouldn't fail the create
      }
    }

    // Invalidate status cache after creating a monitor
    statusCache = null

    return c.json(monitor, 201)
  } catch (err) {
    console.error('[api] POST /monitors failed', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Update a monitor (auth required)
app.put('/monitors/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    const existing = await getMonitor(id)
    if (!existing) {
      return c.json({ error: 'Monitor not found' }, 404)
    }

    const rawBody = await c.req.json().catch(() => null)
    if (!rawBody || typeof rawBody !== 'object') {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    const parsed = updateMonitorSchema.safeParse(rawBody)
    if (!parsed.success) {
      return c.json({ error: firstZodError(parsed.error) }, 400)
    }

    const body = parsed.data

    // If URL is being changed, run SSRF check
    if (body.url !== undefined) {
      const urlCheck = await validateMonitorUrl(body.url)
      if (!urlCheck.valid) {
        return c.json({ error: urlCheck.error }, 400)
      }
    }

    const updated: Monitor = {
      ...existing,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.url !== undefined && { url: body.url }),
      ...(body.expectedStatus !== undefined && {
        expectedStatus: body.expectedStatus,
      }),
      ...(body.alertEmails !== undefined && { alertEmails: body.alertEmails }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.group !== undefined && { group: body.group || undefined }),
      ...(body.healthCheckEnabled !== undefined && { healthCheckEnabled: body.healthCheckEnabled }),
      ...(body.healthCheckPath !== undefined && { healthCheckPath: body.healthCheckPath }),
      ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }

    await putMonitor(updated)

    // Invalidate status cache after updating a monitor
    statusCache = null

    return c.json(updated)
  } catch (err) {
    console.error('[api] PUT /monitors/:id failed', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Delete a monitor (auth required)
app.delete('/monitors/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    const existing = await getMonitor(id)
    if (!existing) {
      return c.json({ error: 'Monitor not found' }, 404)
    }

    await deleteMonitor(id)

    // Invalidate status cache after deleting a monitor
    statusCache = null

    return c.json({ success: true })
  } catch (err) {
    console.error('[api] DELETE /monitors/:id failed', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Proxy a health check request (auth required, keeps token server-side)
app.post('/monitors/:id/health-check', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    const monitor = await getMonitor(id)
    if (!monitor) {
      return c.json({ error: 'Monitor not found' }, 404)
    }
    if (!monitor.healthCheckEnabled) {
      return c.json({ error: 'Health check not enabled for this monitor' }, 400)
    }

    const base = monitor.url.replace(/\/+$/, '')
    const path = monitor.healthCheckPath.startsWith('/')
      ? monitor.healthCheckPath
      : `/${monitor.healthCheckPath}`
    const healthUrl = `${base}${path}`

    const headers: Record<string, string> = {}
    const token = process.env.HEALTH_CHECK_TOKEN
    if (token) headers['X-Health-Token'] = token

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers,
      })
      clearTimeout(timeout)

      // Try to parse as JSON regardless of content-type header
      const text = await res.text()
      try {
        const body = JSON.parse(text)
        return c.json({ httpStatus: res.status, ...body })
      } catch {
        return c.json({ httpStatus: res.status, status: res.ok ? 'healthy' : 'unhealthy' })
      }
    } catch (err: any) {
      clearTimeout(timeout)
      return c.json({
        httpStatus: null,
        status: 'unhealthy',
        error: err.name === 'AbortError' ? 'Timeout (10s)' : err.message || 'Network error',
      })
    }
  } catch (err) {
    console.error('[api] POST /monitors/:id/health-check failed', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get check history for a monitor
app.get('/monitors/:id/checks', async (c) => {
  try {
    const id = c.req.param('id')
    const range = parseRange(c.req.query('range'))
    const fromTimestamp = new Date(Date.now() - RANGE_MS[range]).toISOString()
    const checks = await queryCheckResults(id, fromTimestamp)
    return c.json(checks)
  } catch (err) {
    console.error('[api] GET /monitors/:id/checks failed', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Status summary — returns public monitors only unless authenticated
app.get('/status', async (c) => {
  try {
    // Check if the caller is authenticated (optional — don't reject if missing)
    let isAuthenticated = false
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { jwtVerify, createRemoteJWKSet } = await import('jose')
        const region = process.env.COGNITO_REGION!
        const poolId = process.env.COGNITO_USER_POOL_ID!
        const clientId = process.env.COGNITO_CLIENT_ID!
        const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`
        const JWKS = createRemoteJWKSet(new URL(jwksUrl))
        const { payload } = await jwtVerify(authHeader.slice(7), JWKS, {
          issuer: `https://cognito-idp.${region}.amazonaws.com/${poolId}`,
          audience: clientId,
        })
        if (payload.token_use === 'id') isAuthenticated = true
      } catch {
        // Invalid token — treat as unauthenticated, don't reject
      }
    }

    // Use separate caches for public vs authenticated views
    const cacheKey = isAuthenticated ? 'auth' : 'public'
    if (statusCache?.key === cacheKey && Date.now() < statusCache.expiresAt) {
      return c.json(statusCache.data)
    }

    const [activeMonitors, states] = await Promise.all([
      listActiveMonitors(),
      getAllMonitorStates(),
    ])

    // Filter to public monitors only if not authenticated
    const visibleMonitors = isAuthenticated
      ? activeMonitors
      : activeMonitors.filter((m) => m.isPublic !== false)

    const stateMap = new Map<string, MonitorState>(
      states.map((s) => [s.monitorId, s])
    )

    const now = Date.now()
    const from30d = new Date(now - RANGE_MS['30d']).toISOString()
    const threshold24h = now - RANGE_MS['24h']
    const threshold7d = now - RANGE_MS['7d']

    const monitors = await Promise.all(
      visibleMonitors.map(async (monitor) => {
        const state = stateMap.get(monitor.id)

        // Query once for 30d, then compute 24h/7d from the same result set
        const checks30d = await queryCheckResults(monitor.id, from30d)
        const checks7d = checks30d.filter(
          (c) => new Date(c.timestamp).getTime() >= threshold7d
        )
        const checks24h = checks30d.filter(
          (c) => new Date(c.timestamp).getTime() >= threshold24h
        )

        // Compute per-day uptime for the last 30 days (oldest first)
        const dailyUptime = computeDailyUptime(checks30d, 30, now)

        return {
          id: monitor.id,
          name: monitor.name,
          url: monitor.url,
          group: monitor.group,
          healthCheckEnabled: monitor.healthCheckEnabled,
          currentStatus: state?.currentStatus ?? ('unknown' as const),
          lastCheckedAt: state?.lastCheckedAt ?? null,
          lastResponseTime: state?.lastResponseTime ?? null,
          ...(state?.lastChecks && { lastChecks: state.lastChecks }),
          uptime24h: calculateUptime(checks24h),
          uptime7d: calculateUptime(checks7d),
          uptime30d: calculateUptime(checks30d),
          dailyUptime,
        }
      })
    )

    let overall: StatusSummary['overall'] = 'operational'
    if (monitors.length > 0) {
      const downCount = monitors.filter(
        (m) => m.currentStatus === 'down'
      ).length
      const degradedCount = monitors.filter(
        (m) => m.currentStatus === 'degraded'
      ).length
      if (downCount === monitors.length) {
        overall = 'outage'
      } else if (downCount > 0) {
        overall = 'degraded'
      } else if (degradedCount > 0) {
        overall = 'degraded'
      }
    }

    const summary: StatusSummary = {
      monitors,
      overall,
      lastUpdated: new Date().toISOString(),
    }

    // Cache the result
    statusCache = {
      key: cacheKey,
      data: summary,
      expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
    }

    return c.json(summary)
  } catch (err) {
    console.error('[api] GET /status failed', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Health check endpoint (authenticated via shared token)
app.get('/health', async (c) => {
  const token = c.req.header('X-Health-Token')
  const expected = process.env.HEALTH_CHECK_TOKEN
  if (!expected || token !== expected) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  type CheckStatus = 'healthy' | 'degraded' | 'unhealthy'
  const checks: Record<string, { status: CheckStatus; latencyMs?: number; error?: string }> = {}

  // Check DynamoDB — try to read from monitors table
  {
    const start = Date.now()
    try {
      await listMonitors()
      const latencyMs = Date.now() - start
      checks.dynamodb = {
        status: latencyMs < 500 ? 'healthy' : latencyMs < 2000 ? 'degraded' : 'unhealthy',
        latencyMs,
      }
    } catch (err) {
      checks.dynamodb = {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'DynamoDB unreachable',
      }
    }
  }

  // Check Cognito — fetch JWKS endpoint
  {
    const region = process.env.COGNITO_REGION
    const poolId = process.env.COGNITO_USER_POOL_ID
    if (!region || !poolId) {
      checks.auth = { status: 'unhealthy', error: 'Cognito env vars missing' }
    } else {
      const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`
      const start = Date.now()
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(jwksUrl, { signal: controller.signal })
        clearTimeout(timeout)
        const latencyMs = Date.now() - start
        checks.auth = {
          status: res.ok ? 'healthy' : 'unhealthy',
          latencyMs,
          ...(!res.ok && { error: `JWKS returned ${res.status}` }),
        }
      } catch (err) {
        checks.auth = {
          status: 'unhealthy',
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : 'Cognito JWKS unreachable',
        }
      }
    }
  }

  // Derive overall status
  const statuses = Object.values(checks).map((c) => c.status)
  let overall: CheckStatus = 'healthy'
  if (statuses.includes('unhealthy')) overall = 'unhealthy'
  else if (statuses.includes('degraded')) overall = 'degraded'

  const body = {
    status: overall,
    timestamp: new Date().toISOString(),
    checks,
  }

  return c.json(body, overall === 'unhealthy' ? 503 : 200)
})

export const handler = handle(app)
