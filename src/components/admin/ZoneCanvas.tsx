'use client'

import { useRef, useState } from 'react'
import { pointInZone } from '../../lib/geo'
import type { Pt } from '../../lib/geo'
import type { AnswerZone } from '../../types'
import { Button } from '../ui'

type Tool = 'select' | 'ellipse' | 'polygon'

interface ZoneCanvasProps {
  zones: AnswerZone[]
  onChange: (zones: AnswerZone[]) => void
  image: string
  /** ابعاد طبیعی تصویر */
  width: number
  height: number
}

const MIN_SIZE = 8 // حداقل اندازهٔ بیضی (پیکسل طبیعی)

/**
 * ابزار تعیین ناحیهٔ پاسخ روی تصویر:
 *  - «بیضی»: کلیک و درگ → ناحیهٔ بیضی
 *  - «چندضلعی»: کلیک برای هر گوشه + دکمهٔ پایان
 *  - «انتخاب»: کلیک روی ناحیه برای انتخاب/حذف/چرخاندن
 */
export function ZoneCanvas({ zones, onChange, image, width, height }: ZoneCanvasProps) {
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<number | null>(null)

  // بیضی در حال رسم (پیکسل طبیعی)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  // چندضلعی در حال رسم
  const [polyPts, setPolyPts] = useState<Pt[]>([])
  const [cursor, setCursor] = useState<Pt | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const downPos = useRef<Pt | null>(null)

  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max)

  const toPx = (e: { clientX: number; clientY: number }): Pt | null => {
    const el = stageRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = toPx(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool === 'ellipse') {
      setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    } else if (tool === 'polygon') {
      setPolyPts((pts) => [...pts, { x: clamp(p.x, width), y: clamp(p.y, height) }])
    } else {
      downPos.current = p
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = toPx(e)
    if (!p) return
    setCursor({ x: clamp(p.x, width), y: clamp(p.y, height) })
    if (tool === 'ellipse' && drag) {
      setDrag({ ...drag, x1: clamp(p.x, width), y1: clamp(p.y, height) })
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = toPx(e)
    if (!p) return

    if (tool === 'ellipse' && drag) {
      const x1 = clamp(p.x, width)
      const y1 = clamp(p.y, height)
      const w = Math.abs(x1 - drag.x0)
      const h = Math.abs(y1 - drag.y0)
      setDrag(null)
      if (w >= MIN_SIZE && h >= MIN_SIZE) {
        const zone: AnswerZone = {
          kind: 'ellipse',
          cx: (Math.min(x1, drag.x0) + w / 2) / width,
          cy: (Math.min(y1, drag.y0) + h / 2) / height,
          rx: (w / 2) / width,
          ry: (h / 2) / height,
          // نخستین ناحیه به‌صورت پیش‌فرض پاسخِ درست است؛ بقیه گزینهٔ نادرست
          correct: zones.length === 0,
        }
        const next = [...zones, zone]
        onChange(next)
        setSelected(next.length - 1)
      }
      return
    }

    if (tool === 'select') {
      const start = downPos.current
      downPos.current = null
      const moved = start ? Math.hypot(p.x - start.x, p.y - start.y) : 999
      if (moved < 6) {
        const idx = zones.findIndex((z) => pointInZone(z, p.x, p.y, width, height))
        setSelected(idx >= 0 ? idx : null)
      }
    }
  }

  const finishPolygon = () => {
    if (polyPts.length < 3) return
    const zone: AnswerZone = {
      kind: 'polygon',
      points: polyPts.map((pt) => [clamp(pt.x, width) / width, clamp(pt.y, height) / height]),
      // نخستین ناحیه به‌صورت پیش‌فرض پاسخِ درست است؛ بقیه گزینهٔ نادرست
      correct: zones.length === 0,
    }
    const next = [...zones, zone]
    onChange(next)
    setSelected(next.length - 1)
    setPolyPts([])
  }

  const cancelPolygon = () => {
    setPolyPts([])
    setTool('select')
  }

  const removeZone = (index: number) => {
    const removed = zones[index]
    let next = zones.filter((_, i) => i !== index)
    // اگر پاسخِ درست حذف شد، نخستین ناحیهٔ باقی‌مانده را درست کن
    if (removed && removed.correct !== false && next.length > 0) {
      next = next.map((z, i) => (i === 0 ? { ...z, correct: true } : z)) as AnswerZone[]
    }
    onChange(next)
    setSelected(null)
  }

  const clearAll = () => {
    onChange([])
    setSelected(null)
  }

  /** علامت‌گذاری پاسخِ درست — می‌توان چند ناحیهٔ درست داشت (مثلاً عضلهٔ دوطرفه) */
  const toggleCorrect = (index: number) => {
    const zone = zones[index]
    if (!zone) return
    const nowCorrect = zone.correct !== false
    const next = zones.map((z, i) =>
      i === index ? { ...z, correct: !nowCorrect } : z,
    ) as AnswerZone[]
    // دست‌کم یک ناحیهٔ درست باید بماند
    if (next.every((z) => z.correct === false)) return
    onChange(next)
  }

  const setRotate = (index: number, rotate: number) => {
    const next = zones.map((z, i) => (i === index && z.kind === 'ellipse' ? { ...z, rotate } : z)) as AnswerZone[]
    onChange(next)
  }

  return (
    <div className="zone-editor">
      <div className="zone-editor__toolbar">
        <div className="zone-editor__tools" role="group" aria-label="ابزار رسم ناحیه">
          <button
            className={`tool-btn${tool === 'select' ? ' tool-btn--on' : ''}`}
            onClick={() => { setTool('select'); setPolyPts([]) }}
          >
            انتخاب
          </button>
          <button
            className={`tool-btn${tool === 'ellipse' ? ' tool-btn--on' : ''}`}
            onClick={() => { setTool('ellipse'); setPolyPts([]) }}
          >
            ○ بیضی
          </button>
          <button
            className={`tool-btn${tool === 'polygon' ? ' tool-btn--on' : ''}`}
            onClick={() => { setTool('polygon'); setPolyPts([]) }}
          >
            ⬠ چندضلعی
          </button>
        </div>

        <div className="zone-editor__tools">
          <Button variant="ghost" onClick={clearAll} disabled={zones.length === 0}>
            پاک‌کردن همه
          </Button>
          {tool === 'polygon' && polyPts.length >= 3 && (
            <Button onClick={finishPolygon}>پایان چندضلعی</Button>
          )}
          {tool === 'polygon' && polyPts.length > 0 && polyPts.length < 3 && (
            <Button variant="ghost" onClick={cancelPolygon}>
              انصراف رسم
            </Button>
          )}
        </div>
      </div>

      <p className="zone-editor__hint">
        {tool === 'ellipse' && 'روی تصویر کلیک کنید و بکشید تا یک بیضی دور جای پاسخ رسم شود.'}
        {tool === 'polygon' &&
          (polyPts.length === 0
            ? 'برای هر گوشهٔ ناحیه یک‌بار روی تصویر کلیک کنید؛ بعد دکمهٔ «پایان چندضلعی» را بزنید.'
            : `${polyPts.length} گوشه ثبت شد — گوشه‌های بعدی را اضافه یا «پایان» را بزنید.`)}
        {tool === 'select' && 'برای انتخاب/ویرایش روی ناحیه‌ها کلیک کنید؛ پاسخِ درست را از فهرست پایین مشخص کنید.'}
      </p>

      <div
        ref={stageRef}
        className="zone-canvas"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img src={image} alt="تصویر سؤال برای تعیین ناحیه" draggable={false} />
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="zone-canvas__overlay"
          aria-hidden="true"
        >
          {zones.map((zone, i) => (
            <ZoneShape
              key={i}
              zone={zone}
              width={width}
              height={height}
              selected={i === selected}
            />
          ))}

          {tool === 'ellipse' && drag && (
            <ellipse
              className="zone-draft"
              cx={(drag.x0 + drag.x1) / 2}
              cy={(drag.y0 + drag.y1) / 2}
              rx={Math.abs(drag.x1 - drag.x0) / 2}
              ry={Math.abs(drag.y1 - drag.y0) / 2}
            />
          )}

          {tool === 'polygon' &&
            polyPts.map((pt, i) => (
              <g key={i}>
                <circle className="zone-draft__dot" cx={pt.x} cy={pt.y} r={5} />
                {i > 0 && (
                  <line
                    className="zone-draft"
                    x1={polyPts[i - 1].x}
                    y1={polyPts[i - 1].y}
                    x2={pt.x}
                    y2={pt.y}
                  />
                )}
              </g>
            ))}
          {tool === 'polygon' && polyPts.length > 0 && cursor && (
            <line
              className="zone-draft zone-draft--ghost"
              x1={polyPts[polyPts.length - 1].x}
              y1={polyPts[polyPts.length - 1].y}
              x2={cursor.x}
              y2={cursor.y}
            />
          )}
        </svg>
      </div>

      <p className="zone-list-note">
        هر ناحیه یک «گزینهٔ پاسخ» است. می‌توانید چند ناحیه را <b>پاسخ درست</b> علامت بزنید (مثلاً
        عضلهٔ دوطرفهٔ چپ و راست)؛ در بازی باید <b>همهٔ</b> ناحیه‌های درست کلیک شوند تا پاسخ درست
        باشد. کلیک روی ناحیه‌های دیگر نادرست است و کلیک خارج از همهٔ گزینه‌ها تلاش مصرف نمی‌کند.
      </p>

      <div className="zone-list">
        {zones.length === 0 && <p className="admin-empty">هنوز ناحیه‌ای رسم نشده است.</p>}
        {zones.map((z, i) => (
          <div
            key={i}
            className={`zone-item${i === selected ? ' zone-item--on' : ''}`}
            onClick={() => setSelected(i)}
          >
            <span className="zone-item__num">{i + 1}</span>
            <span className="zone-item__kind">{z.kind === 'ellipse' ? 'بیضی' : 'چندضلعی'}</span>

            <button
              type="button"
              className={`zone-item__correct${z.correct !== false ? ' zone-item__correct--on' : ''}`}
              aria-pressed={z.correct !== false}
              title="نشانه‌گذاری پاسخِ درست — چند ناحیه می‌تواند درست باشد"
              onClick={(e) => {
                e.stopPropagation()
                toggleCorrect(i)
              }}
            >
              <span className="zone-item__radio" aria-hidden="true" />
              پاسخ درست
            </button>

            {z.kind === 'ellipse' && i === selected && (
              <label className="zone-item__rotate">
                چرخش (°)
                <input
                  type="number"
                  step={5}
                  value={z.rotate ?? 0}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRotate(i, Number(e.target.value) || 0)}
                />
              </label>
            )}

            {z.kind === 'ellipse' && i === selected && (
              <span className="zone-item__pos">
                مرکز {Math.round(z.cx * 100)}٪ ، {Math.round(z.cy * 100)}٪
              </span>
            )}
            {z.kind === 'polygon' && (
              <span className="zone-item__pos">{z.points.length} گوشه</span>
            )}

            <button
              className="btn-link btn-link--danger zone-item__del"
              onClick={(e) => {
                e.stopPropagation()
                removeZone(i)
              }}
            >
              حذف
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ZoneShape({
  zone,
  width,
  height,
  selected,
}: {
  zone: AnswerZone
  width: number
  height: number
  selected: boolean
}) {
  const cls = `zone-shape${zone.correct !== false ? ' zone-shape--correct' : ''}${selected ? ' zone-shape--selected' : ''}`
  if (zone.kind === 'ellipse') {
    return (
      <ellipse
        className={cls}
        cx={zone.cx * width}
        cy={zone.cy * height}
        rx={zone.rx * width}
        ry={zone.ry * height}
        transform={zone.rotate ? `rotate(${zone.rotate} ${zone.cx * width} ${zone.cy * height})` : undefined}
      />
    )
  }
  return (
    <polygon
      className={cls}
      points={zone.points.map(([x, y]) => `${x * width},${y * height}`).join(' ')}
    />
  )
}
