import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getStatus } from '../api'
import type { StatusSummary, StatusMonitor } from '../types'
import UptimeBar from '../components/UptimeBar'
import { isLoggedIn } from '../auth'

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function groupMonitors<T extends { group?: string }>(
  monitors: T[],
): { name: string; monitors: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const m of monitors) {
    const key = m.group?.trim() || 'Other'
    const arr = groups.get(key) || []
    arr.push(m)
    groups.set(key, arr)
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => {
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })
  return sorted.map(([name, items]) => ({ name, monitors: items }))
}

const overallConfig = {
  operational: {
    label: 'All Systems Operational',
    bg: 'bg-green-500/10 border border-green-500/20',
    text: 'text-green-400',
    icon: 'fa-circle-check',
  },
  degraded: {
    label: 'Partial System Outage',
    bg: 'bg-amber-500/10 border border-amber-500/20',
    text: 'text-amber-400',
    icon: 'fa-triangle-exclamation',
  },
  outage: {
    label: 'Major System Outage',
    bg: 'bg-red-500/10 border border-red-500/20',
    text: 'text-red-400',
    icon: 'fa-circle-xmark',
  },
}

function MonitorCard({ m }: { m: StatusMonitor }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              m.currentStatus === 'up'
                ? 'bg-green-500'
                : m.currentStatus === 'degraded'
                  ? 'bg-amber-500'
                  : m.currentStatus === 'down'
                    ? 'bg-red-500'
                    : 'bg-zinc-500'
            }`}
          />
          <span className="text-sm font-medium text-zinc-100">{m.name}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>
            {m.uptime30d !== null ? `${m.uptime30d.toFixed(2)}%` : '—'}
          </span>
          <span>{timeAgo(m.lastCheckedAt)}</span>
        </div>
      </div>
      <UptimeBar dailyUptime={m.dailyUptime} />
      {m.lastChecks && Object.keys(m.lastChecks).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(m.lastChecks).map(([name, check]) => (
            <div key={name} className="flex items-center gap-1.5 text-xs">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  check.status === 'healthy'
                    ? 'bg-green-500'
                    : check.status === 'degraded'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
              />
              <span className="text-zinc-500">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MonitorGroups({ monitors }: { monitors: StatusMonitor[] }) {
  const groups = useMemo(() => groupMonitors(monitors), [monitors])
  const showHeaders = groups.length > 1

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.name}>
          {showHeaders && (
            <h2 className="mb-2 border-b border-zinc-800 pb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
              {g.name}
            </h2>
          )}
          <div className="space-y-2">
            {g.monitors.map((m) => (
              <MonitorCard key={m.id} m={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function StatusPage() {
  const [searchParams] = useSearchParams()
  const groupFilter = searchParams.get('group')

  const [status, setStatus] = useState<StatusSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStatus()
      .then(setStatus)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const filteredMonitors = useMemo(() => {
    if (!status) return []
    if (!groupFilter) return status.monitors
    return status.monitors.filter(
      (m) => m.group?.toLowerCase() === groupFilter.toLowerCase(),
    )
  }, [status, groupFilter])

  const filteredOverall = useMemo((): 'operational' | 'degraded' | 'outage' => {
    if (!groupFilter || !status) return status?.overall ?? 'operational'
    if (filteredMonitors.some((m) => m.currentStatus === 'down')) return 'outage'
    if (filteredMonitors.some((m) => m.currentStatus === 'degraded' || m.currentStatus === 'unknown')) return 'degraded'
    return 'operational'
  }, [status, groupFilter, filteredMonitors])

  const oc = overallConfig[filteredOverall]

  return (
    <div className="min-h-screen bg-zinc-950 font-sans">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-shield-halved text-lg text-teal-400" />
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              {groupFilter ? `${groupFilter} System Status` : 'Briarwood Software System Status'}
            </span>
          </div>
          {isLoggedIn() && (
            <a href="/dashboard" className="text-xs text-zinc-500 hover:text-teal-400">
              <i className="fa-solid fa-gear" /> Admin
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">
        {loading && (
          <div className="py-20 text-center text-zinc-500">
            <i className="fa-solid fa-spinner fa-spin mr-2" />
            Loading status...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <i className="fa-solid fa-circle-exclamation mr-2" />
            Failed to load status: {error}
          </div>
        )}

        {status && (
          <>
            {/* Overall status banner */}
            {oc && (
              <div
                className={`mb-5 flex items-center gap-3 rounded-lg ${oc.bg} px-4 py-3`}
              >
                <i className={`fa-solid ${oc.icon} text-lg ${oc.text}`} />
                <span className={`text-sm font-medium ${oc.text}`}>{oc.label}</span>
              </div>
            )}

            {/* Monitor cards */}
            {filteredMonitors.length === 0 ? (
              <div className="py-20 text-center text-zinc-500">
                {groupFilter ? 'No monitors found for this group.' : 'No monitors configured yet.'}
              </div>
            ) : (
              <MonitorGroups monitors={filteredMonitors} />
            )}

            {/* Timestamp */}
            <p className="mt-5 text-center text-xs text-zinc-600">
              Last updated:{' '}
              {new Date(status.lastUpdated).toLocaleString()}
            </p>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-2 text-center text-xs text-zinc-600">
        Powered by{' '}
        <a href="https://briarwoodsoftware.com" target="_blank" rel="noreferrer" className="font-medium text-zinc-400 hover:text-teal-400">Briarwood Software</a>
      </footer>
    </div>
  )
}
