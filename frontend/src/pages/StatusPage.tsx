import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
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

function groupMonitors<T extends { groupName?: string }>(
  monitors: T[],
): { name: string; monitors: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const m of monitors) {
    const key = m.groupName?.trim() || 'Other'
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

function MonitorCard({ m, light }: { m: StatusMonitor; light: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${light ? 'border-gray-200 bg-white' : 'border-zinc-800 bg-zinc-900'}`}>
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
          <span className={`text-sm font-medium ${light ? 'text-gray-900' : 'text-zinc-100'}`}>{m.name}</span>
        </div>
        <div className={`flex items-center gap-4 text-xs ${light ? 'text-gray-400' : 'text-zinc-500'}`}>
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
              <span className={light ? 'text-gray-400' : 'text-zinc-500'}>{name}</span>
              {check.status !== 'healthy' && check.reason && (
                <span className={check.status === 'degraded' ? 'text-amber-400/70' : 'text-red-400/70'}>
                  — {check.reason.toLowerCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MonitorGroups({ monitors, light }: { monitors: StatusMonitor[]; light: boolean }) {
  const groups = useMemo(() => groupMonitors(monitors), [monitors])
  const showHeaders = groups.length > 1

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.name}>
          {showHeaders && (
            <h2 className={`mb-2 border-b pb-1.5 text-xs font-medium uppercase tracking-wide ${light ? 'border-gray-200 text-gray-400' : 'border-zinc-800 text-zinc-500'}`}>
              {g.name}
            </h2>
          )}
          <div className="space-y-2">
            {g.monitors.map((m) => (
              <MonitorCard key={m.id} m={m} light={light} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function StatusPage() {
  const { groupSlug } = useParams<{ groupSlug: string }>()
  const groupFilter = groupSlug || null

  const [status, setStatus] = useState<StatusSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const branding = status?.branding
  const light = branding?.theme === 'light'

  useEffect(() => {
    getStatus(groupFilter || undefined)
      .then(setStatus)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [groupFilter])

  const filteredMonitors = useMemo(() => {
    if (!status) return []
    if (!groupFilter) return status.monitors
    return status.monitors.filter(
      (m) => m.groupSlug === groupFilter,
    )
  }, [status, groupFilter])

  const filteredOverall = useMemo((): 'operational' | 'degraded' | 'outage' => {
    if (!groupFilter || !status) return status?.overall ?? 'operational'
    if (filteredMonitors.some((m) => m.currentStatus === 'down')) return 'outage'
    if (filteredMonitors.some((m) => m.currentStatus === 'degraded' || m.currentStatus === 'unknown')) return 'degraded'
    return 'operational'
  }, [status, groupFilter, filteredMonitors])

  const oc = overallConfig[filteredOverall]

  // Block rendering until data loaded to prevent theme flash
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 font-sans flex items-center justify-center">
        <div className="text-zinc-600">
          <i className="fa-solid fa-spinner fa-spin mr-2" />
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen font-sans ${light ? 'bg-gray-50 text-gray-900' : 'bg-zinc-950 text-zinc-100'}`}>
      {/* Header — always white text, brand color bg */}
      <header
        className={`border-b ${light ? 'border-gray-200' : 'border-zinc-800'}`}
        style={{ backgroundColor: branding?.brand?.primary ?? (light ? '#ffffff' : '#18181b') }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-8 w-8 object-contain" />
            ) : (
              <i className={`fa-solid fa-shield-halved text-xl ${branding?.brand ? 'text-white/80' : light ? 'text-gray-400' : 'text-zinc-400'}`} />
            )}
            <span className={`text-base font-semibold tracking-tight ${branding?.brand ? 'text-white' : light ? 'text-gray-900' : 'text-zinc-100'}`}>
              {branding?.name
                ? `${branding.name} System Status`
                : 'Briarwood Software System Status'}
            </span>
          </div>
          {isLoggedIn() && (
            <a href="/dashboard" className={`text-xs ${branding?.brand ? 'text-white/50 hover:text-white/80' : light ? 'text-gray-400 hover:text-gray-600' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <i className="fa-solid fa-gear" /> Admin
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">

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
              <div className={`py-20 text-center ${light ? 'text-gray-400' : 'text-zinc-500'}`}>
                {groupFilter ? 'No monitors found for this group.' : 'No monitors configured yet.'}
              </div>
            ) : (
              <MonitorGroups monitors={filteredMonitors} light={light} />
            )}

            {/* Timestamp */}
            <p className={`mt-5 text-center text-xs ${light ? 'text-gray-400' : 'text-zinc-600'}`}>
              Last updated:{' '}
              {new Date(status.lastUpdated).toLocaleString()}
            </p>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className={`border-t py-3 text-center text-xs ${light ? 'border-gray-200 text-gray-400' : 'border-zinc-800 text-zinc-600'}`}>
        Powered by{' '}
        <a href="https://briarwoodsoftware.com" target="_blank" rel="noreferrer" className={`font-medium ${light ? 'text-gray-500 hover:text-gray-700' : 'text-zinc-400 hover:text-zinc-200'}`}>Briarwood Software</a>
      </footer>
    </div>
  )
}
