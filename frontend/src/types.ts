export interface Group {
  slug: string
  name: string
  isActive: boolean
  logoUrl?: string
  logoKey?: string
  brand?: {
    primary: string
    accent?: string
  }
  createdAt: string
  updatedAt: string
}

export interface Monitor {
  id: string
  name: string
  group?: string
  url: string
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

export interface StatusMonitor {
  id: string
  name: string
  groupSlug?: string
  groupName?: string
  url: string
  healthCheckEnabled?: boolean
  currentStatus: 'up' | 'degraded' | 'down' | 'unknown'
  lastCheckedAt: string | null
  lastResponseTime: number | null
  lastChecks?: Record<string, { status: string; reason?: string; latencyMs?: number; error?: string }>
  uptime24h: number | null
  uptime7d: number | null
  uptime30d: number | null
  dailyUptime: Array<{ date: string; uptime: number | null; affectedSubsystems?: string[]; affectedReasons?: Record<string, string> }>
}

export interface StatusSummary {
  branding?: {
    name: string
    slug: string
    logoUrl?: string
    brand?: { primary: string; accent?: string }
  }
  monitors: StatusMonitor[]
  overall: 'operational' | 'degraded' | 'outage'
  lastUpdated: string
}

export type CreateMonitorBody = {
  name: string
  url: string
  groupSlug?: string
  expectedStatus?: number
  alertEmails?: string[]
  isActive?: boolean
  healthCheckEnabled?: boolean
  healthCheckPath?: string
  isPublic?: boolean
}

export type UpdateMonitorBody = Partial<
  Pick<Monitor, 'name' | 'group' | 'url' | 'expectedStatus' | 'alertEmails' | 'isActive'>
>
