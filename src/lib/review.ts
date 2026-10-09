/* ------------------------------------------------------------------ */
/* بازبینی پایان مرحله — قواعد مشترک بین پنل مدیریت، API و بازی        */
/*                                                                     */
/* بازبینی یک سؤال نیست: پایان هر مرحله (وقتی قبول شود) یک تصویر و یک  */
/* متن آموزشی نشان داده می‌شود و دانشجو می‌تواند بخواند یا رد کند.       */
/* ------------------------------------------------------------------ */

import type { Stage } from '../types'

/** مدت پیش‌فرض نمایش بازبینی — ۲ دقیقه */
export const DEFAULT_REVIEW_SECONDS = 120
export const MIN_REVIEW_SECONDS = 5
export const MAX_REVIEW_SECONDS = 900
/** سقف طول متن بازبینی — برای جلوگیری از ورودی‌های غیرمنتظره */
export const MAX_REVIEW_TEXT = 4000

/**
 * ثانیهٔ معتبر برای نمایش بازبینی.
 * خالی، نامعتبر یا غیرعددی → مقدار پیش‌فرض؛ عدد → گرد و محدود به بازه.
 */
export function parseReviewSeconds(raw: unknown): number {
  if (raw === null || raw === undefined) return DEFAULT_REVIEW_SECONDS
  if (typeof raw === 'string' && raw.trim() === '') return DEFAULT_REVIEW_SECONDS
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_REVIEW_SECONDS
  return Math.min(Math.max(MIN_REVIEW_SECONDS, Math.round(n)), MAX_REVIEW_SECONDS)
}

/** متن بازبینی: خط‌های ویندوزی یکسان‌سازی و طول محدود می‌شود */
export function parseReviewText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\r\n/g, '\n').trim().slice(0, MAX_REVIEW_TEXT)
}

/** آیا این مرحله بازبینی دارد؟ بدون تصویر و متن، صفحهٔ بازبینی نمایش داده نمی‌شود */
export function stageHasReview(stage: Pick<Stage, 'reviewImage' | 'reviewText'>): boolean {
  return Boolean(stage.reviewImage) || stage.reviewText.trim() !== ''
}
