/* ------------------------------------------------------------------ */
/* برچسب‌های روی تصویر — اعتبارسنجی و تبدیل در یک جا                    */
/*                                                                     */
/* هر برچسب: متن + نقطهٔ «نرمال» (۰..۱ نسبت به عرض/ارتفاع تصویر)       */
/* همان قاعدهٔ ناحیه‌های پاسخ، تا روی هر اندازهٔ صفحه دقیق بماند.        */
/* ------------------------------------------------------------------ */

import type { ImageLabel } from '../types'

export const MAX_LABELS = 12
export const MAX_LABEL_LENGTH = 60

/** گرد کردن تا ۴ رقم — مختصات نرمال، برای حجم کمتر در دیتابیس */
function norm(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(Math.min(Math.max(0, n), 1) * 10000) / 10000
}

/**
 * ورودی نامطمئن (از API یا از دیتابیس) → فهرست برچسب‌های سالم.
 * متن‌های خالی حذف می‌شوند و مختصات به بازهٔ ۰..۱ محدود می‌شوند.
 */
export function sanitizeLabels(input: unknown): ImageLabel[] {
  if (!Array.isArray(input)) return []
  const out: ImageLabel[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const text = typeof rec.text === 'string' ? rec.text.trim() : ''
    if (!text) continue
    const x = norm(rec.x)
    const y = norm(rec.y)
    if (x === null || y === null) continue
    out.push({ text: text.slice(0, MAX_LABEL_LENGTH), x, y })
    if (out.length >= MAX_LABELS) break
  }
  return out
}

/**
 * خواندن از دیتابیس (ستون TEXT با JSON).
 * ممکن است مقدار یک یا دو بار کدگذاری شده باشد (باگ قدیمی اسکریپت انتقال داده).
 */
export function parseLabels(raw: unknown): ImageLabel[] {
  if (Array.isArray(raw)) return sanitizeLabels(raw)
  if (typeof raw !== 'string') return []
  let value: unknown = raw
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      value = JSON.parse(value as string)
    } catch {
      return []
    }
    if (Array.isArray(value)) return sanitizeLabels(value)
    if (typeof value !== 'string') return []
  }
  return []
}

/** نوشتن در دیتابیس — همیشه یک رشتهٔ JSON تمیز */
export function serializeLabels(labels: ImageLabel[] | undefined): string {
  return JSON.stringify(sanitizeLabels(labels ?? []))
}
