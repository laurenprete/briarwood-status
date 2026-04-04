export interface Monitor {
  id: string
  name: string
  url: string
  group?: string
  expectedStatus: number
  isActive: boolean
  alertEmails: string[]
  healthCheckEnabled: boolean
  healthCheckPath: string
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface CheckResult {
  monitorId: string
  timestamp: string
  statusCode: number | null
  responseTime: number
  isUp: boolean
  error?: string
  ttl: number
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy'
  checks?: Record<string, { status: string; reason?: string; latencyMs?: number; error?: string }>
}

export interface MonitorState {
  monitorId: string
  currentStatus: 'up' | 'degraded' | 'down' | 'unknown'
  lastCheckedAt: string | null
  lastStatusChange: string | null
  consecutiveFailures: number
  downSince: string | null
  lastResponseTime: number | null
  lastStatusCode: number | null
  lastError: string | null
  lastChecks?: Record<string, { status: string; reason?: string; latencyMs?: number; error?: string }>
}

export interface StatusSummary {
  monitors: Array<{
    id: string
    name: string
    url: string
    group?: string
    healthCheckEnabled: boolean
    currentStatus: 'up' | 'degraded' | 'down' | 'unknown'
    lastCheckedAt: string | null
    lastResponseTime: number | null
    lastChecks?: Record<string, { status: string; reason?: string; latencyMs?: number; error?: string }>
    uptime24h: number | null
    uptime7d: number | null
    uptime30d: number | null
    dailyUptime: Array<{ date: string; uptime: number | null; affectedSubsystems?: string[] }>
  }>
  overall: 'operational' | 'degraded' | 'outage'
  lastUpdated: string
}

export interface AlertPayload {
  type: 'down' | 'recovery'
  monitor: Monitor
  state: MonitorState
  checkResult: CheckResult
  downtimeDuration?: string
}
