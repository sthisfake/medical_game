import { toFa } from '../lib/format'

interface TimerRingProps {
  /** ثانیهٔ باقی‌مانده */
  secondsLeft: number
  /** کل زمان هر سؤال */
  totalSeconds: number
}

/** حلقهٔ شمارش معکوس — بالای هر سؤال */
export function TimerRing({ secondsLeft, totalSeconds }: TimerRingProps) {
  const frac = totalSeconds > 0 ? Math.max(0, secondsLeft) / totalSeconds : 0
  const R = 17.5
  const C = 2 * Math.PI * R
  const danger = secondsLeft <= 15
  const tone = danger ? 'danger' : secondsLeft <= 30 ? 'warn' : 'ok'

  return (
    <div
      className={`timer timer--${tone}`}
      role="timer"
      aria-live="off"
      aria-label={`${toFa(secondsLeft)} ثانیه مانده`}
    >
      <svg viewBox="0 0 40 40" className="timer__ring">
        <circle className="timer__track" cx="20" cy="20" r={R} />
        <circle
          className="timer__arc"
          cx="20"
          cy="20"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
        />
      </svg>
      <span className="timer__text">{toFa(Math.max(0, secondsLeft))}</span>
    </div>
  )
}
