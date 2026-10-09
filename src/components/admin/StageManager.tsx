'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { toFa } from '../../lib/format'
import { prepareImageForUpload } from '../../lib/image-resize'
import {
  DEFAULT_REVIEW_SECONDS,
  MAX_REVIEW_IMAGES,
  MAX_REVIEW_SECONDS,
  MIN_REVIEW_SECONDS,
  stageReviewImages,
} from '../../lib/review'
import type { Stage, StageInput } from '../../types'
import { AdminShell } from './AdminShell'
import { Button } from '../ui'

interface StagesResponse {
  stages: Stage[]
}

interface UploadResponse {
  path: string
  note?: string
}

const emptyForm = (): StageInput => ({
  order: 1,
  icon: '📘',
  title: '',
  subtitle: '',
  passRatio: 0.5,
  reviewImage: '',
  reviewImage2: '',
  reviewText: '',
  reviewSeconds: DEFAULT_REVIEW_SECONDS,
})

/** خلاصهٔ وضعیت بازبینی برای کارت مرحله */
function reviewSummary(s: Stage): string {
  const images = stageReviewImages(s).length
  const hasText = (s.reviewText ?? '').trim() !== ''
  if (images === 0 && !hasText) return 'بدون بازبینی'
  const what = [images > 0 ? `${toFa(images)} تصویر` : '', hasText ? 'متن' : '']
    .filter(Boolean)
    .join(' + ')
  return `بازبینی: ${what} • ${toFa(s.reviewSeconds ?? DEFAULT_REVIEW_SECONDS)} ثانیه`
}

/** صفحهٔ مدیریت مراحل: فهرست + ساخت/ویرایش/حذف + بازبینی پایان مرحله */
export function StageManager() {
  const [stages, setStages] = useState<Stage[]>([])
  const [error, setError] = useState('')
  const [form, setForm] = useState<StageInput | null>(null) // null = بسته
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadNote, setUploadNote] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<StagesResponse>('/api/stages')
      setStages(data.stages)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    setEditId(null)
    setForm(emptyForm())
  }

  const openEdit = (s: Stage) => {
    setEditId(s.id)
    setUploadNote('')
    setForm({
      order: s.order,
      icon: s.icon,
      title: s.title,
      subtitle: s.subtitle,
      passRatio: s.passRatio,
      reviewImage: s.reviewImage ?? '',
      reviewImage2: s.reviewImage2 ?? '',
      reviewText: s.reviewText ?? '',
      reviewSeconds: s.reviewSeconds ?? DEFAULT_REVIEW_SECONDS,
    })
  }

  /** آپلود تصویر بازبینی — جای ۱ یا ۲. مثل تصویر سؤال، فشرده‌سازی در مرورگر */
  const uploadReviewImage = async (file: File, slot: 1 | 2) => {
    setBusy(true)
    setError('')
    setUploadNote('')
    try {
      const prepared = await prepareImageForUpload(file)
      setUploadNote(prepared.note)
      const fd = new FormData()
      fd.append('file', prepared.blob, prepared.fileName)
      const data = await api<UploadResponse>('/api/upload', { method: 'POST', body: fd })
      setForm((f) =>
        f ? (slot === 1 ? { ...f, reviewImage: data.path } : { ...f, reviewImage2: data.path }) : f,
      )
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const clearReviewImage = (slot: 1 | 2) => {
    setUploadNote('')
    setForm((f) => (f ? (slot === 1 ? { ...f, reviewImage: '' } : { ...f, reviewImage2: '' }) : f))
  }

  const save = async () => {
    if (!form || !form.title.trim()) {
      setError('عنوان مرحله الزامی است')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editId === null) {
        await api('/api/stages', { method: 'POST', body: JSON.stringify(form) })
      } else {
        await api(`/api/stages/${editId}`, { method: 'PUT', body: JSON.stringify(form) })
      }
      setForm(null)
      setEditId(null)
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: Stage) => {
    const n = s.questions.length
    const ok = window.confirm(
      `مرحلهٔ «${s.title}» حذف شود؟${n > 0 ? `\n${toFa(n)} سؤال داخل آن هم حذف می‌شوند.` : ''}`,
    )
    if (!ok) return
    try {
      await api(`/api/stages/${s.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <AdminShell title="مدیریت مراحل بازی" backHref="/" backLabel="بازی">
      {error && <div className="admin-alert">{error}</div>}

      <div className="admin-toolbar">
        {form ? (
          <Button onClick={save} disabled={saving}>
            {saving ? 'در حال ذخیره…' : editId === null ? 'افزودن مرحله' : 'ذخیرهٔ تغییرات'}
          </Button>
        ) : (
          <Button onClick={openNew}>+ افزودن مرحله</Button>
        )}
      </div>

      {form && (
        <div className="admin-card form-grid">
          <label className="field">
            <span>عنوان مرحله *</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="مثلاً مرحلهٔ ۲ — عروق صورت"
            />
          </label>
          <label className="field">
            <span>آیکون (ایموجی)</span>
            <input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="🩸"
            />
          </label>
          <label className="field">
            <span>شمارهٔ ترتیب</span>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field">
            <span>نسبت قبولی (مثلاً ۰.۵ = ۵۰٪)</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={form.passRatio}
              onChange={(e) => setForm({ ...form, passRatio: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field field--wide">
            <span>توضیح کوتاه (اختیاری)</span>
            <input
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              placeholder="موضوع مرحله"
            />
          </label>

          {/* ---------- بازبینی پایان مرحله ---------- */}
          <div className="field field--wide stage-review-field">
            <span>بازبینی پایان مرحله (اختیاری)</span>
            <p className="field__note">
              بعد از قبولیِ این مرحله، یک صفحهٔ بازبینی با تصویر و متن آموزشی نشان داده می‌شود.
              این صفحه سؤال نیست و امتیازی ندارد. می‌توانید تا <b>{toFa(MAX_REVIEW_IMAGES)} تصویر</b>{' '}
              بگذارید؛ اگر هر دو تصویر پر باشند، کنار هم نمایش داده می‌شوند. اگر تصویرها و متن
              خالی باشند، بازبینی نمایش داده نمی‌شود.
            </p>
          </div>

          <label className="field">
            <span>مدت نمایش بازبینی (ثانیه)</span>
            <input
              type="number"
              min={MIN_REVIEW_SECONDS}
              max={MAX_REVIEW_SECONDS}
              value={form.reviewSeconds}
              onChange={(e) =>
                setForm({
                  ...form,
                  reviewSeconds:
                    e.target.value === '' ? DEFAULT_REVIEW_SECONDS : Number(e.target.value),
                })
              }
            />
            <small className="field__note">
              پیش‌فرض {toFa(DEFAULT_REVIEW_SECONDS)} ثانیه (۲ دقیقه) — دانشجو هر لحظه می‌تواند رد کند.
            </small>
          </label>

          <div className="field field--wide">
            <span>تصویرهای بازبینی (تا {toFa(MAX_REVIEW_IMAGES)} تصویر — کنار هم نمایش داده می‌شوند)</span>
            <div className="review-admin">
              {([1, 2] as const).map((slot) => {
                const value = slot === 1 ? form.reviewImage : form.reviewImage2
                return (
                  <div key={slot} className="review-admin__slot">
                    <span className="review-admin__slot-label">تصویر {toFa(slot)}</span>
                    {value ? (
                      <img
                        className="review-admin__thumb"
                        src={value}
                        alt={`پیش‌نمایش تصویر ${toFa(slot)}`}
                      />
                    ) : (
                      <div className="review-admin__empty">تصویری انتخاب نشده</div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={busy}
                      aria-label={`انتخاب تصویر ${toFa(slot)} بازبینی`}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) void uploadReviewImage(f, slot)
                      }}
                    />
                    {value && (
                      <button
                        type="button"
                        className="btn-link btn-link--danger review-admin__remove"
                        onClick={() => clearReviewImage(slot)}
                      >
                        حذف تصویر {toFa(slot)}
                      </button>
                    )}
                  </div>
                )
              })}
              {uploadNote && <small className="field__note review-admin__hint">{uploadNote}</small>}
            </div>
          </div>

          <label className="field field--wide">
            <span>متن آموزشی بازبینی</span>
            <textarea
              className="field__textarea"
              rows={6}
              value={form.reviewText}
              onChange={(e) => setForm({ ...form, reviewText: e.target.value })}
              placeholder={'نکته‌های کلیدی این مرحله را بنویسید…\nهر خط جداگانه نمایش داده می‌شود.'}
            />
          </label>

          <div className="field field--wide field--actions">
            <Button variant="ghost" onClick={() => { setForm(null); setEditId(null) }}>
              انصراف
            </Button>
          </div>
        </div>
      )}

      <div className="stage-list">
        {stages.map((s) => (
          <div key={s.id} className="stage-card">
            <div className="stage-card__order">{toFa(s.order)}</div>
            <div className="stage-card__icon">{s.icon}</div>
            <div className="stage-card__body">
              <a className="stage-card__title" href={`/admin/stage/${s.id}`}>
                {s.title}
              </a>
              <div className="stage-card__meta">
                {toFa(s.questions.length)} سؤال • شرط قبولی حداقل {toFa(Math.round(s.passRatio * 100))}٪
                {s.subtitle ? ` • ${s.subtitle}` : ''}
                {` • ${reviewSummary(s)}`}
              </div>
            </div>
            <div className="stage-card__actions">
              <a className="btn-link" href={`/admin/stage/${s.id}`}>
                سؤال‌ها
              </a>
              <button className="btn-link" onClick={() => openEdit(s)}>
                ویرایش
              </button>
              <button className="btn-link btn-link--danger" onClick={() => remove(s)}>
                حذف
              </button>
            </div>
          </div>
        ))}
        {stages.length === 0 && <p className="admin-empty">هنوز مرحله‌ای نساخته‌اید.</p>}
      </div>
    </AdminShell>
  )
}
