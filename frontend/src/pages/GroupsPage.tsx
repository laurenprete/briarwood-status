import { useState, useEffect, useCallback } from 'react'
import { getGroups, createGroup, updateGroup, deleteGroup } from '../api'
import type { Group } from '../types'
import GroupModal from '../components/GroupModal'

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchGroups = useCallback(async () => {
    try {
      const data = await getGroups()
      setGroups(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const handleSave = async (data: {
    name: string
    slug?: string
    brand?: { primary: string; accent?: string }
    isActive?: boolean
    logoUrl?: string | null
    logoKey?: string | null
  }) => {
    if (editing) {
      await updateGroup(editing.slug, data)
    } else {
      await createGroup(data as { name: string; slug?: string; brand?: { primary: string; accent?: string }; isActive?: boolean })
    }
    await fetchGroups()
  }

  const handleDelete = async (slug: string) => {
    try {
      await deleteGroup(slug)
      setDeleting(null)
      await fetchGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group')
    }
  }

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (g: Group) => {
    setEditing(g)
    setModalOpen(true)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Groups</h1>
        <button
          onClick={openAdd}
          className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 transition"
        >
          <i className="fa-solid fa-plus mr-1.5" />
          Add Group
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
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 py-20 text-center">
          <i className="fa-solid fa-layer-group mb-3 text-3xl text-zinc-700" />
          <p className="text-zinc-500">No groups configured yet.</p>
          <button
            onClick={openAdd}
            className="mt-3 text-sm text-teal-400 hover:text-teal-300"
          >
            Add your first group &rarr;
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.slug}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3"
            >
              {/* Logo + name row */}
              <div className="flex items-center gap-3">
                {g.logoUrl ? (
                  <img
                    src={g.logoUrl}
                    alt={`${g.name} logo`}
                    className="h-10 w-10 rounded border border-zinc-700 object-contain bg-zinc-800 shrink-0"
                  />
                ) : (
                  <div
                    className="h-10 w-10 rounded border border-zinc-700 bg-zinc-800 flex items-center justify-center shrink-0 text-base font-semibold text-zinc-400"
                    style={g.brand ? { borderColor: g.brand.primary + '66' } : undefined}
                  >
                    {g.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-zinc-100 truncate">{g.name}</span>
                    {!g.isActive && (
                      <span className="rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-400">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono truncate">{g.slug}</div>
                </div>
              </div>

              {/* Brand color swatches */}
              {g.brand && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded border border-zinc-700"
                    style={{ backgroundColor: g.brand.primary }}
                    title={g.brand.primary}
                  />
                  <span className="text-xs text-zinc-600 font-mono">
                    {g.brand.primary}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="mt-auto flex items-center justify-end gap-1 pt-1 border-t border-zinc-800">
                {deleting === g.slug ? (
                  <span className="flex items-center gap-2 text-xs mr-auto">
                    <span className="text-red-400">Delete?</span>
                    <button
                      onClick={() => handleDelete(g.slug)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleting(null)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <>
                    <a
                      href={`/${g.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
                      title="Preview public page"
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square" />
                    </a>
                    <button
                      onClick={() => openEdit(g)}
                      className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
                      title="Edit group"
                    >
                      <i className="fa-solid fa-pen-to-square" />
                    </button>
                    <button
                      onClick={() => setDeleting(g.slug)}
                      className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition"
                      title="Delete group"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <GroupModal
          group={editing}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
