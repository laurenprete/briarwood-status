/**
 * Visual uptime bar — one block per day for the last 30 days.
 *
 * Green  = 100% of checks passed (clean day)
 * Amber  = >=97% passed (brief hiccup, recovered quickly)
 * Red    = <97% passed (real outage — roughly 43+ min of downtime)
 * Gray   = no check data for that day
 */

type DayUptime = { date: string; uptime: number | null; affectedSubsystems?: string[] }

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function UptimeBar({
  dailyUptime,
}: {
  dailyUptime: DayUptime[]
}) {
  // Pad to 30 blocks if we have fewer days of data
  const days = 30
  const padded: DayUptime[] = []
  const startIndex = Math.max(0, days - dailyUptime.length)
  for (let i = 0; i < startIndex; i++) {
    padded.push({ date: '', uptime: null })
  }
  padded.push(...dailyUptime.slice(-days))

  function color(uptime: number | null): string {
    if (uptime === null) return 'bg-zinc-700'
    if (uptime >= 100) return 'bg-green-500'
    if (uptime >= 97) return 'bg-amber-500'
    return 'bg-red-500'
  }

  function tooltip(day: DayUptime): string {
    if (!day.date) return 'No data'
    const date = formatDate(day.date)

    if (day.uptime === null) return `${date}\nNo data`

    const lines = [date, `Uptime: ${day.uptime.toFixed(1)}%`]

    if (day.affectedSubsystems && day.affectedSubsystems.length > 0) {
      lines.push(`Affected: ${day.affectedSubsystems.join(', ')}`)
    }

    return lines.join('\n')
  }

  return (
    <div className="flex gap-[2px]">
      {padded.map((day, i) => (
        <div
          key={i}
          className={`h-6 flex-1 rounded-[2px] ${color(day.uptime)} transition-colors`}
          title={tooltip(day)}
        />
      ))}
    </div>
  )
}
