/* ------------------------------------------------------------------ */
/* فشرده‌سازی تصویر در مرورگر پیش از آپلود (بدون وابستگی بیرونی)        */
/*                                                                     */
/* چرا: سقف درخواست Vercel حدود ۴.۵MB است و تصاویر در دیتابیس به‌صورت   */
/* base64 ذخیره می‌شوند (≈۳۳٪ حجم بیشتر). پس تصویر را در مرورگر         */
/* کوچک/فشرده می‌کنیم و بعد می‌فرستیم.                                 */
/* ------------------------------------------------------------------ */

/** حداکثر بُعد تصویر پس از کوچک‌سازی */
const MAX_DIMENSION = 1600
/** حجم هدف — زیر سقف ۴.۵MB با حاشیهٔ امن */
const TARGET_BYTES = 3.6 * 1024 * 1024
/** کیفیت‌های تلاش‌شده به ترتیب نزولی */
const QUALITIES = [0.85, 0.7, 0.55, 0.42]
/** این فرمت‌ها فشرده نمی‌شوند: متحرک یا برداری */
const NO_RESIZE_TYPES = new Set(['image/gif', 'image/svg+xml'])

export interface PreparedImage {
  /** فایل نهایی برای آپلود */
  blob: Blob
  fileName: string
  originalBytes: number
  finalBytes: number
  width: number
  height: number
  resized: boolean
  /** پیام کوتاه برای نمایش در پنل مدیریت */
  note: string
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

/** کوچک‌ترین کیفیتِ قابل قبول (زیر حجم هدف) را برمی‌گرداند، وگرنه null */
async function encodeUnderTarget(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const quality of QUALITIES) {
      const blob = await canvasToBlob(canvas, type, quality)
      if (!blob) continue
      // اگر مرورگر webp را پشتیبانی نکند، نوع خروجی jpeg می‌شود
      const usable = type === 'image/jpeg' || blob.type === 'image/webp'
      if (usable && blob.size <= TARGET_BYTES) return blob
    }
  }
  return null
}

/**
 * آماده‌سازی فایل تصویری برای آپلود:
 *  - کاهش بُعد تا MAX_DIMENSION
 *  - تبدیل به WebP (یا JPEG) با کیفیت کاهش‌یابنده تا زیر حجم هدف
 *  - در صورت خطا (مثلاً HEIC)، همان فایل اصلی برگردانده می‌شود
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const originalBytes = file.size
  const fallback: PreparedImage = {
    blob: file,
    fileName: file.name,
    originalBytes,
    finalBytes: originalBytes,
    width: 0,
    height: 0,
    resized: false,
    note: `${formatBytes(originalBytes)} — بدون فشرده‌سازی`,
  }

  if (NO_RESIZE_TYPES.has(file.type)) {
    return { ...fallback, note: `${formatBytes(originalBytes)} — این فرمت فشرده نمی‌شود` }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const sw = img.naturalWidth || img.width
    const sh = img.naturalHeight || img.height
    if (!sw || !sh) return fallback

    const scale = Math.min(1, MAX_DIMENSION / Math.max(sw, sh))
    let tw = Math.max(1, Math.round(sw * scale))
    let th = Math.max(1, Math.round(sh * scale))

    // تصویر کوچک و سبک: دست‌نخورده بماند
    if (scale === 1 && originalBytes <= TARGET_BYTES) {
      return {
        ...fallback,
        width: sw,
        height: sh,
        note: `${formatBytes(originalBytes)} — نیازی به فشرده‌سازی نبود`,
      }
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = tw
      canvas.height = th
      const ctx = canvas.getContext('2d')
      if (!ctx) break
      ctx.drawImage(img, 0, 0, tw, th)

      const blob = await encodeUnderTarget(canvas)
      if (blob) {
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
        return {
          blob,
          fileName: `${file.name.replace(/\.[^.]+$/, '')}.${ext}`,
          originalBytes,
          finalBytes: blob.size,
          width: tw,
          height: th,
          resized: true,
          note: `${formatBytes(originalBytes)} → ${formatBytes(blob.size)} · ${tw}×${th}`,
        }
      }

      // هنوز سنگین است: ابعاد را کوچک‌تر کن و دوباره تلاش کن
      tw = Math.max(1, Math.round(tw * 0.75))
      th = Math.max(1, Math.round(th * 0.75))
    }

    return fallback
  } catch {
    // فایل‌هایی که مرورگر نمی‌تواند رمزگشایی کند (مثل HEIC) — بدون تغییر فرستاده می‌شوند
    return fallback
  } finally {
    URL.revokeObjectURL(url)
  }
}
