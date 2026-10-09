/* ------------------------------------------------------------------ */
/* اعتبارسنجی ورودی مرحله — مشترک بین POST و PUT مرحله‌ها              */
/* ------------------------------------------------------------------ */

import type { StageInput } from '../types'
import { parseReviewSeconds, parseReviewText } from './review'

/**
 * بدنهٔ درخواست را به ورودی معتبر مرحله تبدیل می‌کند.
 * عنوان اجباری است؛ بقیهٔ فیلدها مقدار پیش‌فرض می‌گیرند.
 */
export function parseStageInput(body: unknown): StageInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  const icon = typeof b.icon === 'string' ? b.icon.trim() : '📘'
  const subtitle = typeof b.subtitle === 'string' ? b.subtitle.trim() : ''
  const order = typeof b.order === 'number' ? Math.round(b.order) : 0
  const passRatio = typeof b.passRatio === 'number' ? b.passRatio : 0.5
  if (!title) return null
  return {
    order,
    icon: icon || '📘',
    title,
    subtitle,
    passRatio,
    // بازبینی پایان مرحله — خالی یعنی این مرحله بازبینی ندارد
    reviewImage: typeof b.reviewImage === 'string' ? b.reviewImage.trim() : '',
    reviewImage2: typeof b.reviewImage2 === 'string' ? b.reviewImage2.trim() : '',
    reviewText: parseReviewText(b.reviewText),
    reviewSeconds: parseReviewSeconds(b.reviewSeconds),
  }
}
