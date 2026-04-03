import { useState, useEffect } from 'react'
import type { Monitor, CreateMonitorBody } from '../types'

interface Props {
  monitor?: Monitor | null
  onSave: (data: CreateMonitorBody) => Promise<void>
  onClose: () => void
}

export default function MonitorModal({ monitor, onSave, onClose }: Props) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [url, setUrl] = useState('')
  const [expectedStatus, setExpectedStatus] = useState('200')
  const [alertEmails, setAlertEmails] = useState(monitor ? '' : 'contact@briarwoodsoftware.com')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (monitor) {
      setName(monitor.name)
      setGroup(monitor.group || '')
      setUrl(monitor.url)
      setExpectedStatus(String(monitor.expectedStatus))
      setAlertEmails(monitor.alertEmails.join(', '))
      setIsActive(monitor.isActive)
    }
  }, [monitor])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) return setError('Name is required')
    if (!url.trim()) return setError('URL is required')

    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        group: group.trim() || undefined,
        url: url.trim(),
        expectedStatus: parseInt(expectedStatus) || 200,
        alertEmails: alertEmails
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        isActive,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-sm text-zinc-100 focus:border-teal-400 focus:outline-none transition'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {monitor ? 'Edit Monitor' : 'Add Monitor'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name *</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Website"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Group (optional)
            </label>
            <input
              className={inputCls}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="e.g. GravMagnet, Briarwood"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">URL *</label>
            <input
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Expected Status Code
            </label>
            <input
              className={inputCls}
              type="number"
              value={expectedStatus}
              onChange={(e) => setExpectedStatus(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Alert Emails (comma-separated)
            </label>
            <input
              className={inputCls}
              value={alertEmails}
              onChange={(e) => setAlertEmails(e.target.value)}
              placeholder="admin@example.com, ops@example.com"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-teal-500"
            />
            <span className="text-sm text-zinc-300">Active</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 transition"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
