'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { toFa } from '../../lib/format'
import type { Stage, StageInput } from '../../types'
import { AdminShell } from './AdminShell'
import { Button } from '../ui'

interface StagesResponse {
  stages: Stage[]
}

const emptyForm = (): StageInput => ({
  order: 1,
  icon: '📘',
  title: '',
  subtitle: '',
  passRatio: 0.5,
})

/** صفحهٔ مدیریت مراحل: فهرست + ساخت/ویرایش/حذف */
export function StageManager() {
  const [stages, setStages] = useState<Stage[]>([])
  const [error, setError] = useState('')
  const [form, setForm] = useState<StageInput | null>(null) // null = بسته
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

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
    setForm({
      order: s.order,
      icon: s.icon,
      title: s.title,
      subtitle: s.subtitle,
      passRatio: s.passRatio,
    })
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
