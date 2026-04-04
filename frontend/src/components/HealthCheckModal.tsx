import { useState, useEffect } from 'react'
import { runHealthCheck } from '../api'
import type { HealthCheckResult } from '../api'

export default function HealthCheckModal({
  monitorId,
  monitorName,
  onClose,
}: {
  monitorId: string
  monitorName: string
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HealthCheckResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await runHealthCheck(monitorId)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run health check')
    } finally {
      setLoading(false)
    }
  }

  const statusColor = (s: string) => {
    if (s === 'healthy') return 'text-green-400'
    if (s === 'degraded') return 'text-amber-400'
    return 'text-red-400'
  }

  const statusDot = (s: string) => {
    if (s === 'healthy') return 'bg-green-500'
    if (s === 'degraded') return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">
            Health Check: {monitorName}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {loading && !result && (
          <div className="py-8 text-center text-zinc-500">
            <i className="fa-solid fa-spinner fa-spin mr-2" />
            Checking...
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Overall status */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${statusDot(result.status)}`} />
                <span className={`text-sm font-medium ${statusColor(result.status)}`}>
                  {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                {result.httpStatus !== null && (
                  <span>HTTP {result.httpStatus}</span>
                )}
                {result.timestamp && (
                  <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                )}
              </div>
            </div>

            {/* Individual checks */}
            {result.checks && Object.keys(result.checks).length > 0 && (
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80 text-left text-xs text-zinc-500">
                      <th className="px-4 py-2">Check</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Latency</th>
                      <th className="px-4 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.checks).map(([name, check]) => (
                      <tr
                        key={name}
                        className="border-b border-zinc-800/50"
                      >
                        <td className="px-4 py-2 font-medium text-zinc-200">
                          {name}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1.5 ${statusColor(check.status)}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot(check.status)}`} />
                            {check.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-zinc-400">
                          {check.latencyMs !== undefined ? `${check.latencyMs}ms` : '—'}
                        </td>
                        <td className="px-4 py-2 text-zinc-400 text-xs">
                          {check.reason || check.error || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Re-run / close */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={run}
                disabled={loading}
                className="rounded px-4 py-1.5 text-sm text-teal-400 hover:text-teal-300 disabled:opacity-50 transition"
              >
                {loading ? 'Checking...' : 'Re-run'}
              </button>
              <button
                onClick={onClose}
                className="rounded px-4 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
