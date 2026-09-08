import type { AnswerZone, EllipseZone, PolygonZone } from '../types'

export interface Pt {
  x: number
  y: number
}

const deg2rad = (d: number): number => (d * Math.PI) / 180

/** تبدیل ناحیهٔ نرمال به پیکسل واقعی تصویر (w×h) */
export function zoneToPx(zone: AnswerZone, w: number, h: number): AnswerZone {
  if (zone.kind === 'ellipse') {
    const z: EllipseZone = {
      kind: 'ellipse',
      cx: zone.cx * w,
      cy: zone.cy * h,
      rx: zone.rx * w,
      ry: zone.ry * h,
    }
    if (zone.rotate) z.rotate = zone.rotate
    return z
  }
  return {
    kind: 'polygon',
    points: zone.points.map(([x, y]) => [x * w, y * h]),
  }
}

/** آیا نقطه (در پیکسل طبیعی تصویر) داخل ناحیه است؟ */
export function pointInZone(zone: AnswerZone, px: number, py: number, w: number, h: number): boolean {
  const z = zoneToPx(zone, w, h)
  if (z.kind === 'ellipse') return pointInEllipse(z, px, py)
  return pointInPolygon(z, px, py)
}

function pointInEllipse(z: EllipseZone, px: number, py: number): boolean {
  let dx = px - z.cx
  let dy = py - z.cy
  if (z.rotate) {
    const a = deg2rad(z.rotate)
    // چرخش معکوس نقطه به دستگاه مختصات بیضی (بدون چرخش)
    const cos = Math.cos(-a)
    const sin = Math.sin(-a)
    const rx = dx * cos - dy * sin
    const ry = dx * sin + dy * cos
    dx = rx
    dy = ry
  }
  const nx = dx / z.rx
  const ny = dy / z.ry
  return nx * nx + ny * ny <= 1
}

/** آزمون نقطه درون چندضلعی (ray casting) */
function pointInPolygon(z: PolygonZone, px: number, py: number): boolean {
  const pts = z.points
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0]
    const yi = pts[i][1]
    const xj = pts[j][0]
    const yj = pts[j][1]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** آیا نقطه داخل دستِ‌کم یکی از ناحیه‌هاست؟ */
export function pointInAnyZone(zones: AnswerZone[], px: number, py: number, w: number, h: number): boolean {
  return pointInZoneAt(zones, px, py, w, h) !== null
}

/** نخستین ناحیه‌ای که نقطه داخل آن است (یا null) — پیکسل طبیعی تصویر */
export function pointInZoneAt(
  zones: AnswerZone[],
  px: number,
  py: number,
  w: number,
  h: number,
): AnswerZone | null {
  for (const zone of zones) {
    if (pointInZone(zone, px, py, w, h)) return zone
  }
  return null
}
