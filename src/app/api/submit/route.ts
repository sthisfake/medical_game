import { NextResponse } from 'next/server'
import { listStages } from '@/lib/db'
import { sendResultEmail } from '@/lib/mailer'
import { getNotifyEmail, isValidEmail } from '@/lib/settings'
import type {
  AnswerLogEntry,
  AnswerOutcome,
  ResultSubmission,
  StageReport,
  StageStats,
} from '@/types'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/* دریافت کارنامهٔ پایان آزمون و فرستادن آن به ایمیل مدیر              */
/*                                                                     */
/* این تنها مسیر نوشتنیِ بدون ورود مدیر در برنامه است؛ پس:             */
/*  • فقط POST و فقط همین مسیر (در میان‌افزار باز شده است)             */
/*  • اعتبارسنجی سخت‌گیرانهٔ بدنه و سقف طول                          */
/*  • شناسهٔ سؤال‌ها باید واقعاً در دیتابیس وجود داشته باشند            */
/*  • محدودکنندهٔ نرخ ساده (بازدارنده، نه تضمین)                        */
/*  • هیچ داده‌ای ذخیره نمی‌شود؛ فقط ایمیل فرستاده می‌شود               */
/* ------------------------------------------------------------------ */

const OUTCOMES = new Set<string>(['first', 'second', 'wrong', 'timeout'])
const MAX_ANSWERS = 500
const MAX_STAGES = 50
const MAX_NAME = 60
const MAX_RUN_ID = 120
const MAX_PROMPT = 400

/* ---------------------- محدودکنندهٔ نرخ (ساده) ---------------------- */
/* روی Vercel هر instance حافظهٔ جداگانه دارد؛ این فقط یک بازدارنده است. */

const WINDOW_MS = 10 * 60 * 1000
/* سقف نسبتاً باز است تا یک کلاس/شبکهٔ اشتراکی (که همه یک IP دارند) نتیجهٔ
   کسی را از دست ندهد؛ در عوض جلوی اسکریپت‌های ساده را می‌گیرد. */
const MAX_PER_WINDOW = 30
const hits = new Map<string, number[]>()
const seenRuns = new Map<string, number>()

function prune(now: number): void {
  for (const [key, times] of hits) {
    const fresh = times.filter((t) => now - t < WINDOW_MS)
    if (fresh.length === 0) hits.delete(key)
    else hits.set(key, fresh)
  }
  for (const [runId, at] of seenRuns) {
    if (now - at > WINDOW_MS) seenRuns.delete(runId)
  }
}

function clientIp(request: Request): string {
  // روی Vercel سرصفحهٔ x-real-ip را خودِ پلتفرم می‌گذارد و قابل جعل نیست؛
  // x-forwarded-for تنها جایگزین است (اولین مقدار = نزدیک‌ترین کارخواه).
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  if (hits.size > 500 || seenRuns.size > 500) prune(now)
  const times = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  times.push(now)
  hits.set(ip, times)
  return times.length > MAX_PER_WINDOW
}

/* --------------------------- اعتبارسنجی ---------------------------- */

function nonNegInt(value: unknown, max = 100000): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > max) return null
  return Math.round(value)
}

function parseStats(raw: unknown): StageStats | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const total = nonNegInt(s.total)
  const firstTryCorrect = nonNegInt(s.firstTryCorrect)
  const secondTryCorrect = nonNegInt(s.secondTryCorrect)
  const mistakes = nonNegInt(s.mistakes)
  const timedOut = nonNegInt(s.timedOut)
  if (
    total === null ||
    firstTryCorrect === null ||
    secondTryCorrect === null ||
    mistakes === null ||
    timedOut === null
  ) {
    return null
  }
  return { total, firstTryCorrect, secondTryCorrect, mistakes, timedOut }
}

function parseStages(raw: unknown): StageReport[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_STAGES) return null
  const out: StageReport[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const s = item as Record<string, unknown>
    const order = nonNegInt(s.order, 1000)
    const title = typeof s.title === 'string' ? s.title.trim().slice(0, 200) : ''
    const stats = parseStats(s.stats)
    if (order === null || !title || !stats) return null
    out.push({ order, title, stats })
  }
  return out
}

function parseAnswers(raw: unknown): AnswerLogEntry[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ANSWERS) return null
  const out: AnswerLogEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const a = item as Record<string, unknown>
    const questionId = nonNegInt(a.questionId)
    const attempts = nonNegInt(a.attempts, 10)
    const prompt = typeof a.prompt === 'string' ? a.prompt.trim() : ''
    const outcome = typeof a.outcome === 'string' ? a.outcome : ''
    if (questionId === null || attempts === null) return null
    if (!OUTCOMES.has(outcome)) return null
    if (!prompt || prompt.length > MAX_PROMPT) return null
    out.push({
      questionId,
      prompt,
      outcome: outcome as AnswerOutcome,
      attempts,
    })
  }
  return out
}

/** بدنهٔ خام → کارنامه، یا پیام خطای فارسی */
function parseSubmission(body: unknown): ResultSubmission | string {
  if (!body || typeof body !== 'object') return 'بدنهٔ درخواست نامعتبر است.'
  const b = body as Record<string, unknown>

  const studentRaw = b.student
  if (!studentRaw || typeof studentRaw !== 'object') return 'نام و نام خانوادگی ارسال نشده است.'
  const student = studentRaw as Record<string, unknown>
  const firstName = typeof student.firstName === 'string' ? student.firstName.trim() : ''
  const lastName = typeof student.lastName === 'string' ? student.lastName.trim() : ''
  if (!firstName || firstName.length > MAX_NAME) return 'نام نامعتبر است.'
  if (!lastName || lastName.length > MAX_NAME) return 'نام خانوادگی نامعتبر است.'

  const runId = typeof b.runId === 'string' ? b.runId.trim() : ''
  if (!runId || runId.length > MAX_RUN_ID) return 'شناسهٔ اجرا نامعتبر است.'

  const overall = parseStats(b.overall)
  if (!overall) return 'آمار کلی نامعتبر است.'

  const stages = parseStages(b.stages ?? [])
  if (!stages) return 'آمار مرحله‌ها نامعتبر است.'

  const answers = parseAnswers(b.answers)
  if (!answers) return 'کارنامهٔ پاسخ‌ها نامعتبر است.'

  const finishedAt =
    typeof b.finishedAt === 'string' && !Number.isNaN(new Date(b.finishedAt).getTime())
      ? b.finishedAt
      : new Date().toISOString()

  return { student: { firstName, lastName }, runId, overall, stages, answers, finishedAt }
}

/* ------------------------------ مسیر ------------------------------- */

export async function POST(request: Request) {
  const ip = clientIp(request)
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, sent: false, reason: 'rate-limited' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, sent: false, reason: 'invalid', error: 'بدنهٔ درخواست نامعتبر است.' },
      { status: 400 },
    )
  }

  const parsed = parseSubmission(body)
  if (typeof parsed === 'string') {
    return NextResponse.json(
      { ok: false, sent: false, reason: 'invalid', error: parsed },
      { status: 400 },
    )
  }

  // شناسهٔ سؤال‌ها باید واقعاً وجود داشته باشند و تکراری نباشند
  const stages = await listStages()
  const known = new Set(stages.flatMap((s) => s.questions.map((q) => q.id)))
  const ids = new Set(parsed.answers.map((a) => a.questionId))
  if (ids.size !== parsed.answers.length) {
    return NextResponse.json(
      { ok: false, sent: false, reason: 'invalid', error: 'شناسهٔ سؤال تکراری است.' },
      { status: 400 },
    )
  }
  if ([...ids].some((id) => !known.has(id))) {
    return NextResponse.json(
      { ok: false, sent: false, reason: 'invalid', error: 'شناسهٔ سؤال ناشناخته است.' },
      { status: 400 },
    )
  }

  // جلوگیری از ارسال دوبارهٔ همان اجرا (مثلاً رندر دوباره یا تلاش مجدد کلاینت)
  if (seenRuns.has(parsed.runId)) {
    return NextResponse.json({ ok: true, sent: false, reason: 'duplicate' })
  }
  seenRuns.set(parsed.runId, Date.now())

  const to = await getNotifyEmail()
  if (!to || !isValidEmail(to)) {
    console.warn('[submit] کارنامه دریافت شد اما نشانی گیرندهٔ نتیجه تنظیم نشده است.')
    return NextResponse.json({ ok: true, sent: false, reason: 'no-recipient' })
  }

  const outcome = await sendResultEmail(parsed, to)
  if (!outcome.sent) {
    console.warn('[submit] ارسال ایمیل کارنامه ناموفق بود:', outcome.reason)
  }
  return NextResponse.json({ ok: true, sent: outcome.sent, reason: outcome.reason })
}
