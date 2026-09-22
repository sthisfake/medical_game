import { toFa, faPercent } from '../lib/format'
import type { Stage, StudentName } from '../types'
import { Button } from './ui'

interface StartScreenProps {
  stages: Stage[]
  totalQuestions: number
  /** نام و نام خانوادگی — فقط برای کارنامهٔ همین آزمون */
  student: StudentName
  onStudentChange: (value: StudentName) => void
  onStart: () => void
}

/** صفحهٔ شروع: نام کاربر + معرفی خودآزمایی + فهرست مراحل + راهنما */
export function StartScreen({
  stages,
  totalQuestions,
  student,
  onStudentChange,
  onStart,
}: StartScreenProps) {
  const playable = stages.filter((s) => s.questions.length > 0)
  const disabled = playable.length === 0
  const named = student.firstName.trim().length > 0 && student.lastName.trim().length > 0
  const canStart = !disabled && named

  return (
    <div className="screen screen--start">
      <header className="hero">
        <h1 className="hero__title">آناتومی صورت</h1>

        <div className="hero__form">
          <label className="field">
            <span>نام</span>
            <input
              type="text"
              value={student.firstName}
              onChange={(e) => onStudentChange({ ...student, firstName: e.target.value })}
              placeholder="مثلاً: سارا"
              maxLength={60}
              autoComplete="given-name"
              disabled={disabled}
            />
          </label>
          <label className="field">
            <span>نام خانوادگی</span>
            <input
              type="text"
              value={student.lastName}
              onChange={(e) => onStudentChange({ ...student, lastName: e.target.value })}
              placeholder="مثلاً: محمدی"
              maxLength={60}
              autoComplete="family-name"
              disabled={disabled}
            />
          </label>
        </div>

        <Button onClick={onStart} disabled={!canStart} className="btn--lg">
          شروع آزمون
        </Button>

        {disabled ? (
          <p className="hero__note">هنوز سؤالی ثبت نشده است — به‌زودی فعال می‌شود.</p>
        ) : (
          !named && <p className="hero__note">برای شروع، نام و نام خانوادگی خود را بنویسید.</p>
        )}

        <p className="hero__privacy">
          نام شما فقط برای کارنامهٔ همین آزمون استفاده می‌شود و جایی ذخیره نمی‌شود.
        </p>
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
