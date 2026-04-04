type Status = 'up' | 'degraded' | 'down' | 'unknown'

const cfg: Record<Status, { label: string; dot: string; bg: string; text: string }> = {
  up: {
    label: 'Up',
    dot: 'bg-green-500',
    bg: 'bg-green-500/10',
    text: 'text-green-400',
  },
  degraded: {
    label: 'Degraded',
    dot: 'bg-amber-500',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
  },
  down: {
    label: 'Down',
    dot: 'bg-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
  },
  unknown: {
    label: 'Unknown',
    dot: 'bg-zinc-500',
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
  },
}

export default function StatusBadge({ status }: { status: Status }) {
  const s = cfg[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}
