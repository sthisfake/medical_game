import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogg'])

/**
 * فهرست ویدیوهای داخل پوشهٔ پروژه (public/videos) برای انتخاب در پنل مدیریت.
 * این فایل‌ها همراه برنامه در git/Vercel استقرار می‌یابند و از مسیر
 * /videos/... سرو می‌شوند.
 */
export async function GET() {
  const dir = path.join(process.cwd(), 'public', 'videos')
  let entries: string[] = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    entries = []
  }

  const videos = entries
    .filter((name) => VIDEO_EXT.has(path.extname(name).toLowerCase()))
    .sort()
    .map((name) => {
      let size = 0
      try {
        size = fs.statSync(path.join(dir, name)).size
      } catch {
        /* ignore */
      }
      return { name, url: `/videos/${name}`, size }
    })

  return NextResponse.json({ videos })
}

/** حداکثر حجم ویدیو در آپلودِ محلی */
const MAX_VIDEO_BYTES = 200 * 1024 * 1024

function sanitizeName(name: string): string {
  const base = name.replace(/[^\w.-]+/g, '-').replace(/^-+/, '')
  const ext = path.extname(base).toLowerCase()
  const stem = path.basename(base, path.extname(base)) || 'video'
  return `${stem}${ext}`
}

function uniqueName(dir: string, name: string): string {
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  let candidate = name
  let i = 1
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem}-${i}${ext}`
    i += 1
  }
  return candidate
}

/**
 * آپلود ویدیو به پوشهٔ پروژه (public/videos) — فقط در اجرای محلی.
 * روی Vercel فایل‌سیستم فقط‌خواندنی/موقتی است، پس صریح خطا می‌دهیم تا
 * کاربر فایل را در ریپازیتوری بگذارد و push کند.
 */
export async function POST(request: Request) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error:
          'آپلود ویدیو فقط در اجرای محلی ممکن است؛ روی Vercel فایل‌سیستم ماندگار نیست. فایل را در پوشهٔ public/videos بگذارید و commit/push کنید.',
      },
      { status: 400 },
    )
  }

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

  const ext = path.extname(file.name).toLowerCase()
  if (!VIDEO_EXT.has(ext)) {
    return NextResponse.json(
      { error: 'فرمت ویدیو پشتیبانی نمی‌شود (mp4/webm/mov/m4v/ogg)' },
      { status: 415 },
    )
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 })
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `حجم ویدیو بیشتر از ۲۰۰ مگابایت است (${(file.size / 1048576).toFixed(1)}MB)` },
      { status: 413 },
    )
  }

  const dir = path.join(process.cwd(), 'public', 'videos')
  fs.mkdirSync(dir, { recursive: true })
  const name = uniqueName(dir, sanitizeName(file.name))
  fs.writeFileSync(path.join(dir, name), Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ ok: true, name, url: `/videos/${name}` })
}
