export interface Monitor {
  id: string
  name: string
  group?: string
  url: string
  expectedStatus: number
  isActive: boolean
  alertEmails: string[]
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

export interface StatusMonitor {
  id: string
  name: string
  group?: string
  url: string
  currentStatus: 'up' | 'down' | 'unknown'
  lastCheckedAt: string | null
  lastResponseTime: number | null
  uptime24h: number | null
  uptime7d: number | null
  uptime30d: number | null
}

export interface StatusSummary {
  monitors: StatusMonitor[]
  overall: 'operational' | 'degraded' | 'outage'
  lastUpdated: string
}

export type CreateMonitorBody = {
  name: string
  url: string
  group?: string
  expectedStatus?: number
  alertEmails?: string[]
  isActive?: boolean
}

export type UpdateMonitorBody = Partial<
  Pick<Monitor, 'name' | 'group' | 'url' | 'expectedStatus' | 'alertEmails' | 'isActive'>
>
