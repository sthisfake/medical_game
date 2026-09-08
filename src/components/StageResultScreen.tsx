import { toFa } from '../lib/format'
import type { StageResult } from '../types'
import { Button } from './ui'

interface StageResultScreenProps {
  result: StageResult
  onContinue: () => void
}

/** صفحهٔ نتیجهٔ پایان هر مرحله: قبولی → مرحلهٔ بعد / شکست → شروع مجدد از مرحلهٔ ۱ */
export function StageResultScreen({ result, onContinue }: StageResultScreenProps) {
  const { stage, passed, required, stats } = result
  const pct = stats.total > 0 ? Math.round((stats.firstTryCorrect / stats.total) * 100) : 0

  return (
    <div className="screen screen--result">
      <div className="result card">
        <div className={`result__icon result__icon--${passed ? 'ok' : 'bad'}`} aria-hidden="true">
          {passed ? '✓' : '✕'}
        </div>

        <p className="result__kicker">{stage.title}</p>
        <h1 className="result__title">
          {passed
            ? `مرحلهٔ ${toFa(stage.order)} با موفقیت به پایان رسید`
            : 'این مرحله با موفقیت سپری نشد'}
        </h1>

        <div className="stat-grid">
          <div className="stat">
            <b className="stat__num stat__num--ok">{toFa(stats.firstTryCorrect)}</b>
            <span>پاسخِ درست در تلاش اول</span>
          </div>
          <div className="stat">
            <b className="stat__num">{toFa(stats.secondTryCorrect)}</b>
            <span>پاسخِ درست در تلاش دوم</span>
          </div>
          <div className="stat">
            <b className="stat__num stat__num--bad">{toFa(stats.mistakes)}</b>
            <span>پاسخ نادرست</span>
          </div>
          <div className="stat">
            <b className="stat__num">{toFa(pct)}٪</b>
            <span>درصد موفقیت</span>
          </div>
        </div>

        <p className="result__note">
          از مجموع {toFa(stats.total)} سؤال، {toFa(stats.firstTryCorrect)} پاسخِ درست در تلاش اول
          ثبت شد. شرط عبور از این مرحله، حداقل {toFa(required)} پاسخِ درستِ تلاش اول بود.
        </p>

        <div className="result__actions">
          {passed ? (
            <Button onClick={onContinue} className="btn--lg">
              رفتن به مرحلهٔ بعد
            </Button>
          ) : (
            <>
              <Button onClick={onContinue} className="btn--lg">
                شروع مجدد از مرحلهٔ ۱
              </Button>
              <p className="result__rule-note">
                طبق آیین‌نامهٔ آزمون، پس از عدم عبور از هر مرحله، آزمون از مرحلهٔ یکم آغاز می‌شود.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
