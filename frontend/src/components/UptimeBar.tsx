/**
 * Visual uptime bar — 30 small blocks representing the last 30 days.
 * Green = up, red = down, gray = unknown / no data.
 * If we only have an uptime percentage (no per-day breakdown), we estimate
 * the number of "down" blocks and cluster them at the end.
 */
export default function UptimeBar({
  uptimePercent,
  days = 30,
}: {
  uptimePercent: number | null
  days?: number
}) {
  const blocks: ('up' | 'down' | 'unknown')[] = []

  if (uptimePercent === null) {
    for (let i = 0; i < days; i++) blocks.push('unknown')
  } else {
    const upDays = Math.round((uptimePercent / 100) * days)
    for (let i = 0; i < days; i++) {
      blocks.push(i < upDays ? 'up' : 'down')
    }
  }

  const color = (s: string) => {
    if (s === 'up') return 'bg-green-500'
    if (s === 'down') return 'bg-red-500'
    return 'bg-zinc-700'
  }

  return (
    <div className="flex gap-[2px]">
      {blocks.map((s, i) => (
        <div
          key={i}
          className={`h-6 flex-1 rounded-[2px] ${color(s)} transition-colors`}
          title={`Day ${i + 1}: ${s}`}
        />
      ))}
    </div>
  )
}
