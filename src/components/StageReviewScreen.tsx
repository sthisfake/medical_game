'use client'

import { useEffect, useRef, useState } from 'react'
import { toFa } from '../lib/format'
import { stageReviewImages } from '../lib/review'
import type { Stage } from '../types'
import { Button } from './ui'
import { TimerRing } from './TimerRing'

interface StageReviewScreenProps {
  stage: Stage
  /** پایان بازبینی — با اتمام زمان یا با دکمهٔ رد کردن */
  onDone: () => void
}

/**
 * بازبینی پایان مرحله — یک تصویر و متن آموزشی برای فهم بهتر مفاهیم.
 * سؤال نیست: نه امتیاز دارد و نه در کارنامه ثبت می‌شود. شمارش معکوس دارد و
 * دانشجو هر لحظه می‌تواند آن را رد کند.
 */
export function StageReviewScreen({ stage, onDone }: StageReviewScreenProps) {
  const total = Math.max(1, Math.round(stage.reviewSeconds))
  // تا دو تصویر، کنار هم نمایش داده می‌شوند
  const images = stageReviewImages(stage)
  const [remaining, setRemaining] = useState(total)
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  // محافظ: onDone فقط یک‌بار صدا زده شود (پایان زمان و رد کردن با هم)
  const doneRef = useRef(false)
  const closeZoomRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (remaining > 0 || doneRef.current) return
    doneRef.current = true
    onDone()
  }, [remaining, onDone])

  // نمای بزرگ‌شده: بستن با Esc و جلوگیری از اسکرول صفحهٔ پشت آن
  useEffect(() => {
    if (zoomIndex === null) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setZoomIndex(null)
      if (e.key === 'Tab') {
        e.preventDefault()
        closeZoomRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeZoomRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      previousFocus?.focus()
    }
  }, [zoomIndex])

  const skip = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const clock = minutes > 0 ? `${toFa(minutes)}:${toFa(seconds).padStart(2, '۰')}` : `${toFa(seconds)} ثانیه`
  const imageAlt = (i: number) =>
    images.length > 1
      ? `تصویر بازبینی ${toFa(i + 1)} از ${toFa(images.length)} — ${stage.title}`
      : `تصویر بازبینی ${stage.title}`

  return (
    <div className="screen screen--review">
      <div className="review card">
        <div className="review__head">
          <div className="review__info">
            <p className="review__kicker">
              <span aria-hidden="true">{stage.icon}</span> {stage.title}
            </p>
            <h1 className="review__title">بازبینی پایان مرحله</h1>
            <p className="review__hint">
              این بخش سؤال نیست و امتیازی ندارد؛ فقط برای یادگیری بهتر مفاهیم است. زمان باقی‌مانده:{' '}
              <b className="review__clock">{clock}</b> — هر وقت خواستید می‌توانید رد کنید.
            </p>
          </div>
          <TimerRing secondsLeft={remaining} totalSeconds={total} />
        </div>

        {images.length > 0 && (
          <figure className={`review__figure${images.length > 1 ? ' review__figure--duo' : ''}`}>
            {images.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                className="review__image-button"
                aria-label={`بزرگ‌نمایی ${imageAlt(i)}`}
                onClick={() => setZoomIndex(i)}
              >
                <img className="review__img" src={src} alt={imageAlt(i)} draggable={false} />
                <span className="imgbox__zoom" aria-hidden="true">
                  بزرگ‌نمایی
                </span>
              </button>
            ))}
          </figure>
        )}

        {stage.reviewText && <div className="review__text">{stage.reviewText}</div>}

        <div className="review__actions">
          <Button onClick={skip}>رد کردن بازبینی و ادامه</Button>
        </div>
      </div>

      {zoomIndex !== null && images[zoomIndex] && (
        <div
          className="imgzoom"
          role="dialog"
          aria-modal="true"
          aria-label={imageAlt(zoomIndex)}
          onClick={() => setZoomIndex(null)}
        >
          <div className="imgzoom__stage">
            <img src={images[zoomIndex]} alt={imageAlt(zoomIndex)} draggable={false} />
          </div>
          <button
            ref={closeZoomRef}
            type="button"
            className="imgzoom__close"
            onClick={() => setZoomIndex(null)}
          >
            بستن
          </button>
        </div>
      )}
    </div>
  )
}
