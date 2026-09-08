import { toFa } from '../lib/format'
import type { StageStats } from '../types'

interface ScoreBarProps {
  stageTitle: string
  stats: StageStats
  /** شمارهٔ سؤالِ فعلی (۱-پایه) */
  current: number
}

/** نوار پایین صفحه: آمار زندهٔ درست/غلط و جایگاه سؤال */
export function ScoreBar({ stageTitle, stats, current }: ScoreBarProps) {
  const answered = stats.firstTryCorrect + stats.secondTryCorrect + stats.mistakes
  const progress = stats.total > 0 ? Math.min(1, answered / stats.total) : 0

  return (
    <div className="scorebar">
      <div className="scorebar__top">
        <span className="scorebar__stage">{stageTitle}</span>
        <span className="scorebar__q">
          سؤال {toFa(current)} از {toFa(stats.total)}
        </span>
      </div>

      <div className="scorebar__cells">
        <div className="cell cell--ok">
          <b>{toFa(stats.firstTryCorrect)}</b>
          <span>درستِ تلاش اول</span>
        </div>
        <div className="cell cell--second">
          <b>{toFa(stats.secondTryCorrect)}</b>
          <span>درست با تلاش دوم</span>
        </div>
        <div className="cell cell--bad">
          <b>{toFa(stats.mistakes)}</b>
          <span>غلط</span>
        </div>
      </div>

      <div className="scorebar__track" aria-hidden="true">
        <div className="scorebar__fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}
