'use client'

import type { ImageLabel } from '../types'

interface ImageLabelsProps {
  labels: ImageLabel[]
  /** برچسب انتخاب‌شده در پنل مدیریت (برای برجسته‌سازی) */
  selected?: number | null
  /** در پنل مدیریت برچسب‌های بی‌متن جای‌نگهدار نشان می‌دهند */
  editing?: boolean
  placeholder?: string
}

/**
 * برچسب‌های متنی روی تصویر (مثل «عضلهٔ ماسِتر») — نقطهٔ برچسب دقیقاً روی
 * همان جای تصویر می‌نشیند (مختصات نرمال) و متن در گَرد آن قرار می‌گیرد.
 * در بازی فقط بعد از پاسخ‌دادن نمایش داده می‌شود؛ در پنل مدیریت همیشه.
 */
export function ImageLabels({
  labels,
  selected = null,
  editing = false,
  placeholder = 'متن برچسب…',
}: ImageLabelsProps) {
  if (labels.length === 0) return null

  return (
    <div className={`imglabels${editing ? ' imglabels--editing' : ''}`} aria-hidden="true">
      {labels.map((label, i) => {
        const below = label.y < 0.16 // نزدیک لبهٔ بالا → متن زیر نقطه
        // نزدیک لبه‌های چپ/راست → متن به داخل تصویر می‌چرخد تا بریده نشود
        const edge = label.x < 0.18 ? 'left' : label.x > 0.82 ? 'right' : ''
        const text = label.text || (editing ? placeholder : '')
        if (!text) return null
        return (
          <span
            key={i}
            className={[
              'imglabel',
              below ? 'imglabel--below' : '',
              edge ? `imglabel--${edge}` : '',
              editing && selected === i ? 'imglabel--on' : '',
              editing && !label.text ? 'imglabel--empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${label.x * 100}%`, top: `${label.y * 100}%` }}
          >
            <span className="imglabel__dot" />
            <span className="imglabel__text">{text}</span>
          </span>
        )
      })}
    </div>
  )
}
