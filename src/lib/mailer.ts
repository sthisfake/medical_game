import { toFa } from './format'
import type { AnswerLogEntry, AnswerOutcome, ResultSubmission, StageStats } from '../types'

/* ------------------------------------------------------------------ */
/* فرستادن ایمیل با Brevo (فقط سمت سرور)                              */
/*                                                                     */
/* از fetch داخلی Node استفاده می‌کند؛ پس هیچ بستهٔ npm تازه‌ای لازم    */
/* نیست. کلید و نشانی فرستنده از متغیرهای محیطی خوانده می‌شوند:        */
/*   BREVO_API_KEY  — کلید API بریو                                   */
/*   MAIL_FROM      — نشانی فرستندهٔ تأییدشده در بریو                  */
/*   MAIL_FROM_NAME — نام فرستنده (اختیاری)                            */
/* ------------------------------------------------------------------ */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export interface MailConfig {
  apiKey: string
  from: string
  fromName: string
}

/** پیکربندی ایمیل از متغیرهای محیطی — null یعنی هنوز تنظیم نشده */
export function mailConfig(): MailConfig | null {
  const apiKey = (process.env.BREVO_API_KEY ?? '').trim()
  const from = (process.env.MAIL_FROM ?? '').trim()
  if (!apiKey || !from) return null
  const fromName = (process.env.MAIL_FROM_NAME ?? '').trim() || 'آزمون آناتومی صورت'
  return { apiKey, from, fromName }
}

/** آیا ارسال ایمیل روی سرور پیکربندی شده است */
export function isMailConfigured(): boolean {
  return mailConfig() !== null
}

export interface SendOutcome {
  sent: boolean
  reason?: string
}

/* --------------------------- قالب‌بندی ---------------------------- */

/** فرار دادن متن برای قرارگرفتن امن داخل HTML (نام کاربر ورودی آزاد است) */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const OUTCOME_LABEL: Record<AnswerOutcome, string> = {
  first: 'درست — تلاش اول',
  second: 'درست — تلاش دوم',
  wrong: 'نادرست',
  timeout: 'بی‌پاسخ (اتمام زمان)',
}

const OUTCOME_COLOR: Record<AnswerOutcome, string> = {
  first: '#0f766e',
  second: '#b45309',
  wrong: '#b91c1c',
  timeout: '#6b7280',
}

/** درصد درستِ تلاش اول */
export function scorePercent(overall: StageStats): number {
  return overall.total > 0 ? Math.round((overall.firstTryCorrect / overall.total) * 100) : 0
}

/** تاریخ و ساعت به وقت تهران با تقویم شمسی */
export function formatTehranTime(iso: string): string {
  const parsed = new Date(iso)
  const when = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(when)
  } catch {
    // اگر تقویم شمسی در دسترس نبود، دست‌کم زمان درست را نشان بده
    return when.toISOString()
  }
}

/* ------------------------- ساخت متن ایمیل ------------------------- */

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

/** ساخت ایمیل کارنامه — خروجی خالص و قابل آزمون است */
export function buildResultEmail(sub: ResultSubmission): BuiltEmail {
  const name = `${sub.student.firstName} ${sub.student.lastName}`.trim()
  const percent = scorePercent(sub.overall)
  const when = formatTehranTime(sub.finishedAt)

  const subject = `نتیجهٔ آزمون آناتومی صورت — ${name}`

  const th = (label: string) =>
    `<th style="padding:8px 10px;border:1px solid #d8dde3;background:#f3f5f7;text-align:right;font-size:12px;color:#374151;white-space:nowrap">${label}</th>`
  const td = (value: string, extra = '') =>
    `<td style="padding:8px 10px;border:1px solid #e2e6ea;text-align:right;font-size:13px;color:#111827;${extra}">${value}</td>`

  const summaryRow = (label: string, value: string, color = '#111827') =>
    `<tr>${td(label, 'color:#4b5563;font-size:12px')}${td(value, `font-weight:700;color:${color}`)}</tr>`

  const stageRows = sub.stages
    .map(
      (s) =>
        `<tr>${td(toFa(s.order))}${td(esc(s.title))}${td(toFa(s.stats.total))}${td(
          toFa(s.stats.firstTryCorrect),
        )}${td(toFa(s.stats.secondTryCorrect))}${td(toFa(s.stats.mistakes))}${td(
          toFa(s.stats.timedOut),
        )}</tr>`,
    )
    .join('')

  const answerRows = sub.answers
    .map((a, i) => {
      const outcome = OUTCOME_LABEL[a.outcome] ?? a.outcome
      const color = OUTCOME_COLOR[a.outcome] ?? '#111827'
      return `<tr style="background:${i % 2 ? '#fafbfc' : '#ffffff'}">${td(toFa(i + 1))}${td(
        esc(a.prompt),
      )}${td(`<span style="color:${color};font-weight:700">${outcome}</span>`)}${td(
        toFa(a.attempts),
      )}</tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<body style="margin:0;padding:16px;background:#f3f5f7;font-family:Tahoma,'Segoe UI',Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e6ea;border-radius:10px;overflow:hidden">
    <div style="background:#0f766e;padding:16px 18px">
      <div style="color:#ffffff;font-size:15px;font-weight:700">کارنامهٔ آزمون آناتومی صورت</div>
      <div style="color:#d1fae5;font-size:12px;margin-top:4px">نتیجهٔ یک اجرای کامل آزمون</div>
    </div>

    <div style="padding:16px 18px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        ${summaryRow('نام و نام خانوادگی', esc(name))}
        ${summaryRow('زمان پایان آزمون', esc(when))}
        ${summaryRow(
          'امتیاز نهایی (درست در تلاش اول)',
          `${toFa(percent)}٪ — ${toFa(sub.overall.firstTryCorrect)} از ${toFa(sub.overall.total)}`,
          percent >= 50 ? '#0f766e' : '#b45309',
        )}
        ${summaryRow('درست در تلاش دوم', toFa(sub.overall.secondTryCorrect))}
        ${summaryRow('پاسخ نادرست', toFa(sub.overall.mistakes), '#b91c1c')}
        ${summaryRow('اتمام زمان', toFa(sub.overall.timedOut), '#6b7280')}
      </table>

      <div style="font-size:13px;font-weight:700;color:#111827;margin:0 0 8px">نتیجه به تفکیک مرحله</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
        <tr>${th('مرحله')}${th('عنوان')}${th('سؤال')}${th('تلاش اول')}${th('تلاش دوم')}${th('نادرست')}${th('اتمام زمان')}</tr>
        ${stageRows}
      </table>

      <div style="font-size:13px;font-weight:700;color:#111827;margin:0 0 8px">کارنامهٔ پاسخ‌ها</div>
      <table style="width:100%;border-collapse:collapse">
        <tr>${th('#')}${th('سؤال')}${th('نتیجه')}${th('تلاش')}</tr>
        ${answerRows || `<tr>${td('—', 'color:#6b7280')}</tr>`}
      </table>
    </div>

    <div style="padding:12px 18px;background:#f9fafb;border-top:1px solid #e2e6ea;color:#6b7280;font-size:11px">
      این ایمیل به‌صورت خودکار از سامانهٔ خودآزمایی آناتومی صورت فرستاده شده است.
    </div>
  </div>
</body>
</html>`

  const stageText = sub.stages
    .map(
      (s) =>
        `  ${toFa(s.order)}. ${s.title} — سؤال: ${toFa(s.stats.total)}، تلاش اول: ${toFa(
          s.stats.firstTryCorrect,
        )}، تلاش دوم: ${toFa(s.stats.secondTryCorrect)}، نادرست: ${toFa(
          s.stats.mistakes,
        )}، اتمام زمان: ${toFa(s.stats.timedOut)}`,
    )
    .join('\n')

  const answerText = sub.answers
    .map(
      (a: AnswerLogEntry, i: number) =>
        `  ${toFa(i + 1)}. ${a.prompt} → ${OUTCOME_LABEL[a.outcome] ?? a.outcome} (تلاش: ${toFa(
          a.attempts,
        )})`,
    )
    .join('\n')

  const text = `کارنامهٔ آزمون آناتومی صورت
نام و نام خانوادگی: ${name}
زمان پایان آزمون: ${when}

امتیاز نهایی (درست در تلاش اول): ${toFa(percent)}٪ — ${toFa(
    sub.overall.firstTryCorrect,
  )} از ${toFa(sub.overall.total)}
درست در تلاش دوم: ${toFa(sub.overall.secondTryCorrect)}
پاسخ نادرست: ${toFa(sub.overall.mistakes)}
اتمام زمان: ${toFa(sub.overall.timedOut)}

نتیجه به تفکیک مرحله:
${stageText}

کارنامهٔ پاسخ‌ها:
${answerText}
`

  return { subject, html, text }
}

/* ---------------------------- ارسال ------------------------------- */

interface BrevoResult {
  ok: boolean
  status?: number
  detail?: string
}

async function postToBrevo(
  cfg: MailConfig,
  payload: Record<string, unknown>,
): Promise<BrevoResult> {
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': cfg.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (res.ok) return { ok: true, status: res.status }
    const body = await res.text().catch(() => '')
    return { ok: false, status: res.status, detail: body.slice(0, 300) }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'خطای شبکه' }
  }
}

/** فرستادن یک ایمیل ساده — با یک تلاش دوباره در خطاهای گذرا */
async function deliver(
  cfg: MailConfig,
  mail: { to: string; subject: string; html: string; text: string },
): Promise<SendOutcome> {
  const payload = {
    sender: { email: cfg.from, name: cfg.fromName },
    to: [{ email: mail.to }],
    subject: mail.subject,
    htmlContent: mail.html,
    textContent: mail.text,
  }

  let result = await postToBrevo(cfg, payload)

  // خطاهای گذرا (شبکه یا ۵xx) یک‌بار دیگر تلاش می‌شوند؛ ۴xx یعنی پیکربندی ایراد دارد
  const transient = !result.ok && (result.status === undefined || result.status >= 500)
  if (transient) {
    await new Promise((r) => setTimeout(r, 600))
    result = await postToBrevo(cfg, payload)
  }

  if (result.ok) return { sent: true }
  return {
    sent: false,
    reason: result.status ? `brevo-${result.status}: ${result.detail ?? ''}`.trim() : (result.detail ?? 'خطای نامشخص'),
  }
}

/** فرستادن کارنامهٔ پایان آزمون به نشانی مدیر */
export async function sendResultEmail(
  sub: ResultSubmission,
  to: string,
): Promise<SendOutcome> {
  if (!to.trim() || !to.includes('@')) return { sent: false, reason: 'no-recipient' }
  const cfg = mailConfig()
  if (!cfg) return { sent: false, reason: 'not-configured' }
  const { subject, html, text } = buildResultEmail(sub)
  return deliver(cfg, { to: to.trim(), subject, html, text })
}

/** فرستادن ایمیل آزمایشی از پنل مدیریت */
export async function sendTestEmail(to: string): Promise<SendOutcome> {
  if (!to.trim() || !to.includes('@')) return { sent: false, reason: 'no-recipient' }
  const cfg = mailConfig()
  if (!cfg) return { sent: false, reason: 'not-configured' }

  const html = `<!doctype html>
<html lang="fa" dir="rtl"><body style="margin:0;padding:16px;background:#f3f5f7;font-family:Tahoma,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e6ea;border-radius:10px;padding:18px">
    <div style="font-size:15px;font-weight:700;color:#0f766e">ایمیل آزمایشی</div>
    <p style="font-size:13px;color:#111827;line-height:1.9">
      اگر این پیام را می‌بینید، ارسال ایمیل درست پیکربندی شده است و کارنامهٔ پایان آزمون
      به همین نشانی فرستاده می‌شود.
    </p>
  </div>
</body></html>`

  return deliver(cfg, {
    to: to.trim(),
    subject: 'آزمون آناتومی صورت — ایمیل آزمایشی',
    html,
    text: 'ایمیل آزمایشی: ارسال ایمیل درست پیکربندی شده است.',
  })
}
