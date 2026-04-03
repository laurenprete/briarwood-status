/**
 * Visual uptime bar — one block per day for the last 30 days.
 *
 * Green  = 100% of checks passed (clean day)
 * Amber  = >=97% passed (brief hiccup, recovered quickly)
 * Red    = <97% passed (real outage — roughly 43+ min of downtime)
 * Gray   = no check data for that day
 */

type DayUptime = { date: string; uptime: number | null }

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
    if (day.uptime === null) return day.date ? `${day.date}: No data` : 'No data'
    return `${day.date}: ${day.uptime.toFixed(1)}%`
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
