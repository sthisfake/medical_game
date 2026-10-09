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
/** حداکثر تعداد تصویر بازبینی — دو تصویر، کنار هم */
export const MAX_REVIEW_IMAGES = 2

/** جفت تصویرهای بازبینی، به همان ترتیبی که کنار هم نمایش داده می‌شوند */
export type ReviewImages = Pick<Stage, 'reviewImage' | 'reviewImage2'>

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

/**
 * تصویرهای پرشدهٔ بازبینی (۱ یا ۲ تصویر) — جای خالی حذف می‌شود تا اگر ادمین
 * فقط تصویر دوم را گذاشته باشد هم درست نمایش داده شود.
 */
export function stageReviewImages(stage: Partial<ReviewImages>): string[] {
  return [stage.reviewImage ?? '', stage.reviewImage2 ?? '']
    .map((src) => src.trim())
    .filter((src) => src !== '')
    .slice(0, MAX_REVIEW_IMAGES)
}

/** آیا این مرحله بازبینی دارد؟ بدون تصویر و متن، صفحهٔ بازبینی نمایش داده نمی‌شود */
export function stageHasReview(stage: Partial<ReviewImages> & Pick<Stage, 'reviewText'>): boolean {
  return stageReviewImages(stage).length > 0 || stage.reviewText.trim() !== ''
}
