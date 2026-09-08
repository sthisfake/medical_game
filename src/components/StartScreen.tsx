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
        <p className="hero__kicker">خودآزمایی تعاملی · آناتومی</p>
        <h1 className="hero__title">آناتومی صورت</h1>
        <p className="hero__lead">
          در این خودآزمایی، ساختارهای آناتومیک را روی تصویر شناسایی می‌کنید. پاسخ با کلیک روی تصویر
          داده می‌شود و ارزیابی بلافاصله انجام می‌گیرد؛ پس از هر پاسخ، توضیح آموزشی مربوطه نمایش
          داده می‌شود.
        </p>
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

      <section aria-labelledby="rules-title">
        <h2 className="section-title" id="rules-title">
          راهنمای آزمون
        </h2>
        <div className="rules">
          <div className="rule">
            <span className="rule__idx" aria-hidden="true">
              {toFa(1)}
            </span>
            <div>
              <b>۶۰ ثانیه برای هر سؤال</b>
              <p>
                با پایان زمان، سؤال نادرست تلقی می‌شود و پاسخ صحیح به‌همراه توضیح آموزشی نمایش
                داده می‌شود.
              </p>
            </div>
          </div>
          <div className="rule">
            <span className="rule__idx" aria-hidden="true">
              {toFa(2)}
            </span>
            <div>
              <b>هر سؤال دو بار قابل پاسخ است</b>
              <p>
                پاسخ با کلیک روی تصویر داده می‌شود. پاسخِ درست در تلاش اول، برای عبور از مرحله ثبت
                می‌شود؛ پاسخ درست در تلاش دوم صرفاً نمایشی است.
              </p>
            </div>
          </div>
          <div className="rule">
            <span className="rule__idx" aria-hidden="true">
              {toFa(3)}
            </span>
            <div>
              <b>شرط عبور و شروع مجدد</b>
              <p>
                عبور از مرحله مستلزم حداقل ۵۰٪ پاسخِ درستِ تلاش اول است. در صورت عدم عبور، آزمون از
                مرحلهٔ یکم آغاز می‌شود.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="start-footer">
        مجموع {toFa(totalQuestions)} سؤال در {toFa(stages.length)} مرحله
        <span className="start-footer__sep">·</span>
        <a className="start-footer__admin" href="/admin">
          پنل مدیریت
        </a>
      </footer>
    </div>
  )
}
