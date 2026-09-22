'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SettingsResponse } from '../../types'
import { AdminShell } from './AdminShell'
import { Button } from '../ui'

/* ------------------------------------------------------------------ */
/* تنظیمات اطلاع‌رسانی — نشانی ایمیلِ گیرندهٔ کارنامهٔ پایان آزمون      */
/* ------------------------------------------------------------------ */

/** تاریخ و ساعت به وقت تهران (شمسی) */
function faTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return d.toISOString()
  }
}

interface CallResult {
  data?: SettingsResponse
  error?: string
}

async function call(url: string, init?: RequestInit): Promise<CallResult> {
  try {
    const res = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
    const body = (await res.json().catch(() => null)) as
      | (SettingsResponse & { error?: string })
      | null
    if (!res.ok) return { error: body?.error ?? `خطا در ارتباط با سرور (${res.status})` }
    return { data: body as SettingsResponse }
  } catch {
    return { error: 'ارتباط با سرور برقرار نشد.' }
  }
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const apply = (data: SettingsResponse) => {
    setSettings(data)
    setEmail(data.notifyEmail)
  }

  const load = useCallback(async () => {
    const { data, error: err } = await call('/api/settings')
    if (err) setError(err)
    else if (data) apply(data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    const { data, error: err } = await call('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ notifyEmail: email.trim() }),
    })
    setSaving(false)
    if (err) setError(err)
    else if (data) {
      apply(data)
      setNotice(
        data.notifyEmail
          ? 'نشانی ذخیره شد. از این پس کارنامهٔ هر آزمون تمام‌شده به این ایمیل فرستاده می‌شود.'
          : 'نشانی پاک شد. تا وقتی نشانی‌ای ذخیره نشود، ایمیلی فرستاده نمی‌شود.',
      )
    }
  }

  const test = async () => {
    setTesting(true)
    setError('')
    setNotice('')
    const { data, error: err } = await call('/api/settings', { method: 'POST' })
    setTesting(false)
    if (err) {
      setError(err)
      await load() // نتیجهٔ آزمایش را هم به‌روز کن
      return
    }
    if (data) {
      apply(data)
      setNotice('ایمیل آزمایشی فرستاده شد. صندوق ورودی (و پوشهٔ اسپم) را ببینید.')
    }
  }

  const configured = settings?.mailConfigured === true
  const saved = settings?.notifyEmail ?? ''
  const dirty = email.trim() !== saved
  const canTest = configured && saved.length > 0 && !dirty

  return (
    <AdminShell title="تنظیمات اطلاع‌رسانی">
      <div className="card settings">
        <h2 className="settings__title">ایمیل کارنامهٔ آزمون</h2>
        <p className="settings__lead">
          وقتی کاربری همهٔ مراحل را با موفقیت تمام کند، کارنامهٔ او (نام، امتیاز و فهرست
          پاسخ‌ها) به این نشانی فرستاده می‌شود. آزمون‌های نیمه‌کاره ایمیلی نمی‌فرستند.
        </p>

        <div className="settings__row">
          <label className="field">
            <span>نشانی ایمیل گیرندهٔ کارنامه</span>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              maxLength={160}
              disabled={saving}
            />
          </label>
          <div className="field field--actions">
            <Button onClick={save} disabled={saving}>
              {saving ? 'در حال ذخیره…' : 'ذخیره'}
            </Button>
          </div>
        </div>

        {error && <p className="settings__msg settings__msg--bad">{error}</p>}
        {notice && <p className="settings__msg settings__msg--ok">{notice}</p>}

        <div className={`settings__status${configured ? '' : ' settings__status--warn'}`}>
          {configured ? (
            <span>
              ✓ ارسال ایمیل روی سرور پیکربندی شده است
              {saved ? ` — گیرنده: ${saved}` : ' — ولی نشانی گیرنده هنوز ذخیره نشده است.'}
            </span>
          ) : (
            <span>
              ⚠ ارسال ایمیل روی سرور پیکربندی نشده است. متغیرهای محیطی{' '}
              <code>BREVO_API_KEY</code> و <code>MAIL_FROM</code> را روی Vercel تنظیم کنید
              (راهنما در README).
            </span>
          )}
        </div>

        <div className="settings__actions">
          <Button variant="ghost" onClick={test} disabled={!canTest || testing}>
            {testing ? 'در حال فرستادن…' : 'ارسال ایمیل آزمایشی'}
          </Button>
          {!canTest && !configured && (
            <span className="settings__hint">برای آزمایش، اول پیکربندی سرور لازم است.</span>
          )}
          {!canTest && configured && dirty && (
            <span className="settings__hint">برای آزمایش، ابتدا نشانی را ذخیره کنید.</span>
          )}
        </div>

        {settings?.lastTest && (
          <p className="settings__last">
            آخرین ایمیل آزمایشی: {faTime(settings.lastTest.at)} —{' '}
            {settings.lastTest.ok ? (
              <b className="settings__ok">موفق</b>
            ) : (
              <b className="settings__bad">ناموفق ({settings.lastTest.detail})</b>
            )}
          </p>
        )}

        <div className="settings__help">
          <h3>کارنامه چه چیزهایی دارد؟</h3>
          <ul>
            <li>نام و نام خانوادگی کاربر و زمان پایان آزمون (به وقت تهران)</li>
            <li>امتیاز نهایی: درصد پاسخ‌های درست در تلاش اول، و شمارش کلی</li>
            <li>جدول نتیجه به تفکیک هر مرحله</li>
            <li>جدول تک‌تک سؤال‌ها: سؤال، نتیجه (تلاش اول / تلاش دوم / نادرست / اتمام زمان) و تعداد تلاش</li>
          </ul>
          <p>
            هیچ اطلاعاتی از کاربران در دیتابیس ذخیره نمی‌شود؛ کارنامه فقط ایمیل می‌شود.
          </p>
        </div>
      </div>
    </AdminShell>
  )
}
