import type { CheckResult } from '../types'

/**
 * Simple SVG line chart for response times.
 * No dependencies — pure SVG rendering.
 */
export default function ResponseChart({
  checks,
  height = 200,
}: {
  checks: CheckResult[]
  height?: number
}) {
  if (checks.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 text-sm text-zinc-500"
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  const sorted = [...checks].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  const times = sorted.map((c) => c.responseTime)
  const maxTime = Math.max(...times, 1)
  const minTime = Math.min(...times)

  const padding = { top: 20, right: 16, bottom: 32, left: 50 }
  const width = 800
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  // Scale the range a bit so the line isn't pressed against the top
  const yMax = maxTime * 1.15
  const yMin = Math.max(0, minTime * 0.85)

  const points = sorted.map((c, i) => ({
    x: padding.left + (i / Math.max(sorted.length - 1, 1)) * innerW,
    y:
      padding.top +
      innerH -
      ((c.responseTime - yMin) / (yMax - yMin || 1)) * innerH,
    check: c,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  // Area fill under the line
  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + innerH} L${points[0].x},${padding.top + innerH} Z`

  // Y-axis labels
  const yTicks = 4
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = yMin + ((yMax - yMin) / yTicks) * i
    return {
      label: `${Math.round(val)}ms`,
      y: padding.top + innerH - (i / yTicks) * innerH,
    }
  })

  // X-axis labels (show a few timestamps)
  const xLabelCount = Math.min(6, sorted.length)
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const idx = xLabelCount <= 1
      ? 0
      : Math.round((i / (xLabelCount - 1)) * (sorted.length - 1))
    const d = new Date(sorted[idx].timestamp)
    return {
      label: d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      x: points[idx].x,
    }
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* grid lines */}
      {yLabels.map((yl, i) => (
        <line
          key={i}
          x1={padding.left}
          x2={width - padding.right}
          y1={yl.y}
          y2={yl.y}
          stroke="rgb(63 63 70 / 0.5)"
          strokeDasharray="4 4"
        />
      ))}

      {/* area fill */}
      <path d={areaPath} fill="url(#tealGrad)" opacity="0.15" />

      {/* line */}
      <path d={linePath} fill="none" stroke="#2dd4bf" strokeWidth="2" />

      {/* dots for down checks */}
      {points
        .filter((p) => !p.check.isUp)
        .map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#ef4444" />
        ))}

      {/* Y labels */}
      {yLabels.map((yl, i) => (
        <text
          key={i}
          x={padding.left - 6}
          y={yl.y + 4}
          textAnchor="end"
          className="fill-zinc-500"
          fontSize="11"
        >
          {yl.label}
        </text>
      ))}

      {/* X labels */}
      {xLabels.map((xl, i) => (
        <text
          key={i}
          x={xl.x}
          y={height - 6}
          textAnchor="middle"
          className="fill-zinc-500"
          fontSize="10"
        >
          {xl.label}
        </text>
      ))}

      {/* Gradient definition */}
      <defs>
        <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
