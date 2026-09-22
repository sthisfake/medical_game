/* ------------------------------------------------------------------ */
/* «توضیح آموزشی» — یک قاعده در یک جا                                 */
/*                                                                     */
/* زمان نمایش توضیح را ادمین انتخاب می‌کند:                             */
/*  - always: از لحظهٔ نمایش سؤال (راهنما)                              */
/*  - after:  فقط بعد از پاسخ‌دادن — درست، نادرست یا اتمام زمان          */
/* ------------------------------------------------------------------ */

import type { ExplanationMode } from '../types'

/** پیش‌فرض = رفتار قدیمی (همیشه) تا دادهٔ موجود تغییر نکند */
export const DEFAULT_EXPLANATION_MODE: ExplanationMode = 'always'

/** ورودی نامطمئن (API یا دیتابیس) → یکی از دو حالت معتبر؛ ناشناخته = پیش‌فرض */
export function parseExplanationMode(raw: unknown): ExplanationMode {
  return raw === 'after' ? 'after' : DEFAULT_EXPLANATION_MODE
}

/**
 * آیا توضیح آموزشی همین حالا نمایش داده شود؟
 * متن خالی هرگز نمایش داده نمی‌شود؛ حالت «after» فقط بعد از بسته‌شدن سؤال.
 */
export function explanationVisible(
  explanation: string | undefined,
  mode: ExplanationMode | undefined,
  answered: boolean,
): boolean {
  if ((explanation ?? '').trim().length === 0) return false
  return mode === 'after' ? answered : true
}
