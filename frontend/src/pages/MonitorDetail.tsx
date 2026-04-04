import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getStatus, getMonitorChecks } from '../api'
import type { StatusMonitor, CheckResult } from '../types'
import StatusBadge from '../components/StatusBadge'
import ResponseChart from '../components/ResponseChart'

type Range = '24h' | '7d' | '30d'
type StatusFilter = 'all' | 'healthy' | 'degraded' | 'down'

export default function MonitorDetail() {
  const { id } = useParams<{ id: string }>()
  const [monitor, setMonitor] = useState<StatusMonitor | null>(null)
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [range, setRange] = useState<Range>('24h')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [statusData, checkData] = await Promise.all([
        getStatus(),
        getMonitorChecks(id, range),
      ])
      const found = statusData.monitors.find((m) => m.id === id)
      if (found) setMonitor(found)
      else setError('Monitor not found')
      setChecks(checkData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id, range])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredChecks = useMemo(() => {
    if (statusFilter === 'all') return checks
    return checks.filter((c) => {
      if (statusFilter === 'degraded') return c.healthStatus === 'degraded'
      if (statusFilter === 'down') return !c.isUp
      // 'healthy' = up and not degraded
      return c.isUp && c.healthStatus !== 'degraded'
    })
  }, [checks, statusFilter])

  return (
    <div>
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition"
      >
        <i className="fa-solid fa-arrow-left" />
        Back to Dashboard
      </Link>

      {loading && (
        <div className="py-20 text-center text-zinc-500">
          <i className="fa-solid fa-spinner fa-spin mr-2" />
          Loading...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {monitor && (
        <>
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-zinc-100">
                  {monitor.name}
                </h1>
                <StatusBadge status={monitor.currentStatus} />
              </div>
              <p className="mt-1 text-sm text-zinc-500">{monitor.url}</p>
            </div>

            {/* Range toggle */}
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/50">
              {(['24h', '7d', '30d'] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 text-sm transition ${
                    range === r
                      ? 'bg-zinc-800 text-teal-400'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Uptime cards */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            {[
              { label: '24h Uptime', value: monitor.uptime24h },
              { label: '7d Uptime', value: monitor.uptime7d },
              { label: '30d Uptime', value: monitor.uptime30d },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center"
              >
                <div className="text-xs text-zinc-500">{label}</div>
                <div
                  className={`mt-1 text-2xl font-semibold ${
                    value === null
                      ? 'text-zinc-600'
                      : value >= 99.9
                        ? 'text-green-400'
                        : value >= 99
                          ? 'text-yellow-400'
                          : 'text-red-400'
                  }`}
                >
                  {value !== null ? `${value}%` : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Response time chart */}
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-medium text-zinc-400">
              Response Time
            </h2>
            <ResponseChart checks={checks} />
          </div>

          {/* Check history table */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400">
                Check History
              </h2>
              <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/50">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'healthy', label: 'Healthy' },
                  { key: 'degraded', label: 'Degraded' },
                  { key: 'down', label: 'Down' },
                ] as { key: StatusFilter; label: string }[]).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1 text-xs transition ${
                      statusFilter === f.key
                        ? 'bg-zinc-800 text-teal-400'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {f.label}
                    {f.key !== 'all' && checks.length > 0 && (
                      <span className="ml-1 text-zinc-600">
                        {checks.filter((c) =>
                          f.key === 'degraded' ? c.healthStatus === 'degraded'
                          : f.key === 'down' ? !c.isUp
                          : c.isUp && c.healthStatus !== 'degraded'
                        ).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <div className="overflow-x-auto overflow-y-auto max-h-[480px] scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs text-zinc-500">
                      <th className="px-4 py-2.5">Timestamp</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Status Code</th>
                      <th className="px-4 py-2.5">Response Time</th>
                      <th className="px-4 py-2.5">Error</th>
                      <th className="px-4 py-2.5">Subsystems</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChecks.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-zinc-600"
                        >
                          {checks.length === 0
                            ? 'No check data for this range.'
                            : 'No checks match this filter.'}
                        </td>
                      </tr>
                    ) : (
                      [...filteredChecks]
                        .sort(
                          (a, b) =>
                            new Date(b.timestamp).getTime() -
                            new Date(a.timestamp).getTime(),
                        )
                        .map((c, i) => (
                          <tr
                            key={i}
                            className="border-b border-zinc-800/50 hover:bg-zinc-900/50"
                          >
                            <td className="px-4 py-2 text-zinc-300">
                              {new Date(c.timestamp).toLocaleString()}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  c.healthStatus === 'degraded'
                                    ? 'text-amber-400'
                                    : c.isUp
                                      ? 'text-green-400'
                                      : 'text-red-400'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    c.healthStatus === 'degraded'
                                      ? 'bg-amber-500'
                                      : c.isUp
                                        ? 'bg-green-500'
                                        : 'bg-red-500'
                                  }`}
                                />
                                {c.healthStatus === 'degraded'
                                  ? 'Degraded'
                                  : c.isUp
                                    ? 'Healthy'
                                    : 'Down'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-zinc-400">
                              {c.statusCode ?? '—'}
                            </td>
                            <td className="px-4 py-2 text-zinc-400">
                              {c.responseTime}ms
                            </td>
                            <td className="px-4 py-2 text-zinc-600">
                              {c.error
                                ? c.error.substring(0, 50)
                                : '—'}
                            </td>
                            <td className="px-4 py-2">
                              {c.checks && Object.keys(c.checks).length > 0 ? (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                  {Object.entries(c.checks).map(([name, check]) => (
                                    <span
                                      key={name}
                                      className={`inline-flex items-center gap-1 text-xs ${
                                        check.status === 'healthy'
                                          ? 'text-green-400/60'
                                          : check.status === 'degraded'
                                            ? 'text-amber-400'
                                            : 'text-red-400'
                                      }`}
                                    >
                                      <span
                                        className={`h-1 w-1 rounded-full ${
                                          check.status === 'healthy'
                                            ? 'bg-green-500/60'
                                            : check.status === 'degraded'
                                              ? 'bg-amber-500'
                                              : 'bg-red-500'
                                        }`}
                                      />
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-zinc-700">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
