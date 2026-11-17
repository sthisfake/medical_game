'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { toFa } from '../../lib/format'
import type { Question, Stage } from '../../types'
import { AdminShell } from './AdminShell'
import { Button } from '../ui'

interface StagesResponse {
  stages: Stage[]
}

interface TransferResponse {
  moved: number
  targetStageId: number
  targetQuestionCount: number
}

interface TransferNotice extends TransferResponse {
  targetTitle: string
}

/** سؤال‌های یک مرحله + افزودن/حذف */
export function StageDetail({ stageId }: { stageId: number }) {
  const [stage, setStage] = useState<Stage | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [targetStageId, setTargetStageId] = useState(0)
  const [transferring, setTransferring] = useState(false)
  const [transferNotice, setTransferNotice] = useState<TransferNotice | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await api<StagesResponse>('/api/stages')
      const current = data.stages.find((item) => item.id === stageId)
      if (!current) throw new Error('مرحله یافت نشد.')
      setStage(current)
      setStages(data.stages)
      setTargetStageId((selected) =>
        selected !== stageId && data.stages.some((item) => item.id === selected) ? selected : 0,
      )
    } catch (e) {
      setError(String(e))
      throw e
    }
  }, [stageId])

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  const removeQuestion = async (q: Question) => {
    const ok = window.confirm(`سؤال «${q.prompt.slice(0, 40)}…» حذف شود؟`)
    if (!ok) return
    try {
      await api(`/api/questions/${q.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  const transferAll = async () => {
    if (!stage || targetStageId === 0 || transferring) return
    const target = stages.find((item) => item.id === targetStageId)
    if (!target) return
    const count = stage.questions.length
    const ok = window.confirm(
      `${toFa(count)} سؤال از «${stage.title}» به «${target.title}» منتقل شوند؟\n\n` +
        `• ${toFa(target.questions.length)} سؤال فعلیِ مقصد اول می‌مانند.\n` +
        `• سؤال‌های منتقل‌شده با همین ترتیب بعد از آن‌ها قرار می‌گیرند.\n` +
        '• همهٔ تصویرها، پاسخ‌ها، برچسب‌ها و توضیحات بدون تغییر می‌مانند.\n' +
        '• مرحلهٔ فعلی حذف نمی‌شود و پس از انتقال خالی می‌ماند.',
    )
    if (!ok) return

    setTransferring(true)
    setTransferNotice(null)
    setError('')
    try {
      const result = await api<TransferResponse>(`/api/stages/${stage.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ targetStageId }),
      })
      await load()
      setTransferNotice({ ...result, targetTitle: target.title })
    } catch (e) {
      setError(String(e))
    } finally {
      setTransferring(false)
    }
  }

  if (error && !stage) {
    return (
      <AdminShell title="خطا" backHref="/admin" backLabel="مدیریت مراحل">
        <div className="admin-alert">{error}</div>
      </AdminShell>
    )
  }
  if (!stage) return <AdminShell title="در حال بارگذاری…" backHref="/admin" />

  return (
    <AdminShell
      title={`${stage.icon} ${stage.title}`}
      backHref="/admin"
      backLabel="مدیریت مراحل"
    >
      {error && <div className="admin-alert">{error}</div>}
      {transferNotice && (
        <div className="admin-alert admin-alert--success">
          انتقال کامل شد: {toFa(transferNotice.moved)} سؤال منتقل شد و «{transferNotice.targetTitle}»
          اکنون {toFa(transferNotice.targetQuestionCount)} سؤال دارد.{' '}
          <a href={`/admin/stage/${transferNotice.targetStageId}`}>بررسی مرحلهٔ مقصد</a>
        </div>
      )}

      <div className="admin-toolbar">
        <a className="btn btn--primary" href={`/admin/question/new?stage=${stage.id}`}>
          + افزودن سؤال
        </a>
      </div>

      {stage.questions.length > 0 && stages.length > 1 && (
        <section className="admin-card stage-transfer" aria-labelledby="stage-transfer-title">
          <h2 id="stage-transfer-title" className="stage-transfer__title">
            انتقال سؤال‌ها به مرحلهٔ دیگر
          </h2>
          <p className="stage-transfer__text">
            برای ادغام مرحله‌ها، همهٔ {toFa(stage.questions.length)} سؤال این مرحله را یک‌جا منتقل
            کنید. سؤال‌های موجود مقصد اول می‌مانند و سؤال‌های این مرحله با همین ترتیب به انتهای آن
            اضافه می‌شوند. شناسه و تمام محتوای سؤال‌ها و تصویرها تغییر نمی‌کند.
          </p>
          <p className="stage-transfer__warning">
            خودِ مرحله، عنوان و بازبینی پایان آن منتقل نمی‌شوند. مرحلهٔ فعلی بعد از انتقال خالی
            می‌ماند تا ابتدا مقصد را بررسی کنید و فقط سپس آن را از صفحهٔ مدیریت مراحل حذف کنید.
          </p>
          <div className="stage-transfer__controls">
            <label className="field stage-transfer__select">
              <span>مرحلهٔ مقصد</span>
              <select
                value={targetStageId}
                disabled={transferring}
                onChange={(e) => setTargetStageId(Number(e.target.value))}
              >
                <option value={0}>— مقصد را انتخاب کنید —</option>
                {stages
                  .filter((item) => item.id !== stage.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.icon} {item.title} ({toFa(item.questions.length)} سؤال)
                    </option>
                  ))}
              </select>
            </label>
            <Button
              variant="ghost"
              disabled={targetStageId === 0 || transferring}
              onClick={transferAll}
            >
              {transferring
                ? 'در حال انتقال امن…'
                : `انتقال هر ${toFa(stage.questions.length)} سؤال`}
            </Button>
          </div>
          <small className="stage-transfer__single">
            برای انتقال فقط یک سؤال، «ویرایش» همان سؤال را باز و فیلد «مرحله» را تغییر دهید.
          </small>
        </section>
      )}

      <div className="q-list">
        {stage.questions.map((q, i) => (
          <div key={q.id} className="q-row">
            <div className="q-row__thumb">
              {q.image ? <img src={q.image} alt="" /> : <span>—</span>}
            </div>
            <div className="q-row__body">
              <div className="q-row__num">سؤال {toFa(i + 1)}</div>
              <div className="q-row__prompt">{q.prompt}</div>
              <div className="q-row__meta">
                <span className="chip chip--soft">
                  {q.type === 'video' ? 'ویدیویی' : q.type === 'mcq' ? 'چهارگزینه‌ای' : 'تصویری'}
                </span>
                {q.zones.length > 0 ? (
                  <span className="chip">{toFa(q.zones.length)} ناحیهٔ پاسخ</span>
                ) : q.type === 'image' ? (
                  <span className="chip chip--muted">بدون ناحیهٔ پاسخ</span>
                ) : (
                  <span className="chip">{toFa(q.options.length)} گزینه</span>
                )}
                {!q.image && <span className="chip chip--muted">بدون تصویر</span>}
              </div>
            </div>
            <div className="q-row__actions">
              <a className="btn-link" href={`/admin/question/${q.id}`}>
                ویرایش
              </a>
              <button className="btn-link btn-link--danger" onClick={() => removeQuestion(q)}>
                حذف
              </button>
            </div>
          </div>
        ))}
        {stage.questions.length === 0 && (
          <p className="admin-empty">
            این مرحله هنوز سؤالی ندارد — «افزودن سؤال» را بزنید و تصویر + ناحیهٔ پاسخ را مشخص کنید.
          </p>
        )}
      </div>
    </AdminShell>
  )
}
