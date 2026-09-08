const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** تبدیل ارقام لاتین به فارسی (مثلاً 15 → ۱۵) */
export const toFa = (value: number | string): string =>
  String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)])

/** نمایش درصد به فارسی */
export const faPercent = (ratio: number): string => `${toFa(Math.round(ratio * 100))}٪`
