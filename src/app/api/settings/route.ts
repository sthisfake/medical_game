import { NextResponse } from 'next/server'
import { isMailConfigured, sendTestEmail } from '@/lib/mailer'
import {
  getMailTest,
  getNotifyEmail,
  isValidEmail,
  setMailTest,
  setNotifyEmail,
} from '@/lib/settings'
import type { SettingsResponse } from '@/types'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/* تنظیمات اطلاع‌رسانی — فقط مدیر (میان‌افزار همهٔ روش‌ها را می‌بندد)   */
/*                                                                     */
/* خواندن و نوشتن فقط روی کلیدهای تنظیمات در جدول meta انجام می‌شود.    */
/* ------------------------------------------------------------------ */

async function snapshot(): Promise<SettingsResponse> {
  const [notifyEmail, lastTest] = await Promise.all([getNotifyEmail(), getMailTest()])
  return { notifyEmail, mailConfigured: isMailConfigured(), lastTest }
}

export async function GET() {
  return NextResponse.json(await snapshot())
}

/** ذخیرهٔ نشانی گیرندهٔ نتیجه */
export async function PUT(request: Request) {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 })
  }

  const raw = (body as Record<string, unknown>).notifyEmail
  const value = typeof raw === 'string' ? raw.trim() : ''
  // خالی گذاشتن یعنی «ارسال نشود»؛ مقدار ناتهی باید نشانی معتبر باشد
  if (value && !isValidEmail(value)) {
    return NextResponse.json({ error: 'نشانی ایمیل معتبر نیست.' }, { status: 400 })
  }
  if (value.length > 160) {
    return NextResponse.json({ error: 'نشانی ایمیل بیش از حد بلند است.' }, { status: 400 })
  }

  await setNotifyEmail(value)
  return NextResponse.json(await snapshot())
}

/** فرستادن ایمیل آزمایشی به نشانی ذخیره‌شده */
export async function POST() {
  const to = await getNotifyEmail()
  if (!to) {
    return NextResponse.json(
      { error: 'ابتدا نشانی ایمیل را ذخیره کنید.' },
      { status: 400 },
    )
  }

  const outcome = await sendTestEmail(to)
  await setMailTest({
    ok: outcome.sent,
    at: new Date().toISOString(),
    detail: outcome.sent ? 'ارسال شد' : (outcome.reason ?? 'خطای نامشخص'),
  })

  if (!outcome.sent) {
    const message =
      outcome.reason === 'not-configured'
        ? 'ارسال ایمیل روی سرور پیکربندی نشده است (BREVO_API_KEY و MAIL_FROM).'
        : `ارسال ناموفق بود: ${outcome.reason}`
    return NextResponse.json({ ...(await snapshot()), error: message }, { status: 502 })
  }

  return NextResponse.json(await snapshot())
}
