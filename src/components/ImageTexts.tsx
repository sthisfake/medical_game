'use client'

import { useEffect, useRef } from 'react'
import type { ImageText } from '../types'

interface ImageTextsProps {
  texts: ImageText[]
  selected?: number | null
  editing?: boolean
  placeholder?: string
}

/** متن‌های ساده‌ای که از ابتدا تا انتهای سؤال روی تصویر باقی می‌مانند. */
export function ImageTexts({
  texts,
  selected = null,
  editing = false,
  placeholder = 'متن ثابت…',
}: ImageTextsProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const resize = () => {
      const { width, height } = overlay.getBoundingClientRect()
      // میانگین هندسی برای تصاویر افقی و عمودی، با کران خوانایی روی موبایل/دسکتاپ.
      const size = Math.min(24, Math.max(10, Math.sqrt(width * height) * 0.04))
      overlay.style.setProperty('--image-text-size', `${size}px`)
    }

    resize()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize)
      return () => window.removeEventListener('resize', resize)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(overlay)
    return () => observer.disconnect()
  }, [texts.length])

  if (texts.length === 0) return null

  return (
    <div
      ref={overlayRef}
      className={`imgtexts${editing ? ' imgtexts--editing' : ''}`}
      aria-hidden={editing ? true : undefined}
    >
      {texts.map((item, index) => {
        const text = item.text || (editing ? placeholder : '')
        if (!text) return null
        const horizontal = item.x < 0.12 ? 'left' : item.x > 0.88 ? 'right' : ''
        const vertical = item.y < 0.25 ? 'top' : item.y > 0.75 ? 'bottom' : ''
        // عرض متن بر اساس فضای واقعی دو طرف نقطه محدود می‌شود تا از عکس بیرون نزند.
        const availableWidth = horizontal === 'left'
          ? 1 - item.x
          : horizontal === 'right'
            ? item.x
            : Math.min(item.x, 1 - item.x) * 2
        const maxWidth = Math.min(0.72, Math.max(0.08, availableWidth))
        return (
          <span
            key={index}
            className={[
              'imgtext',
              `imgtext--${item.color}`,
              horizontal ? `imgtext--${horizontal}` : '',
              vertical ? `imgtext--${vertical}` : '',
              editing && selected === index ? 'imgtext--on' : '',
              editing && !item.text ? 'imgtext--empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            dir="auto"
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              maxWidth: `${maxWidth * 100}%`,
            }}
          >
            {text}
          </span>
        )
      })}
    </div>
  )
}
