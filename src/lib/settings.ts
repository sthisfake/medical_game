import { getSetting, setSetting } from './db'
import type { MailTestResult } from '../types'

/* ------------------------------------------------------------------ */
/* تنظیمات اطلاع‌رسانی                                                */
/*                                                                     */
/* این تنظیمات در جدول کلید/مقدار meta ذخیره می‌شوند؛ نوشتن فقط روی    */
/* همان یک کلید انجام می‌شود و هیچ دادهٔ دیگری تغییر نمی‌کند.           */
/* ------------------------------------------------------------------ */

/** نشانی گیرندهٔ نتیجهٔ آزمون */
export const NOTIFY_EMAIL_KEY = 'notify_email'

/** نتیجهٔ آخرین ایمیل آزمایشی — برای نشان‌دادن وضعیت در پنل مدیریت */
export const MAIL_TEST_KEY = 'mail_test_result'

/** اعتبارسنجی سادهٔ نشانی ایمیل (یک @، دامنهٔ نقطه‌دار، بدون فاصله) */
export function isValidEmail(value: string): boolean {
  const v = value.trim()
  if (v.length < 6 || v.length > 160) return false
  if (/\s/.test(v)) return false
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v)
}

/** نشانی گیرندهٔ نتیجه (خالی = تنظیم نشده) */
export async function getNotifyEmail(): Promise<string> {
  const raw = await getSetting(NOTIFY_EMAIL_KEY)
  return (raw ?? '').trim()
}

/** ذخیرهٔ نشانی گیرندهٔ نتیجه — فقط همین یک کلید نوشته می‌شود */
export async function setNotifyEmail(value: string): Promise<void> {
  await setSetting(NOTIFY_EMAIL_KEY, value.trim())
}

/** خواندن نتیجهٔ آخرین ایمیل آزمایشی */
export async function getMailTest(): Promise<MailTestResult | null> {
  const raw = await getSetting(MAIL_TEST_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>
      if (typeof p.ok === 'boolean' && typeof p.at === 'string' && typeof p.detail === 'string') {
        return { ok: p.ok, at: p.at, detail: p.detail }
      }
    }
  } catch {
    /* مقدار نامعتبر → نادیده */
  }
  return null
}

/** ثبت نتیجهٔ آخرین ایمیل آزمایشی */
export async function setMailTest(result: MailTestResult): Promise<void> {
  await setSetting(MAIL_TEST_KEY, JSON.stringify(result))
}
