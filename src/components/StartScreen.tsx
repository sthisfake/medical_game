import { toFa, faPercent } from '../lib/format'
import type { Stage } from '../types'
import { Button } from './ui'

interface StartScreenProps {
  stages: Stage[]
  totalQuestions: number
  onStart: () => void
}

/** صفحهٔ شروع: معرفی خودآزمایی + فهرست مراحل + راهنما */
export function StartScreen({ stages, totalQuestions, onStart }: StartScreenProps) {
  const playable = stages.filter((s) => s.questions.length > 0)
  const disabled = playable.length === 0

  return (
    <div className="screen screen--start">
      <header className="hero">
        <h1 className="hero__title">آناتومی صورت</h1>
        <Button onClick={onStart} disabled={disabled} className="btn--lg">
          شروع آزمون
        </Button>
        {disabled && (
          <p className="hero__note">هنوز سؤالی ثبت نشده است — به‌زودی فعال می‌شود.</p>
        )}
      </header>

      <section aria-labelledby="stages-title">
        <h2 className="section-title" id="stages-title">
          مراحل آزمون
        </h2>
        <div className="stages">
          {stages.map((s) => {
            const ready = s.questions.length > 0
            return (
              <article key={s.id} className={`stage-row${ready ? '' : ' stage-row--locked'}`}>
                <span className="stage-row__order" aria-hidden="true">
                  {toFa(s.order)}
                </span>
                <div className="stage-row__body">
                  <h3>{s.title}</h3>
                  {s.subtitle && <p>{s.subtitle}</p>}
                </div>
                <div className="stage-row__chips">
                  {ready ? (
                    <>
                      <span className="chip">{toFa(s.questions.length)} سؤال</span>
                      <span className="chip chip--soft">
                        شرط عبور: حداقل {faPercent(s.passRatio)} در تلاش اول
                      </span>
                    </>
                  ) : (
                    <span className="chip chip--muted">در حال آماده‌سازی</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <footer className="start-footer">
        مجموع {toFa(totalQuestions)} سؤال در {toFa(stages.length)} مرحله
      </footer>
    </div>
  )
}
