import { NextResponse } from 'next/server'
import { saveUpload } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogg'])
// سقف درخواست پلن Hobby ورکسل ≈ ۴.۵MB — یک حاشیهٔ امن می‌گذاریم
const MAX_BYTES = 4.5 * 1024 * 1024

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

/**
 * آپلود تصویر سؤال.
 * تصویر در دیتابیس ذخیره می‌شود (نه فایل‌سیستم — فایل‌سیستم ورکسل ماندگار نیست)
 * و از مسیر /api/uploads/:id سرو می‌شود.
 */
export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid form' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()

  // فایل ویدیویی از این مسیر آپلود نمی‌شود (سقف حجم و ماندگاری)
  if (VIDEO_EXT.has(ext) || (file.type ?? '').startsWith('video/')) {
    return NextResponse.json(
      { error: 'این فایل ویدیویی است — برای ویدیو، نوع سؤال را «ویدیویی» انتخاب کنید' },
      { status: 415 },
    )
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `حجم تصویر بیشتر از ۴.۵ مگابایت است (سقف درخواست Vercel) — تصویر را فشرده یا کوچک‌تر کنید (حجم فایل: ${(file.size / 1048576).toFixed(1)}MB)`,
      },
      { status: 413 },
    )
  }

  if (!ALLOWED.has(ext)) {
    return NextResponse.json({ error: 'unsupported type' }, { status: 415 })
  }

  const contentType =
    typeof file.type === 'string' && file.type.startsWith('image/') && file.type !== 'image/svg+xml'
      ? file.type
      : EXT_TO_MIME[ext] ?? 'image/jpeg'

  const buffer = Buffer.from(await file.arrayBuffer())
  const saved = await saveUpload(buffer.toString('base64'), contentType)

  return NextResponse.json({ ok: true, path: saved.path, bytes: buffer.length })
}
