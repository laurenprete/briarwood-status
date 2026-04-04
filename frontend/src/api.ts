import type {
  Monitor,
  CheckResult,
  StatusSummary,
  CreateMonitorBody,
  UpdateMonitorBody,
  Group,
} from './types'
import { getToken } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// --- Public ---

export function getStatus(groupSlug?: string): Promise<StatusSummary> {
  const params = groupSlug ? `?group=${encodeURIComponent(groupSlug)}` : ''
  return request(`/status${params}`)
}

// --- Monitors ---

export function getMonitors(): Promise<Monitor[]> {
  return request('/monitors')
}

export function getMonitorChecks(
  id: string,
  range: '24h' | '7d' | '30d' = '24h',
): Promise<CheckResult[]> {
  return request(`/monitors/${id}/checks?range=${range}`)
}

export function createMonitor(body: CreateMonitorBody): Promise<Monitor> {
  return request('/monitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function updateMonitor(
  id: string,
  body: UpdateMonitorBody,
): Promise<Monitor> {
  return request(`/monitors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function deleteMonitor(id: string): Promise<{ success: boolean }> {
  return request(`/monitors/${id}`, { method: 'DELETE' })
}

export interface HealthCheckResult {
  httpStatus: number | null
  status: string
  timestamp?: string
  checks?: Record<string, { status: string; reason?: string; latencyMs?: number; error?: string }>
  error?: string
}

export function runHealthCheck(id: string): Promise<HealthCheckResult> {
  return request(`/monitors/${id}/health-check`, { method: 'POST' })
}

// --- Groups ---

export function getGroups(): Promise<Group[]> {
  return request('/groups')
}

export function createGroup(body: { name: string; slug?: string; brand?: { primary: string }; isActive?: boolean }): Promise<Group> {
  return request('/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function updateGroup(slug: string, body: Record<string, any>): Promise<Group> {
  return request(`/groups/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function deleteGroup(slug: string): Promise<{ success: boolean }> {
  return request(`/groups/${slug}`, { method: 'DELETE' })
}

export async function uploadGroupLogo(slug: string, file: File): Promise<{ logoUrl: string; logoKey: string }> {
  const { uploadUrl, publicUrl, key } = await request<{ uploadUrl: string; publicUrl: string; key: string }>(
    `/groups/${slug}/logo-upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type }),
    }
  )

  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })

  return { logoUrl: publicUrl, logoKey: key }
}
