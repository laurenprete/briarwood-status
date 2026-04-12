import {
  listActiveMonitors,
  writeCheckResult,
  getMonitorState,
  putMonitorState,
} from '../shared/db'
import { validateMonitorUrl } from '../shared/url-validator'
import type { AlertPayload, CheckResult, Monitor, MonitorState } from '../shared/types'

type CheckEngineResult = {
  statusCode: number | null
  responseTime: number
  isUp: boolean
  error?: string
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy'
  checks?: Record<string, { status: string; latencyMs?: number; error?: string }>
}

/** Returns the URL the checker should actually fetch for a monitor. */
function getCheckUrl(monitor: Monitor): string {
  if (!monitor.healthCheckEnabled) return monitor.url

  // Append healthCheckPath to the monitor URL
  const base = monitor.url.replace(/\/+$/, '')
  const path = monitor.healthCheckPath.startsWith('/')
    ? monitor.healthCheckPath
    : `/${monitor.healthCheckPath}`
  return `${base}${path}`
}

const SMTP2GO_ENDPOINT = 'https://api.smtp2go.com/v3/email/send'
const SMTP2GO_FROM = 'Briarwood Status <contact@briarwoodsoftware.com>'
const CHECK_TIMEOUT_MS = 10_000
const CHECK_TTL_SECONDS = 30 * 24 * 60 * 60

// ---------------------------------------------------------------------------
// Lambda entry point – invoked by EventBridge every 5 minutes
// ---------------------------------------------------------------------------

export const handler = async (): Promise<void> => {
  const startedAt = new Date().toISOString()
  console.log(`[checker] Run started at ${startedAt}`)

  let monitors: Monitor[]
  try {
    monitors = await listActiveMonitors()
  } catch (error) {
    console.error('[checker] Failed to load active monitors', error)
    throw error
  }

  console.log(`[checker] Loaded ${monitors.length} active monitor(s)`)

  await Promise.all(monitors.map((monitor) => processMonitor(monitor)))

  console.log('[checker] Run complete')
}

// ---------------------------------------------------------------------------
// Per-monitor pipeline: check → store result → update state → alert
// ---------------------------------------------------------------------------

async function processMonitor(monitor: Monitor): Promise<void> {
  try {
    const checkUrl = getCheckUrl(monitor)

    // SSRF guard: skip monitors with private/internal URLs
    const urlCheck = await validateMonitorUrl(checkUrl)
    if (!urlCheck.valid) {
      console.warn(
        `[checker] Skipping ${monitor.name} [${monitor.id}]: ${urlCheck.error}`,
      )
      return
    }

    const check = await runHttpCheck(monitor, checkUrl)

    const checkResult: CheckResult = {
      monitorId: monitor.id,
      timestamp: new Date().toISOString(),
      statusCode: check.statusCode,
      responseTime: check.responseTime,
      isUp: check.isUp,
      ...(check.error !== undefined && { error: check.error }),
      ...(check.healthStatus !== undefined && { healthStatus: check.healthStatus }),
      ...(check.checks !== undefined && { checks: check.checks }),
      ttl: Math.floor(Date.now() / 1000) + CHECK_TTL_SECONDS,
    }

    await writeCheckResult(checkResult)

    const existingState = await getMonitorState(monitor.id)
    const { nextState, alertPayload } = computeNextState(
      monitor,
      existingState,
      checkResult,
    )

    await putMonitorState(nextState)

    if (alertPayload) {
      try {
        await sendAlert(alertPayload)
        console.log(
          `[checker] Alert sent (${alertPayload.type}) for ${monitor.name} [${monitor.id}]`,
        )
      } catch (alertError) {
        console.error(
          `[checker] Failed to send ${alertPayload.type} alert for ${monitor.name} [${monitor.id}]`,
          alertError,
        )
      }
    }

    console.log(
      `[checker] ${monitor.name}: isUp=${checkResult.isUp}${checkResult.healthStatus ? ` health=${checkResult.healthStatus}` : ''} status=${checkResult.statusCode ?? 'null'} rt=${checkResult.responseTime}ms`,
    )
  } catch (error) {
    console.error(
      `[checker] Unhandled error processing ${monitor.name} [${monitor.id}]`,
      error,
    )
  }
}

// ---------------------------------------------------------------------------
// HTTP check engine
// ---------------------------------------------------------------------------

async function runHttpCheck(monitor: Monitor, url: string): Promise<CheckEngineResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  const started = Date.now()

  const headers: Record<string, string> = {}
  if (monitor.healthCheckEnabled) {
    const token = process.env.HEALTH_CHECK_TOKEN
    if (token) headers['X-Health-Token'] = token
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers,
    })

    const responseTime = Date.now() - started
    const statusCode = response.status

    // For health-check-enabled monitors, parse the response body
    if (monitor.healthCheckEnabled) {
      try {
        const text = await response.text()
        const body = JSON.parse(text)
        const healthStatus: 'healthy' | 'degraded' | 'unhealthy' =
          body.status === 'degraded' ? 'degraded'
          : body.status === 'unhealthy' ? 'unhealthy'
          : 'healthy'

        return {
          statusCode,
          responseTime,
          isUp: healthStatus !== 'unhealthy',
          healthStatus,
          checks: body.checks,
        }
      } catch {
        // JSON parse failed — fall back to status code check
        const isUp = statusCode === monitor.expectedStatus
        return { statusCode, responseTime, isUp }
      }
    }

    // Non-health-check monitors: simple status code comparison
    const isUp = statusCode === monitor.expectedStatus
    return { statusCode, responseTime, isUp }
  } catch (err: unknown) {
    const responseTime = Date.now() - started
    return {
      statusCode: null,
      responseTime,
      isUp: false,
      error: normalizeError(err),
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ---------------------------------------------------------------------------
// Alert state machine
// ---------------------------------------------------------------------------

function computeNextState(
  monitor: Monitor,
  currentState: MonitorState | null,
  checkResult: CheckResult,
): { nextState: MonitorState; alertPayload: AlertPayload | null } {
  const now = checkResult.timestamp
  const isDegraded = checkResult.healthStatus === 'degraded'

  // First-ever check — seed state, no alert
  if (!currentState) {
    const firstState: MonitorState = {
      monitorId: monitor.id,
      currentStatus: checkResult.isUp
        ? (isDegraded ? 'degraded' : 'up')
        : 'unknown',
      lastCheckedAt: now,
      lastStatusChange: now,
      consecutiveFailures: checkResult.isUp ? 0 : 1,
      downSince: null,
      lastResponseTime: checkResult.responseTime,
      lastStatusCode: checkResult.statusCode,
      lastError: checkResult.error ?? null,
      ...(checkResult.checks && { lastChecks: checkResult.checks }),
    }
    return { nextState: firstState, alertPayload: null }
  }

  // Base next state — always update the "last" fields
  let nextState: MonitorState = {
    ...currentState,
    lastCheckedAt: now,
    lastResponseTime: checkResult.responseTime,
    lastStatusCode: checkResult.statusCode,
    lastError: checkResult.error ?? null,
    ...(checkResult.checks !== undefined
      ? { lastChecks: checkResult.checks }
      : currentState.lastChecks !== undefined
        ? { lastChecks: currentState.lastChecks }
        : {}),
  }

  let alertPayload: AlertPayload | null = null

  if (checkResult.isUp) {
    // Successful check (healthy or degraded) — reset failure counter
    const newStatus: 'up' | 'degraded' = isDegraded ? 'degraded' : 'up'

    if (currentState.currentStatus === 'down') {
      // ---- Recovery (from down → up or down → degraded) ----
      nextState = {
        ...nextState,
        currentStatus: newStatus,
        lastStatusChange: now,
        consecutiveFailures: 0,
        downSince: null,
      }
      alertPayload = {
        type: 'recovery',
        monitor,
        state: nextState,
        checkResult,
        downtimeDuration: formatDowntime(currentState.downSince, now),
      }
    } else {
      // ---- Still up / degraded (or recovered from unknown) ----
      nextState = {
        ...nextState,
        currentStatus: newStatus,
        consecutiveFailures: 0,
        // Only update lastStatusChange if status actually changed
        ...(currentState.currentStatus !== newStatus && { lastStatusChange: now }),
      }
    }
  } else {
    // Check failed (unhealthy / network error)
    const failures = currentState.consecutiveFailures + 1

    if (
      (currentState.currentStatus === 'up' ||
        currentState.currentStatus === 'degraded' ||
        currentState.currentStatus === 'unknown') &&
      failures >= 3
    ) {
      // ---- Transition to down ----
      nextState = {
        ...nextState,
        currentStatus: 'down',
        lastStatusChange: now,
        consecutiveFailures: failures,
        downSince: now,
      }
      alertPayload = {
        type: 'down',
        monitor,
        state: nextState,
        checkResult,
      }
    } else {
      // ---- Increment failures, no alert yet ----
      nextState = {
        ...nextState,
        consecutiveFailures: failures,
      }
    }
  }

  return { nextState, alertPayload }
}

// ---------------------------------------------------------------------------
// SMTP2Go email alerts
// ---------------------------------------------------------------------------

async function sendAlert(payload: AlertPayload): Promise<void> {
  const apiKey = process.env.SMTP2GO_API_KEY
  if (!apiKey) {
    throw new Error('Missing SMTP2GO_API_KEY environment variable')
  }

  if (!payload.monitor.alertEmails.length) {
    console.log(`[checker] No alert recipients for ${payload.monitor.name}; skipping`)
    return
  }

  const { subject, htmlBody } = buildAlertEmail(payload)

  const res = await fetch(SMTP2GO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      to: payload.monitor.alertEmails,
      sender: SMTP2GO_FROM,
      subject,
      html_body: htmlBody,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>')
    throw new Error(`SMTP2Go request failed (${res.status}): ${text}`)
  }
}

function buildAlertEmail(payload: AlertPayload): {
  subject: string
  htmlBody: string
} {
  const name = escapeHtml(payload.monitor.name)
  const url = escapeHtml(payload.monitor.url)
  const time = escapeHtml(payload.checkResult.timestamp)

  if (payload.type === 'down') {
    const detail =
      payload.checkResult.statusCode !== null
        ? `Status code: ${payload.checkResult.statusCode}`
        : `Error: ${escapeHtml(payload.checkResult.error ?? 'Unknown error')}`

    return {
      subject: `🔴 DOWN: ${payload.monitor.name}`,
      htmlBody: `
<h2 style="color:#dc2626">🔴 Monitor Down</h2>
<p><strong>Monitor:</strong> ${name}</p>
<p><strong>URL:</strong> <a href="${url}">${url}</a></p>
<p><strong>Result:</strong> ${detail}</p>
<p><strong>Detected at:</strong> ${time}</p>
<p style="color:#6b7280"><em>This is the second consecutive failure.</em></p>
`.trim(),
    }
  }

  return {
    subject: `🟢 RECOVERED: ${payload.monitor.name}`,
    htmlBody: `
<h2 style="color:#16a34a">🟢 Monitor Recovered</h2>
<p><strong>Monitor:</strong> ${name}</p>
<p><strong>URL:</strong> <a href="${url}">${url}</a></p>
<p><strong>Downtime:</strong> ${escapeHtml(payload.downtimeDuration ?? 'Unknown')}</p>
<p><strong>Recovered at:</strong> ${time}</p>
`.trim(),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDowntime(downSince: string | null, recoveredAt: string): string {
  if (!downSince) return 'Unknown'

  const startMs = Date.parse(downSince)
  const endMs = Date.parse(recoveredAt)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return 'Unknown'

  const totalMinutes = Math.floor((endMs - startMs) / 60_000)
  if (totalMinutes < 1) return 'less than a minute'
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const hourLabel = `${hours} hour${hours === 1 ? '' : 's'}`
  if (minutes === 0) return hourLabel
  return `${hourLabel} ${minutes} minute${minutes === 1 ? '' : 's'}`
}

function normalizeError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Request timed out after 10s'
  }
  if (err instanceof Error) {
    // Node fetch wraps the real error in .cause
    const cause = (err as any).cause
    if (cause instanceof Error) return `${err.message}: ${cause.message}`
    return err.message
  }
  return 'Unknown network error'
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
