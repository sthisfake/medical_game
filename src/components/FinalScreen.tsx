import { toFa } from '../lib/format'
import type { StageStats } from '../types'
import { Button } from './ui'

interface FinalScreenProps {
  overall: StageStats
  /** آیا کارنامه با ایمیل به مسئول آزمون فرستاده شد */
  mailSent?: boolean
  onRestart: () => void
  onHome: () => void
}

/** صفحهٔ پایان: پس از گذراندن موفق همهٔ مراحل */
export function FinalScreen({ overall, mailSent = false, onRestart, onHome }: FinalScreenProps) {
  const pct =
    overall.total > 0 ? Math.round((overall.firstTryCorrect / overall.total) * 100) : 0

  return (
    <div className="screen screen--result">
      <div className="result card">
        <div className="result__icon result__icon--ok" aria-hidden="true">
          ✓
        </div>

        <p className="result__kicker">پایان آزمون</p>
        <h1 className="result__title">همهٔ مراحل با موفقیت به پایان رسید</h1>
        <p className="result__lead">نتیجهٔ نهایی خودآزمایی:</p>

        <div className="stat-grid">
          <div className="stat">
            <b className="stat__num stat__num--ok">{toFa(overall.firstTryCorrect)}</b>
            <span>پاسخِ درست در تلاش اول</span>
          </div>
          <div className="stat">
            <b className="stat__num">{toFa(overall.secondTryCorrect)}</b>
            <span>پاسخِ درست در تلاش دوم</span>
          </div>
          <div className="stat">
            <b className="stat__num stat__num--bad">{toFa(overall.mistakes)}</b>
            <span>پاسخ نادرست</span>
          </div>
          <div className="stat">
            <b className="stat__num">{toFa(pct)}٪</b>
            <span>درصد موفقیت کلی</span>
          </div>
        </div>

        <p className="result__note">
          از مجموع {toFa(overall.total)} سؤال، {toFa(overall.firstTryCorrect)} سؤال در تلاش اول
          به‌درستی پاسخ داده شد.
        </p>

        {mailSent && (
          <p className="result__mail">✓ کارنامهٔ شما برای مسئول آزمون ایمیل شد.</p>
        )}

        <div className="result__actions result__actions--row">
          <Button onClick={onRestart} className="btn--lg">
            شروع مجدد آزمون
          </Button>
          <Button variant="ghost" onClick={onHome}>
            بازگشت به صفحهٔ نخست
          </Button>
        </div>
      </div>
    </div>
  )
}
