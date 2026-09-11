'use client'

import { useEffect, useRef, useState } from 'react'
import { CONFIG } from '../config'
import { pointInZoneAt } from '../lib/geo'
import type { Pt } from '../lib/geo'
import { toFa } from '../lib/format'
import type { ActiveQuestion, Question, Stage, StageStats } from '../types'
import { AnatomyImage } from './AnatomyImage'
import { ScoreBar } from './ScoreBar'
import { TimerRing } from './TimerRing'
import { VideoPlayer } from './VideoPlayer'
import { Button } from './ui'

interface QuestionScreenProps {
  stage: Stage
  question: Question
  questionIndex: number
  active: ActiveQuestion
  stats: StageStats
  /** نتیجهٔ یک پاسخ: درست = داخل ناحیهٔ درست / گزینهٔ درست */
  onAttemptCorrect: (correct: boolean) => void
  onExpire: () => void
  onNext: () => void
  onExit: () => void
}

/**
 * صفحهٔ سؤال — سه نوع:
 *  - image: کلیک روی تصویر (اگر چند ناحیهٔ درست باشد، باید همه کلیک شوند)
 *  - mcq:   سه/چهار گزینهٔ متنی
 *  - video: ویدیو + سه/چهار گزینهٔ متنی
 */
export function QuestionScreen({
  stage,
  question,
  questionIndex,
  active,
  stats,
  onAttemptCorrect,
  onExpire,
  onNext,
  onExit,
}: QuestionScreenProps) {
  const open = active.status === 'open'
  const [remaining, setRemaining] = useState<number>(CONFIG.questionSeconds)
  const [wrongMarkers, setWrongMarkers] = useState<Pt[]>([])
  const [correctMarkers, setCorrectMarkers] = useState<Pt[]>([])
  const [blankNotice, setBlankNotice] = useState(false)
  const [chosen, setChosen] = useState<number | null>(null)
  const [zoom, setZoom] = useState(false)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const qKey = `${stage.id}:${questionIndex}:${question.id}`

  const correctZones = question.zones.filter((z) => z.correct !== false).length
  const multiClick = question.type === 'image' && correctZones > 1

  // شروع مجدد زمان و پاک‌کردن علامت‌ها برای هر سؤال جدید
  useEffect(() => {
    setRemaining(CONFIG.questionSeconds)
    setWrongMarkers([])
    setCorrectMarkers([])
    setBlankNotice(false)
    setChosen(null)
  }, [qKey])

  // شمارش معکوس — فقط وقتی سؤال باز است
  useEffect(() => {
    if (!open || remaining <= 0) return
    const t = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => window.clearInterval(t)
  }, [open, remaining])

  // اتمام وقت → اعلام به موتور بازی
  useEffect(() => {
    if (open && remaining === 0) onExpire()
  }, [open, remaining, onExpire])

  /** کلیک روی تصویر (نوع image) */
  const handleAttempt = (point: Pt): void => {
    if (!open) return
    // اگر خارج از همهٔ گزینه‌ها بود، تلاش مصرف نمی‌شود
    const zone = pointInZoneAt(
      question.zones,
      point.x,
      point.y,
      question.imageWidth,
      question.imageHeight,
    )
    if (!zone) {
      setBlankNotice(true)
      return
    }
    setBlankNotice(false)
    const correct = zone.correct !== false
    if (!correct) {
      setWrongMarkers((m) => [...m, point])
      onAttemptCorrect(false)
      return
    }
    if (multiClick) setCorrectMarkers((m) => [...m, point])
    onAttemptCorrect(true)
  }

  /** کلیک روی گزینه (نوع mcq / video) */
  const handleOption = (i: number): void => {
    if (!open) return
    const correct = i === question.correctIndex
    if (!correct) setChosen(i)
    onAttemptCorrect(correct)
  }

  const isMcq = question.type === 'mcq' || question.type === 'video'
  const hasExplanation = (question.explanation ?? '').trim().length > 0

  /**
   * بخشی از صفحه را تا بالای نوار پایین (شمارنده‌ها) در دید می‌آورد —
   * چون آن نوار ثابت است و می‌تواند گزینه‌ها یا دکمهٔ «سؤال بعدی» را بپوشاند.
   */
  const revealAboveBar = (el: HTMLElement | null): void => {
    if (!el) return
    const bar = document.querySelector('.scorebar-wrap')
    const limit = bar ? bar.getBoundingClientRect().top : window.innerHeight
    const overflow = el.getBoundingClientRect().bottom - (limit - 12)
    if (overflow <= 0) return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollBy({ top: overflow, behavior: reduce ? 'auto' : 'smooth' })
  }

  // سؤال جدید: از بالای صفحه شروع کن و اگر گزینه‌ها بیرون دید بودند، آن‌ها را در دید بیاور
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    if (!isMcq) return
    // فقط وقتی کاری می‌کند که گزینه‌ها زیر نوار پایین مانده باشند (صفحه‌های کوچک یا متن بلند)
    const t = window.setTimeout(() => revealAboveBar(optionsRef.current), 120)
    return () => window.clearTimeout(t)
  }, [qKey, isMcq])

  // با بسته‌شدن سؤال، بخش بازخورد (و دکمهٔ «سؤال بعدی») نرم وارد دید می‌شود
  useEffect(() => {
    if (open) return
    const t = window.setTimeout(() => revealAboveBar(feedbackRef.current), 80)
    return () => window.clearTimeout(t)
  }, [open])

  // نمای بزرگ‌شدهٔ تصویر: بستن با Esc و قفل اسکرول پشت آن
  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setZoom(false)
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [zoom])

  return (
    <div className="screen screen--play">
      <header className="playbar">
        <Button variant="ghost" onClick={onExit} className="playbar__exit">
          خروج
        </Button>
        <span className="playbar__title">{stage.title}</span>
        <TimerRing secondsLeft={remaining} totalSeconds={CONFIG.questionSeconds} />
      </header>

      <main className={`question${hasExplanation ? ' question--has-explain' : ''}`}>
        <div className="question__meta">
          <span className="pill">
            سؤال {toFa(questionIndex + 1)} از {toFa(stats.total)}
          </span>
          <span className="pill pill--soft">۶۰ ثانیه برای هر سؤال</span>
        </div>

        <h1 className="question__prompt">{question.prompt}</h1>

        {/* توضیح آموزشی: اگر مقدار داشته باشد همیشه (از لحظهٔ نمایش سؤال) دیده می‌شود */}
        {hasExplanation && (
          <aside className="explain explain--inline card" aria-label="توضیح آموزشی">
            <h2>توضیح آموزشی</h2>
            <p>{question.explanation}</p>
          </aside>
        )}

        {/* بدنهٔ سؤال: روی صفحهٔ پهن، تصویر/ویدیو کنار گزینه‌ها قرار می‌گیرد */}
        <div className={`question__body${isMcq ? ' question__body--split' : ''}`}>
          {question.type === 'video' && question.videoUrl && (
            <div className="question__video">
              <VideoPlayer url={question.videoUrl} />
            </div>
          )}

          {question.type === 'image' && (
            <div className="question__image card">
              <AnatomyImage
                image={question.image}
                imageWidth={question.imageWidth}
                imageHeight={question.imageHeight}
                zones={question.zones}
                reveal={!open}
                wrongMarkers={wrongMarkers}
                correctMarkers={correctMarkers}
                onAttempt={handleAttempt}
                locked={!open}
              />
            </div>
          )}

          {/* سؤال چهارگزینه‌ای: تصویر نمایشی — روی صفحهٔ پهن کنار گزینه‌ها، روی گوشی بالای آن‌ها */}
          {question.type === 'mcq' && question.image && (
            <div className="question__image card">
              <div
                className={`imgbox${
                  question.imageWidth > 0 && question.imageHeight > 0 ? '' : ' imgbox--auto'
                }`}
                style={
                  question.imageWidth > 0 && question.imageHeight > 0
                    ? {
                        aspectRatio: `${question.imageWidth} / ${question.imageHeight}`,
                        maxWidth: `calc(var(--image-max-h-display) * ${question.imageWidth} / ${question.imageHeight})`,
                      }
                    : undefined
                }
              >
                <img
                  src={question.image}
                  alt={question.prompt}
                  draggable={false}
                  className="question__img"
                  role="button"
                  tabIndex={0}
                  aria-label="بزرگ‌نمایی تصویر"
                  onClick={() => setZoom(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setZoom(true)
                  }}
                />
                <span className="imgbox__zoom" aria-hidden="true">
                  بزرگ‌نمایی
                </span>
              </div>
            </div>
          )}

          {isMcq && (
            <div className="question__options" ref={optionsRef}>
            <div className="options" role="group" aria-label="گزینه‌های پاسخ">
              {question.options.map((opt, i) => {
                const isCorrect = i === question.correctIndex
                const isChosenWrong = i === chosen && !isCorrect
                const cls = `option${!open && isCorrect ? ' option--correct' : ''}${
                  !open && isChosenWrong ? ' option--wrong' : ''
                }`
                return (
                  <button
                    key={i}
                    type="button"
                    className={cls}
                    onClick={() => handleOption(i)}
                    disabled={!open}
                  >
                    <span className="option__key" aria-hidden="true">
                      {toFa(i + 1)}
                    </span>
                    <span className="option__text">{opt}</span>
                    {!open && isCorrect && (
                      <span className="option__mark" aria-hidden="true">
                        ✓
                      </span>
                    )}
                    {!open && isChosenWrong && (
                      <span className="option__mark option__mark--wrong" aria-hidden="true">
                        ✕
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          )}
        </div>

        <div className="feedback" aria-live="polite" ref={feedbackRef}>
          {open && active.attemptsLeft === CONFIG.maxAttempts && !blankNotice && (
            <p className="feedback__hint">
              {multiClick
                ? `برای پاسخ، روی هر ${toFa(correctZones)} ناحیهٔ درستِ تصویر کلیک کنید.`
                : isMcq
                  ? 'برای پاسخ، روی یکی از گزینه‌ها کلیک کنید.'
                  : 'برای پاسخ، روی محل موردنظر در تصویر کلیک کنید.'}
            </p>
          )}

          {open && multiClick && correctMarkers.length > 0 && correctMarkers.length < correctZones && (
            <p className="feedback__hint">
              {toFa(correctMarkers.length)} از {toFa(correctZones)} پاسخِ درست پیدا شد — بقیه را هم
              بیابید.
            </p>
          )}

          {open && blankNotice && (
            <p className="feedback__hint feedback__hint--warn">
              این نقطه خارج از گزینه‌هاست؛ روی یکی از ناحیه‌های پاسخ کلیک کنید. (تلاش مصرف نشد)
            </p>
          )}

          {open && active.attemptsLeft < CONFIG.maxAttempts && (
            <div className="feedback__banner feedback__banner--warn">
              <b>پاسخ نادرست بود</b> یک بار دیگر می‌توانید تلاش کنید — با دقت بیشتری بررسی کنید.
            </div>
          )}

          {active.status === 'solved-first' && (
            <div className="feedback__banner feedback__banner--ok">
              <b>پاسخ صحیح است ✓</b> این پاسخ در تلاش اول ثبت شد و برای عبور از مرحله محسوب می‌شود.
              <div className="feedback__actions">
                <Button onClick={onNext}>سؤال بعدی</Button>
              </div>
            </div>
          )}

          {active.status === 'solved-second' && (
            <div className="feedback__banner feedback__banner--ok">
              <b>پاسخ صحیح است ✓</b> این پاسخ در تلاش دوم داده شده و در نتیجهٔ عبور از مرحله لحاظ
              نمی‌شود.
              <div className="feedback__actions">
                <Button onClick={onNext}>سؤال بعدی</Button>
              </div>
            </div>
          )}

          {active.status === 'failed' && (
            <div className="feedback__result">
              <div className="feedback__banner feedback__banner--bad">
                {active.failReason === 'timeout' ? (
                  <b>زمان پاسخ به پایان رسید</b>
                ) : (
                  <b>پاسخ نادرست بود</b>
                )}
                <span>
                  {isMcq
                    ? 'گزینهٔ درست با رنگ سبز مشخص شده است.'
                    : 'پاسخ درست با رنگ سبز روی تصویر مشخص شده است.'}
                </span>
              </div>
              <div className="feedback__actions">
                <Button onClick={onNext}>سؤال بعدی</Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="scorebar-wrap">
        <ScoreBar stageTitle={`${stage.title}`} stats={stats} current={questionIndex + 1} />
      </footer>

      {zoom && question.image && (
        <div
          className="imgzoom"
          role="dialog"
          aria-modal="true"
          aria-label="تصویر سؤال"
          onClick={() => setZoom(false)}
        >
          <img src={question.image} alt={question.prompt} draggable={false} />
          <button type="button" className="imgzoom__close" onClick={() => setZoom(false)}>
            بستن
          </button>
        </div>
      )}
    </div>
  )
}
