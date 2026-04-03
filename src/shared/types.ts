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
}

export interface MonitorState {
  monitorId: string
  currentStatus: 'up' | 'down' | 'unknown'
  lastCheckedAt: string | null
  lastStatusChange: string | null
  consecutiveFailures: number
  downSince: string | null
  lastResponseTime: number | null
  lastStatusCode: number | null
  lastError: string | null
}

export interface StatusSummary {
  monitors: Array<{
    id: string
    name: string
    url: string
    group?: string
    currentStatus: 'up' | 'down' | 'unknown'
    lastCheckedAt: string | null
    lastResponseTime: number | null
    uptime24h: number | null
    uptime7d: number | null
    uptime30d: number | null
    dailyUptime: Array<{ date: string; uptime: number | null }>
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
