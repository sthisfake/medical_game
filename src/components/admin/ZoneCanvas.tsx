'use client'

import { useRef, useState } from 'react'
import { pointInZone } from '../../lib/geo'
import type { Pt } from '../../lib/geo'
import type { AnswerZone, ImageLabel, ImageText, ImageTextColor } from '../../types'
import { MAX_IMAGE_TEXTS, MAX_IMAGE_TEXT_LENGTH } from '../../lib/image-texts'
import { MAX_LABELS, MAX_LABEL_LENGTH } from '../../lib/labels'
import { ImageLabels } from '../ImageLabels'
import { ImageTexts } from '../ImageTexts'
import { Button } from '../ui'

type Tool = 'select' | 'ellipse' | 'polygon' | 'label' | 'imageText'

interface ZoneCanvasProps {
  zones: AnswerZone[]
  onChange: (zones: AnswerZone[]) => void
  image: string
  /** ابعاد طبیعی تصویر */
  width: number
  height: number
  /** برچسب‌های روی تصویر (اختیاری) — پس از پاسخ‌دادن در بازی ظاهر می‌شوند */
  labels?: ImageLabel[]
  onLabelsChange?: (labels: ImageLabel[]) => void
  /** متن‌های ثابت که از ابتدای سؤال روی تصویر باقی می‌مانند */
  imageTexts?: ImageText[]
  onImageTextsChange?: (texts: ImageText[]) => void
  /** اگر سؤال ناحیهٔ پاسخ ندارد (چهارگزینه‌ای) فقط برچسب‌ها ویرایش می‌شوند */
  zonesEnabled?: boolean
}

const MIN_SIZE = 8 // حداقل اندازهٔ بیضی (پیکسل طبیعی)

/**
 * ابزار تعیین ناحیهٔ پاسخ و برچسب روی تصویر:
 *  - «بیضی»: کلیک و درگ → ناحیهٔ بیضی
 *  - «چندضلعی»: کلیک برای هر گوشه + دکمهٔ پایان
 *  - «برچسب»: کلیک روی تصویر → برچسب متنی در آن نقطه (در بازی بعد از پاسخ ظاهر می‌شود)
 *  - «متن ثابت»: کلیک روی تصویر → متن سیاه/سفید که همیشه دیده می‌شود
 *  - «انتخاب»: کلیک روی ناحیه/برچسب برای انتخاب، ویرایش متن، جابه‌جایی و حذف
 */
export function ZoneCanvas({
  zones,
  onChange,
  image,
  width,
  height,
  labels = [],
  onLabelsChange,
  imageTexts = [],
  onImageTextsChange,
  zonesEnabled = true,
}: ZoneCanvasProps) {
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<number | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<number | null>(null)
  const [selectedImageText, setSelectedImageText] = useState<number | null>(null)
  // جابه‌جایی برچسب یا متن ثابت با درگ
  const annotationDrag = useRef<{
    kind: 'label' | 'imageText'
    index: number
    moved: boolean
  } | null>(null)

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

  const setLabels = (next: ImageLabel[]) => {
    if (next.length > MAX_LABELS) return
    onLabelsChange?.(next)
  }

  const setImageTexts = (next: ImageText[]) => {
    if (next.length > MAX_IMAGE_TEXTS) return
    onImageTextsChange?.(next)
  }

  /** نزدیک‌ترین نوشته به نقطه (پیکسل طبیعی) — برای درگ و انتخاب */
  const annotationAt = (items: Array<{ x: number; y: number }>, p: Pt): number => {
    const reach = Math.max(width, height) * 0.045
    let best = -1
    let bestDist = reach
    items.forEach((item, i) => {
      const d = Math.hypot(item.x * width - p.x, item.y * height - p.y)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    return best
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = toPx(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)

    if (tool === 'label') {
      // اگر روی برچسب موجود کلیک شد، آن را جابه‌جا کن؛ وگرنه برچسب تازه بساز
      const near = annotationAt(labels, p)
      if (near >= 0) {
        annotationDrag.current = { kind: 'label', index: near, moved: false }
        setSelectedLabel(near)
        setSelectedImageText(null)
        setSelected(null)
        return
      }
      if (labels.length >= MAX_LABELS) return
      const next = [...labels, { text: '', x: clamp(p.x, width) / width, y: clamp(p.y, height) / height }]
      setLabels(next)
      setSelectedLabel(next.length - 1)
      setSelectedImageText(null)
      setSelected(null)
      return
    }

    if (tool === 'imageText') {
      const near = annotationAt(imageTexts, p)
      if (near >= 0) {
        annotationDrag.current = { kind: 'imageText', index: near, moved: false }
        setSelectedImageText(near)
        setSelectedLabel(null)
        setSelected(null)
        return
      }
      if (imageTexts.length >= MAX_IMAGE_TEXTS) return
      const next: ImageText[] = [
        ...imageTexts,
        {
          text: '',
          x: clamp(p.x, width) / width,
          y: clamp(p.y, height) / height,
          color: 'black',
        },
      ]
      setImageTexts(next)
      setSelectedImageText(next.length - 1)
      setSelectedLabel(null)
      setSelected(null)
      return
    }

    if (tool === 'ellipse') {
      setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    } else if (tool === 'polygon') {
      setPolyPts((pts) => [...pts, { x: clamp(p.x, width), y: clamp(p.y, height) }])
    } else {
      // ابزار انتخاب: متن ثابت روی برچسب قرار می‌گیرد، چون لایهٔ نمایشش بالاتر است
      const imageTextIndex = annotationAt(imageTexts, p)
      if (imageTextIndex >= 0) {
        annotationDrag.current = { kind: 'imageText', index: imageTextIndex, moved: false }
        setSelectedImageText(imageTextIndex)
        setSelectedLabel(null)
        setSelected(null)
        return
      }
      const labelIndex = annotationAt(labels, p)
      if (labelIndex >= 0) {
        annotationDrag.current = { kind: 'label', index: labelIndex, moved: false }
        setSelectedLabel(labelIndex)
        setSelectedImageText(null)
        setSelected(null)
        return
      }
      downPos.current = p
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = toPx(e)
    if (!p) return
    setCursor({ x: clamp(p.x, width), y: clamp(p.y, height) })

    // درگِ برچسب/متن ثابت در ابزار خودش یا «انتخاب»
    const active = annotationDrag.current
    if (active) {
      const position = { x: clamp(p.x, width) / width, y: clamp(p.y, height) / height }
      if (active.kind === 'label') {
        setLabels(labels.map((item, i) => (i === active.index ? { ...item, ...position } : item)))
      } else {
        setImageTexts(
          imageTexts.map((item, i) => (i === active.index ? { ...item, ...position } : item)),
        )
      }
      active.moved = true
      return
    }

    if (tool === 'ellipse' && drag) {
      setDrag({ ...drag, x1: clamp(p.x, width), y1: clamp(p.y, height) })
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = toPx(e)
    if (!p) return
    if (annotationDrag.current) {
      annotationDrag.current = null
      return
    }

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
        // اول متن ثابت، بعد برچسب (چون روی تصویر شناورند)، سپس ناحیه‌ها
        const ti = annotationAt(imageTexts, p)
        if (ti >= 0) {
          setSelectedImageText(ti)
          setSelectedLabel(null)
          setSelected(null)
          return
        }
        const li = annotationAt(labels, p)
        if (li >= 0) {
          setSelectedLabel(li)
          setSelectedImageText(null)
          setSelected(null)
          return
        }
        setSelectedLabel(null)
        setSelectedImageText(null)
        if (zonesEnabled) {
          const idx = zones.findIndex((z) => pointInZone(z, p.x, p.y, width, height))
          setSelected(idx >= 0 ? idx : null)
        } else {
          setSelected(null)
        }
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

  const updateLabel = (index: number, text: string) => {
    setLabels(labels.map((l, i) => (i === index ? { ...l, text } : l)))
  }

  const removeLabel = (index: number) => {
    setLabels(labels.filter((_, i) => i !== index))
    setSelectedLabel(null)
  }

  const updateImageText = (index: number, patch: Partial<Pick<ImageText, 'text' | 'color'>>) => {
    setImageTexts(imageTexts.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const removeImageText = (index: number) => {
    setImageTexts(imageTexts.filter((_, i) => i !== index))
    setSelectedImageText(null)
  }

  const setImageTextColor = (index: number, color: ImageTextColor) => {
    updateImageText(index, { color })
  }

  /**
   * نشانهٔ «پاسخ درست» روی برچسب (در بازی سبز می‌شود).
   * هنگام خاموش‌کردن، کلید کامل حذف می‌شود تا شکلِ داده مثل قبل بماند.
   */
  const toggleLabelCorrect = (index: number) => {
    setLabels(
      labels.map((l, i) => {
        if (i !== index) return l
        if (l.correct) return { text: l.text, x: l.x, y: l.y }
        return { ...l, correct: true }
      }),
    )
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
          {zonesEnabled && (
            <button
              className={`tool-btn${tool === 'ellipse' ? ' tool-btn--on' : ''}`}
              onClick={() => { setTool('ellipse'); setPolyPts([]) }}
            >
              ○ بیضی
            </button>
          )}
          {zonesEnabled && (
            <button
              className={`tool-btn${tool === 'polygon' ? ' tool-btn--on' : ''}`}
              onClick={() => { setTool('polygon'); setPolyPts([]) }}
            >
              ⬠ چندضلعی
            </button>
          )}
          {onLabelsChange && (
            <button
              className={`tool-btn${tool === 'label' ? ' tool-btn--on' : ''}`}
              onClick={() => { setTool('label'); setPolyPts([]) }}
            >
              🏷 برچسب
            </button>
          )}
          {onImageTextsChange && (
            <button
              className={`tool-btn${tool === 'imageText' ? ' tool-btn--on' : ''}`}
              onClick={() => { setTool('imageText'); setPolyPts([]) }}
            >
              T متن ثابت
            </button>
          )}
        </div>

        <div className="zone-editor__tools">
          {zonesEnabled && (
            <Button variant="ghost" onClick={clearAll} disabled={zones.length === 0}>
              پاک‌کردن همه
            </Button>
          )}
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
        {tool === 'label' &&
          'روی همان جای آناتومی کلیک کنید تا برچسب آنجا بنشیند؛ متنش را پایین بنویسید. این برچسب‌ها در بازی فقط بعد از پاسخ‌دادن روی تصویر ظاهر می‌شوند.'}
        {tool === 'imageText' &&
          'روی تصویر کلیک کنید تا متن ثابت آنجا قرار بگیرد؛ سپس متن و رنگ سیاه یا سفید را پایین انتخاب کنید. این متن پیش و پس از پاسخ همیشه دیده می‌شود.'}
        {tool === 'select' &&
          (zonesEnabled
            ? 'برای انتخاب/ویرایش روی ناحیه‌ها، برچسب‌ها یا متن‌های ثابت کلیک کنید؛ پاسخِ درست را از فهرست پایین مشخص کنید.'
            : 'برای جابه‌جایی برچسب یا متن ثابت، آن را بکشید؛ برای ویرایش متن، از فهرست پایین استفاده کنید.')}
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

        {/* هر دو نوع نوشته در پنل همیشه دیده می‌شوند تا جایشان تنظیم شود */}
        <ImageTexts texts={imageTexts} selected={selectedImageText} editing />
        <ImageLabels labels={labels} selected={selectedLabel} editing />
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
            onClick={() => {
              setSelected(i)
              setSelectedLabel(null)
              setSelectedImageText(null)
            }}
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

      {/* ---------- متن‌های ثابت روی تصویر ---------- */}
      {onImageTextsChange && (
        <>
          <p className="zone-list-note">
            <b>متن ثابت روی تصویر</b> — اختیاری و جدا از برچسب‌ها. این متن از <b>ابتدای سؤال</b>{' '}
            دیده می‌شود، بعد از نمایش پاسخ هم می‌ماند و با تغییر اندازهٔ تصویر در همان جای نسبی قرار
            می‌گیرد. با ابزار «T متن ثابت» محل را انتخاب و رنگ سیاه یا سفید را تعیین کنید.
          </p>

          <div className="label-list image-text-list">
            {imageTexts.length === 0 && <p className="admin-empty">هنوز متن ثابتی اضافه نشده است.</p>}
            {imageTexts.map((item, i) => (
              <div
                key={i}
                className={`label-item image-text-item${
                  i === selectedImageText ? ' image-text-item--on' : ''
                }`}
                onClick={() => {
                  setSelectedImageText(i)
                  setSelectedLabel(null)
                  setSelected(null)
                }}
              >
                <span className="label-item__num image-text-item__num">{i + 1}</span>
                <input
                  type="text"
                  className="label-item__text"
                  value={item.text}
                  maxLength={MAX_IMAGE_TEXT_LENGTH}
                  placeholder="مثلاً: سمت چپ"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateImageText(i, { text: e.target.value })}
                />
                <span className="label-item__pos">
                  {Math.round(item.x * 100)}٪ ، {Math.round(item.y * 100)}٪
                </span>
                <div className="image-text-colors" role="radiogroup" aria-label="رنگ متن ثابت">
                  {(['black', 'white'] as const).map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={item.color === color}
                      className={`image-text-color${
                        item.color === color ? ' image-text-color--on' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setImageTextColor(i, color)
                      }}
                    >
                      <span className={`image-text-color__swatch image-text-color__swatch--${color}`} />
                      {color === 'black' ? 'سیاه' : 'سفید'}
                    </button>
                  ))}
                </div>
                <button
                  className="btn-link btn-link--danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeImageText(i)
                  }}
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------- برچسب‌های روی تصویر ---------- */}
      {onLabelsChange && (
        <>
          <p className="zone-list-note">
            <b>برچسب‌های روی تصویر</b> — اختیاری. این متن‌ها در بازی <b>فقط بعد از پاسخ‌دادن</b> به
            سؤال (درست یا نادرست) روی تصویر ظاهر می‌شوند و جای آناتومی را نشان می‌دهند. با ابزار
            «🏷 برچسب» روی تصویر کلیک کنید و متنش را اینجا بنویسید. برچسبی که{' '}
            <b>«پاسخ درست»</b> علامت بخورد در بازی <b>سبز</b> نشان داده می‌شود؛ می‌توانید یکی یا
            چند برچسب را علامت بزنید.
          </p>

          <div className="label-list">
            {labels.length === 0 && <p className="admin-empty">هنوز برچسبی اضافه نشده است.</p>}
            {labels.map((label, i) => (
              <div
                key={i}
                className={`label-item${i === selectedLabel ? ' label-item--on' : ''}`}
                onClick={() => {
                  setSelectedLabel(i)
                  setSelectedImageText(null)
                  setSelected(null)
                }}
              >
                <span className="label-item__num">{i + 1}</span>
                <input
                  type="text"
                  className="label-item__text"
                  value={label.text}
                  maxLength={MAX_LABEL_LENGTH}
                  placeholder="مثلاً: عضلهٔ ماسِتر"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateLabel(i, e.target.value)}
                />
                <span className="label-item__pos">
                  {Math.round(label.x * 100)}٪ ، {Math.round(label.y * 100)}٪
                </span>
                <button
                  type="button"
                  className={`label-item__correct${label.correct ? ' label-item__correct--on' : ''}`}
                  aria-pressed={!!label.correct}
                  title="این برچسب متنِ پاسخ درست است و در بازی سبز نشان داده می‌شود"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleLabelCorrect(i)
                  }}
                >
                  ✓ پاسخ درست
                </button>
                <button
                  className="btn-link btn-link--danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeLabel(i)
                  }}
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        </>
      )}
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
