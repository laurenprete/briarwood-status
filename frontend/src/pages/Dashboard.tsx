import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getStatus } from '../api'
import type { StatusSummary, StatusMonitor } from '../types'
import StatusBadge from '../components/StatusBadge'

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

function MonitorCard({ m }: { m: StatusMonitor }) {
  return (
    <Link
      to={`/monitors/${m.id}`}
      className="group rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium text-zinc-200 group-hover:text-teal-400 transition inline-flex items-center gap-2">
          {m.name}
          <a
            href={m.url}
            target="_blank"
            rel="noreferrer"
            title={m.url}
            className="text-zinc-600 hover:text-teal-400 transition"
            onClick={(e) => e.stopPropagation()}
          >
            <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
          </a>
        </h3>
        <StatusBadge status={m.currentStatus} />
      </div>

      <p className="mb-3 truncate text-xs text-zinc-500">{m.url}</p>

      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-zinc-400">
          {m.lastResponseTime !== null ? `${m.lastResponseTime}ms` : '—'}
        </span>
        <span className="text-xs text-zinc-600">
          {timeAgo(m.lastCheckedAt)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-md bg-zinc-800/50 px-3 py-2 text-center text-xs">
        <div>
          <div className="text-zinc-500">24h</div>
          <div className="font-medium text-zinc-300">
            {m.uptime24h !== null ? `${m.uptime24h}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-zinc-500">7d</div>
          <div className="font-medium text-zinc-300">
            {m.uptime7d !== null ? `${m.uptime7d}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-zinc-500">30d</div>
          <div className="font-medium text-zinc-300">
            {m.uptime30d !== null ? `${m.uptime30d}%` : '—'}
          </div>
        </div>
      </div>
    </Link>
  )
}

function MonitorGroups({ monitors }: { monitors: StatusMonitor[] }) {
  const groups = useMemo(() => groupMonitors(monitors), [monitors])
  const showHeaders = groups.length > 1

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.name}>
          {showHeaders && (
            <h2 className="mb-3 border-b border-zinc-800 pb-2 text-sm font-medium text-zinc-400">
              {g.name}
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.monitors.map((m) => (
              <MonitorCard key={m.id} m={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [status, setStatus] = useState<StatusSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStatus()
      .then(setStatus)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
        <Link
          to="/admin"
          className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 transition"
        >
          <i className="fa-solid fa-plus mr-1.5" />
          Add Monitor
        </Link>
      </div>

      {loading && (
        <div className="py-20 text-center text-zinc-500">
          <i className="fa-solid fa-spinner fa-spin mr-2" />
          Loading...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <i className="fa-solid fa-circle-exclamation mr-2" />
          {error}
        </div>
      )}

      {status && status.monitors.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 py-20 text-center">
          <i className="fa-solid fa-chart-simple mb-3 text-3xl text-zinc-700" />
          <p className="text-zinc-500">No monitors configured yet.</p>
          <Link
            to="/admin"
            className="mt-3 inline-block text-sm text-teal-400 hover:text-teal-300"
          >
            Add your first monitor &rarr;
          </Link>
        </div>
      )}

      {status && status.monitors.length > 0 && (
        <MonitorGroups monitors={status.monitors} />
      )}
    </div>
  )
}
