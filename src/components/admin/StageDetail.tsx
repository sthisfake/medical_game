'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { toFa } from '../../lib/format'
import type { Question, Stage } from '../../types'
import { AdminShell } from './AdminShell'

interface StageResponse {
  stage: Stage
}

/** سؤال‌های یک مرحله + افزودن/حذف */
export function StageDetail({ stageId }: { stageId: number }) {
  const [stage, setStage] = useState<Stage | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<StageResponse>(`/api/stages/${stageId}`)
      setStage(data.stage)
    } catch (e) {
      setError(String(e))
    }
  }, [stageId])

  useEffect(() => {
    void load()
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

  if (error) {
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
      <div className="admin-toolbar">
        <a className="btn btn--primary" href={`/admin/question/new?stage=${stage.id}`}>
          + افزودن سؤال
        </a>
      </div>

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
