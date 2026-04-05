/**
 * Visual uptime bar — one block per day for the last 30 days.
 *
 * Green  = 100% of checks passed (clean day)
 * Amber  = >=97% passed (brief hiccup, recovered quickly)
 * Red    = <97% passed (real outage — roughly 43+ min of downtime)
 * Gray   = no check data for that day
 */

import { useState, useRef } from 'react'

type DayUptime = { date: string; uptime: number | null; perf?: number; affectedSubsystems?: string[]; affectedReasons?: Record<string, string> }

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

function uptimeColor(uptime: number | null): string {
  if (uptime === null) return 'text-zinc-500'
  if (uptime >= 100) return 'text-green-400'
  if (uptime >= 97) return 'text-amber-400'
  return 'text-red-400'
}

function barColor(day: DayUptime, light: boolean): string {
  if (day.uptime === null) return light ? 'bg-gray-200' : 'bg-zinc-700'
  // Red: real downtime
  if (day.uptime < 97) return 'bg-red-500'
  // Amber: some downtime OR poor performance while up
  if (day.uptime < 100 || (day.perf !== undefined && day.perf < 99)) return 'bg-amber-500'
  // Green: fully up and fully healthy
  return 'bg-green-500'
}

export default function UptimeBar({
  dailyUptime,
  light = false,
}: {
  dailyUptime: DayUptime[]
  light?: boolean
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<'left' | 'center' | 'right'>('center')
  const barRef = useRef<HTMLDivElement>(null)

  // Pad to 30 blocks if we have fewer days of data
  const days = 30
  const padded: DayUptime[] = []
  const startIndex = Math.max(0, days - dailyUptime.length)
  for (let i = 0; i < startIndex; i++) {
    padded.push({ date: '', uptime: null })
  }
  padded.push(...dailyUptime.slice(-days))

  const handleMouseEnter = (index: number, e: React.MouseEvent) => {
    setHovered(index)
    // Position tooltip based on where the block is in the bar
    if (barRef.current) {
      const barRect = barRef.current.getBoundingClientRect()
      const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const blockCenter = blockRect.left + blockRect.width / 2 - barRect.left
      const barWidth = barRect.width
      if (blockCenter < barWidth * 0.2) setTooltipPos('left')
      else if (blockCenter > barWidth * 0.8) setTooltipPos('right')
      else setTooltipPos('center')
    }
  }

  const day = hovered !== null ? padded[hovered] : null

  return (
    <div className="relative">
      <div ref={barRef} className="flex gap-[2px]">
        {padded.map((d, i) => (
          <div
            key={i}
            className={`h-6 flex-1 rounded-[2px] ${barColor(d, light)} transition-colors ${
              hovered === i ? 'ring-1 ring-white/40' : ''
            }`}
            onMouseEnter={(e) => handleMouseEnter(i, e)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </div>

      {day && hovered !== null && (
        <div
          className={`absolute z-20 mt-2 w-52 rounded-lg border px-3 py-2.5 shadow-xl pointer-events-none ${light ? 'border-gray-200 bg-white' : 'border-zinc-700 bg-zinc-800'} ${
            tooltipPos === 'left'
              ? 'left-0'
              : tooltipPos === 'right'
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2'
          }`}
        >
          <div className={`text-xs font-medium ${light ? 'text-gray-800' : 'text-zinc-200'}`}>
            {day.date ? formatDate(day.date) : 'No data'}
          </div>

          {day.date && day.uptime !== null && (
            <>
              <div className={`mt-1 text-sm font-semibold ${uptimeColor(day.uptime)}`}>
                {day.uptime.toFixed(1)}% uptime
              </div>
              {day.perf !== undefined && day.perf < 100 && (
                <div className={`text-xs ${day.perf >= 95 ? 'text-amber-400/80' : 'text-red-400/80'}`}>
                  {day.perf.toFixed(1)}% performance
                </div>
              )}
            </>
          )}

          {day.date && day.uptime === null && (
            <div className="mt-1 text-xs text-zinc-500">No check data</div>
          )}

          {day.affectedSubsystems && day.affectedSubsystems.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-t border-zinc-700/50 pt-1.5">
              {day.affectedSubsystems.map((name) => (
                <div key={name} className="flex items-center gap-1.5 text-xs">
                  <span className="h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-zinc-400">{name}</span>
                  {day.affectedReasons?.[name] && (
                    <span className="text-amber-400/70">— {day.affectedReasons[name].toLowerCase()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
