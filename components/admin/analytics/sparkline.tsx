/**
 * The shape behind a headline figure.
 *
 * Deliberately plain SVG rather than a charting library: it carries no axes,
 * no ticks, no tooltip and no legend, so everything Recharts would bring is
 * weight the tile does not use — and as plain markup it renders on the server
 * with no client JavaScript at all.
 *
 * It inherits `currentColor` for both stroke and fill, so the tile sets the
 * colour once (green rising, red falling, grey when there is nothing to say)
 * and the line, the wash and the delta beside it agree without a second
 * source of truth.
 *
 * It is a shape, not a scale. There is no baseline at zero and no labelled
 * value, because at 44px tall a value axis would be unreadable; what the line
 * is for is "steady, climbing, or spiky", and the exact numbers live in the
 * chart and the table below it.
 */

/** Wide viewBox, stretched to the tile. Stroke width is held by vector-effect. */
const VIEW_WIDTH = 240
const VIEW_HEIGHT = 48
/** Keeps the peak and the trough off the very edge of the box. */
const PADDING = 3

/**
 * Most points worth drawing across a tile.
 *
 * Ninety daily values in a 240-unit box is roughly one point every two and a
 * half units, which at this height renders as a band of noise — the weekend
 * sawtooth swamps the trend the tile is there to show. Averaging adjacent days
 * down to this many points keeps the trend and drops the interference, and
 * matches the cadence of the chart below, which regroups to weeks over the
 * same range. The exact daily values live in that chart's table.
 */
const MAX_POINTS = 22

function condense(values: number[]): number[] {
  if (values.length <= MAX_POINTS) return values

  const size = values.length / MAX_POINTS

  return Array.from({ length: MAX_POINTS }, (_, index) => {
    const slice = values.slice(Math.floor(index * size), Math.floor((index + 1) * size))
    if (slice.length === 0) return 0
    return slice.reduce((total, value) => total + value, 0) / slice.length
  })
}

export function Sparkline({
  values,
  id,
  className = '',
  label,
}: {
  values: number[]
  /** Unique per tile — SVG gradient ids are global to the document. */
  id: string
  className?: string
  /** Accessible description. Omitted labels make the graphic decorative. */
  label?: string
}) {
  if (values.length < 2) return null

  const sampled = condense(values)
  const max = Math.max(...sampled)
  const min = Math.min(...sampled)
  const span = max - min || 1

  const points = sampled.map((value, index) => ({
    x: (index / (sampled.length - 1)) * VIEW_WIDTH,
    y: VIEW_HEIGHT - PADDING - ((value - min) / span) * (VIEW_HEIGHT - PADDING * 2),
  }))

  const line = smoothPath(points)
  const gradientId = `spark-${id}`

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      // The line is a shape, so letting it stretch to the tile width is
      // correct; the stroke is what must not stretch with it.
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* The wash is the same curve, closed down to the baseline, so the fill
          follows the line exactly rather than cutting the corners under it. */}
      <path
        d={`${line} L ${VIEW_WIDTH} ${VIEW_HEIGHT} L 0 ${VIEW_HEIGHT} Z`}
        fill={`url(#${gradientId})`}
      />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

interface Point {
  x: number
  y: number
}

/**
 * How far a control point reaches toward its neighbour, as a share of the gap.
 *
 * A sixth is the value that makes a Catmull-Rom spline pass through its points
 * with a continuous tangent. Easing it back slightly keeps the curve from
 * bulging past a peak on spiky data — a sparkline that overshoots its own
 * maximum is drawing a number the day never reached.
 */
const SMOOTHING = 0.16

/**
 * A curve through every point, rather than a run of straight segments.
 *
 * The line used to be a `<polyline>`, which is honest but reads as a row of
 * hard corners at this size — the shape looked jagged even when the underlying
 * trend was gentle. This is a Catmull-Rom spline written out as cubic Béziers:
 * each segment's control points are set from the slope between the segment's
 * neighbours, so the curve still passes exactly through every value and only
 * the path *between* two values is rounded.
 */
function smoothPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let d = `M ${round(points[0].x)} ${round(points[0].y)}`

  for (let i = 0; i < points.length - 1; i++) {
    // The ends have no outer neighbour, so they borrow themselves: the curve
    // leaves the first point and arrives at the last one straight.
    const previous = points[i - 1] ?? points[i]
    const current = points[i]
    const next = points[i + 1]
    const after = points[i + 2] ?? next

    const control1 = {
      x: current.x + (next.x - previous.x) * SMOOTHING,
      y: current.y + (next.y - previous.y) * SMOOTHING,
    }
    const control2 = {
      x: next.x - (after.x - current.x) * SMOOTHING,
      y: next.y - (after.y - current.y) * SMOOTHING,
    }

    d += ` C ${round(control1.x)} ${round(control1.y)}, ${round(control2.x)} ${round(
      control2.y
    )}, ${round(next.x)} ${round(next.y)}`
  }

  return d
}

function round(value: number): string {
  return value.toFixed(1)
}
