import type { ImageText } from '../types'

export const MAX_IMAGE_TEXTS = 12
export const MAX_IMAGE_TEXT_LENGTH = 80

function normalizedCoordinate(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return null
  return Math.round(Math.min(Math.max(0, number), 1) * 10000) / 10000
}

/** ورودی API/دیتابیس را به متن‌های ثابت سالم با مختصات نرمال تبدیل می‌کند. */
export function sanitizeImageTexts(input: unknown): ImageText[] {
  if (!Array.isArray(input)) return []
  const output: ImageText[] = []

  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (!text) continue
    const x = normalizedCoordinate(record.x)
    const y = normalizedCoordinate(record.y)
    if (x === null || y === null) continue

    output.push({
      text: text.slice(0, MAX_IMAGE_TEXT_LENGTH),
      x,
      y,
      color: record.color === 'white' ? 'white' : 'black',
    })
    if (output.length >= MAX_IMAGE_TEXTS) break
  }

  return output
}

/** خواندن JSON؛ دادهٔ غایب یا قدیمی بدون این قابلیت به آرایهٔ خالی تبدیل می‌شود. */
export function parseImageTexts(raw: unknown): ImageText[] {
  if (Array.isArray(raw)) return sanitizeImageTexts(raw)
  if (typeof raw !== 'string') return []
  let value: unknown = raw
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      value = JSON.parse(value as string)
    } catch {
      return []
    }
    if (Array.isArray(value)) return sanitizeImageTexts(value)
    if (typeof value !== 'string') return []
  }
  return []
}

export function serializeImageTexts(texts: ImageText[] | undefined): string {
  return JSON.stringify(sanitizeImageTexts(texts ?? []))
}
