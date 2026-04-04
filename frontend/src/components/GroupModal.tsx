import { useState, useEffect, useRef } from 'react'
import type { Group } from '../types'
import { uploadGroupLogo } from '../api'

interface Props {
  group?: Group | null
  onSave: (data: {
    name: string
    slug?: string
    brand?: { primary: string; accent?: string }
    isActive?: boolean
    logoUrl?: string | null
    logoKey?: string | null
  }) => Promise<void>
  onClose: () => void
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function GroupModal({ group, onSave, onClose }: Props) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [customBrand, setCustomBrand] = useState(false)
  const [primary, setPrimary] = useState('#0d9488')
  const [accent, setAccent] = useState('#14b8a6')
  const [primaryHex, setPrimaryHex] = useState('#0d9488')
  const [accentHex, setAccentHex] = useState('#14b8a6')
  const [isActive, setIsActive] = useState(true)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = Boolean(group)

  useEffect(() => {
    if (group) {
      setName(group.name)
      setSlug(group.slug)
      setIsActive(group.isActive)
      if (group.brand) {
        setCustomBrand(true)
        setPrimary(group.brand.primary)
        setPrimaryHex(group.brand.primary)
        if (group.brand.accent) {
          setAccent(group.brand.accent)
          setAccentHex(group.brand.accent)
        }
      }
      if (group.logoUrl) {
        setLogoPreview(group.logoUrl)
      }
    }
  }, [group])

  const handleNameChange = (val: string) => {
    setName(val)
    if (!isEditing) {
      setSlug(slugify(val))
    }
  }

  const handlePrimaryChange = (val: string) => {
    setPrimary(val)
    setPrimaryHex(val)
  }

  const handlePrimaryHexChange = (val: string) => {
    setPrimaryHex(val)
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setPrimary(val)
    }
  }

  const handleAccentChange = (val: string) => {
    setAccent(val)
    setAccentHex(val)
  }

  const handleAccentHexChange = (val: string) => {
    setAccentHex(val)
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setAccent(val)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setLogoPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) return setError('Name is required')
    if (!isEditing && !slug.trim()) return setError('Slug is required')

    setSaving(true)
    try {
      let logoUrl: string | null | undefined = undefined
      let logoKey: string | null | undefined = undefined

      if (isEditing && logoFile && group?.slug) {
        const result = await uploadGroupLogo(group.slug, logoFile)
        logoUrl = result.logoUrl
        logoKey = result.logoKey
      }

      await onSave({
        name: name.trim(),
        ...(isEditing ? {} : { slug: slug.trim() }),
        brand: customBrand
          ? { primary, accent: accent || undefined }
          : undefined,
        isActive,
        ...(logoUrl !== undefined ? { logoUrl, logoKey } : {}),
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
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {group ? 'Edit Group' : 'Add Group'}
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
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Slug {isEditing ? '' : '*'}
            </label>
            <input
              className={`${inputCls} ${isEditing ? 'cursor-not-allowed opacity-50' : ''}`}
              value={slug}
              onChange={(e) => !isEditing && setSlug(e.target.value)}
              disabled={isEditing}
              placeholder="acme-corp"
            />
            {!isEditing && (
              <p className="mt-1 text-xs text-zinc-600">
                Auto-generated from name. Used in the public status URL.
              </p>
            )}
          </div>

          {/* Custom brand colors toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={customBrand}
              onChange={(e) => setCustomBrand(e.target.checked)}
              className="accent-teal-500"
            />
            <span className="text-sm text-zinc-300">Custom brand colors</span>
          </label>

          {customBrand && (
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
              {/* Primary color */}
              <div>
                <label className="mb-1.5 block text-xs text-zinc-500">
                  Primary color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primary}
                    onChange={(e) => handlePrimaryChange(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
                  />
                  <input
                    className={`${inputCls} font-mono`}
                    value={primaryHex}
                    onChange={(e) => handlePrimaryHexChange(e.target.value)}
                    placeholder="#0d9488"
                    maxLength={7}
                  />
                </div>
              </div>

              {/* Accent color */}
              <div>
                <label className="mb-1.5 block text-xs text-zinc-500">
                  Accent color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => handleAccentChange(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
                  />
                  <input
                    className={`${inputCls} font-mono`}
                    value={accentHex}
                    onChange={(e) => handleAccentHexChange(e.target.value)}
                    placeholder="#14b8a6"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Logo upload — only shown when editing */}
          {isEditing && (
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Logo</label>
              {logoPreview && (
                <div className="mb-2 flex items-center gap-3">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-12 w-12 rounded border border-zinc-700 object-contain bg-zinc-800"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setLogoFile(null)
                      setLogoPreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="text-xs text-zinc-500 hover:text-red-400 transition"
                  >
                    Remove
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                onChange={handleFileChange}
                className="w-full text-sm text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200 file:cursor-pointer hover:file:bg-zinc-600 transition"
              />
              <p className="mt-1 text-xs text-zinc-600">
                Accepted formats: PNG, SVG, WebP, JPEG
              </p>
            </div>
          )}

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
