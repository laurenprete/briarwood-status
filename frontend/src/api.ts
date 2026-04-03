import type {
  Monitor,
  CheckResult,
  StatusSummary,
  CreateMonitorBody,
  UpdateMonitorBody,
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

export function getStatus(): Promise<StatusSummary> {
  return request('/status')
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
