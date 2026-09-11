'use client'

import { useRef } from 'react'
import { zoneToPx } from '../lib/geo'
import type { Pt } from '../lib/geo'
import type { AnswerZone } from '../types'

interface AnatomyImageProps {
  image: string
  imageWidth: number
  imageHeight: number
  /** ناحیه‌های پاسخ درست (در حالت عادی نامرئی‌اند) */
  zones: AnswerZone[]
  /** بعد از پایان پاسخ، ناحیه‌های درست سبز می‌شوند */
  reveal: boolean
  /** نقطه‌های کلیکِ اشتباه (پیکسل طبیعی تصویر) برای نمایش ✕ */
  wrongMarkers: Pt[]
  /** نقطه‌های کلیکِ درستِ یافته‌شده (سؤال‌های چندپاسخه) برای نمایش ✓ */
  correctMarkers?: Pt[]
  /** کلیک کاربر روی تصویر — نقطه با پیکسلِ طبیعیِ تصویر */
  onAttempt: (point: Pt) => void
  locked?: boolean
  alt?: string
}

/**
 * تصویر سؤال + لایهٔ ناحیه‌های پاسخ.
 * مختصات ناحیه‌ها نرمال (۰..۱) است و نسبت به اندازهٔ طبیعی تصویر پیکسل می‌شود؛
 * روی هر اندازهٔ صفحه دقیقاً روی همان نقطهٔ تصویر می‌افتد.
 */
export function AnatomyImage({
  image,
  imageWidth,
  imageHeight,
  zones,
  reveal,
  wrongMarkers,
  correctMarkers = [],
  onAttempt,
  locked = false,
  alt = 'تصویر سؤال — روی جای پاسخ کلیک کن',
}: AnatomyImageProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const sized = imageWidth > 0 && imageHeight > 0

  // جعبه هم‌نسبت تصویر و محدود به ارتفاع صفحه؛ پس تصویر روی موبایل کامل جا می‌شود
  // و نگاشت مختصات (نسبت به قاب جعبه) دقیق می‌ماند.
  const boxStyle = sized
    ? {
        aspectRatio: `${imageWidth} / ${imageHeight}`,
        maxWidth: `calc(var(--image-max-h) * ${imageWidth} / ${imageHeight})`,
      }
    : undefined

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (locked) return
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = ((e.clientX - rect.left) / rect.width) * imageWidth
    const y = ((e.clientY - rect.top) / rect.height) * imageHeight
    onAttempt({ x, y })
  }

  return (
    <div
      ref={boxRef}
      className={`anatomy${locked ? ' anatomy--locked' : ''}${sized ? '' : ' anatomy--auto'}`}
      style={boxStyle}
      onClick={handleClick}
    >
      <img src={image} alt={alt} draggable={false} />

      {(reveal || wrongMarkers.length > 0 || correctMarkers.length > 0) && (
        <svg
          viewBox={`0 0 ${imageWidth} ${imageHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="anatomy__overlay"
          aria-hidden="true"
        >
          {reveal &&
            zones
              .filter((z) => z.correct !== false) // فقط ناحیهٔ پاسخِ درست سبز می‌شود
              .map((zone, i) => {
              const z = zoneToPx(zone, imageWidth, imageHeight)
              if (z.kind === 'ellipse') {
                return (
                  <ellipse
                    key={i}
                    className="zone zone--reveal"
                    cx={z.cx}
                    cy={z.cy}
                    rx={z.rx}
                    ry={z.ry}
                    transform={z.rotate ? `rotate(${z.rotate} ${z.cx} ${z.cy})` : undefined}
                  />
                )
              }
              return (
                <polygon
                  key={i}
                  className="zone zone--reveal"
                  points={z.points.map(([x, y]) => `${x},${y}`).join(' ')}
                />
              )
            })}

          {correctMarkers.map((m, i) => (
            <g key={`ok${i}`} transform={`translate(${m.x} ${m.y})`} className="correct-marker">
              <circle r={13} />
              <path d="M -6 -1 L -1 4 L 7 -5" />
            </g>
          ))}

          {wrongMarkers.map((m, i) => (
            <g key={i} transform={`translate(${m.x} ${m.y})`} className="wrong-marker">
              <circle r={13} />
              <path d="M -8 -8 L 8 8 M 8 -8 L -8 8" />
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}
