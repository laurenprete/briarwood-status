import { useState, useEffect, useCallback } from 'react'
import {
  getMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
} from '../api'
import type { Monitor, CreateMonitorBody } from '../types'
import MonitorModal from '../components/MonitorModal'

export default function AdminPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Monitor | null>(null)

  // Delete confirmation
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchMonitors = useCallback(async () => {
    try {
      const data = await getMonitors()
      setMonitors(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMonitors()
  }, [fetchMonitors])

  const handleSave = async (data: CreateMonitorBody) => {
    if (editing) {
      await updateMonitor(editing.id, data)
    } else {
      await createMonitor(data)
    }
    await fetchMonitors()
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMonitor(id)
      setDeleting(null)
      await fetchMonitors()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (m: Monitor) => {
    setEditing(m)
    setModalOpen(true)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">
          Manage Monitors
        </h1>
        <button
          onClick={openAdd}
          className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 transition"
        >
          <i className="fa-solid fa-plus mr-1.5" />
          Add Monitor
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
          <button
            onClick={() => setError('')}
            className="ml-2 text-red-300 hover:text-red-100"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-zinc-500">
          <i className="fa-solid fa-spinner fa-spin mr-2" />
          Loading...
        </div>
      ) : monitors.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 py-20 text-center">
          <i className="fa-solid fa-server mb-3 text-3xl text-zinc-700" />
          <p className="text-zinc-500">No monitors configured yet.</p>
          <button
            onClick={openAdd}
            className="mt-3 text-sm text-teal-400 hover:text-teal-300"
          >
            Add your first monitor &rarr;
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80 text-left text-xs text-zinc-500">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Group</th>
                <th className="px-4 py-2.5">URL</th>
                <th className="px-4 py-2.5">Expected</th>
                <th className="px-4 py-2.5">Alerts</th>
                <th className="px-4 py-2.5">Active</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3 font-medium text-zinc-200">
                    {m.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {m.group || '—'}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-zinc-400">
                    {m.url}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {m.expectedStatus}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {m.alertEmails.length > 0
                      ? m.alertEmails.join(', ')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
                        m.isActive
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-zinc-500/10 text-zinc-500'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          m.isActive ? 'bg-green-500' : 'bg-zinc-600'
                        }`}
                      />
                      {m.isActive ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deleting === m.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-red-400">Delete?</span>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleting(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-2">
                        <button
                          onClick={() => openEdit(m)}
                          className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
                        >
                          <i className="fa-solid fa-pen-to-square" />
                        </button>
                        <button
                          onClick={() => setDeleting(m.id)}
                          className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition"
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <MonitorModal
          monitor={editing}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
