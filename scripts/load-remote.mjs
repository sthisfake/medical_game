/* ------------------------------------------------------------------ */
/* انتقال محتوای snapshot به PostgreSQL (Neon) — ماندگار روی Vercel   */
/*                                                                     */
/*   DATABASE_URL=… node scripts/load-remote.mjs [snapshot.json] [--force] */
/*                                                                     */
/* اگر دیتابیس مقصد خالی نباشد بدون --force متوقف می‌شود.              */
/* ------------------------------------------------------------------ */
import fs from 'node:fs'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('خطا: متغیر محیطی DATABASE_URL (رشتهٔ اتصال Neon) تنظیم نشده است.')
  console.error('مثال:  DATABASE_URL=postgresql://… node scripts/load-remote.mjs')
  process.exit(1)
}

const force = process.argv.includes('--force')
const inPath = path.resolve(
  process.argv.find((a) => a.endsWith('.json') && !a.startsWith('-')) ??
    path.join(process.cwd(), 'data', 'snapshot.json'),
)

if (!fs.existsSync(inPath)) {
  console.error(`فایل snapshot یافت نشد: ${inPath}`)
  console.error('اول با `npm run snapshot` از دیتابیس محلی خروجی بگیرید.')
  process.exit(1)
}

const snap = JSON.parse(fs.readFileSync(inPath, 'utf8'))
const sql = neon(DATABASE_URL)
const q = (text, params = []) => sql.query(text, params)

const DDL = [
  `CREATE TABLE IF NOT EXISTS stages (
     id         BIGSERIAL PRIMARY KEY,
     "order"    INTEGER NOT NULL DEFAULT 1,
     icon       TEXT    NOT NULL DEFAULT '📘',
     title      TEXT    NOT NULL,
     subtitle   TEXT    NOT NULL DEFAULT '',
     pass_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.5
   )`,
  `CREATE TABLE IF NOT EXISTS questions (
     id           BIGSERIAL PRIMARY KEY,
     stage_id     BIGINT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
     prompt       TEXT   NOT NULL,
     explanation  TEXT   NOT NULL DEFAULT '',
     image        TEXT   NOT NULL DEFAULT '',
     image_width  INTEGER NOT NULL DEFAULT 0,
     image_height INTEGER NOT NULL DEFAULT 0,
     zones        TEXT   NOT NULL DEFAULT '[]',
     type         TEXT   NOT NULL DEFAULT 'image',
     options      TEXT   NOT NULL DEFAULT '[]',
     correct_index INTEGER NOT NULL DEFAULT -1,
     video_url    TEXT   NOT NULL DEFAULT '',
     sort         INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS uploads (
     id           BIGSERIAL PRIMARY KEY,
     data         TEXT NOT NULL,
     content_type TEXT NOT NULL DEFAULT 'image/jpeg',
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
]

try {
  await q('BEGIN')
  for (const ddl of DDL) await q(ddl)
  // ارتقای دیتابیس‌های قدیمی
  for (const alter of [
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'image'`,
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS options TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_index INTEGER NOT NULL DEFAULT -1`,
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS video_url TEXT NOT NULL DEFAULT ''`,
  ]) {
    try {
      await q(alter)
    } catch {
      /* از قبل وجود دارد */
    }
  }

  const existing = await q('SELECT COUNT(*) AS n FROM stages')
  if (Number(existing[0].n) > 0) {
    if (!force) {
      await q('ROLLBACK')
      console.error('دیتابیس مقصد از قبل داده دارد. برای جایگزینی کامل از --force استفاده کنید.')
      process.exit(1)
    }
    await q('TRUNCATE uploads, questions, stages, meta RESTART IDENTITY CASCADE')
  }

  // تصویرها اول؛ مسیرشان را دوباره به شناسه‌های جدید نگاشت می‌کنیم
  const imageMap = new Map()
  for (const u of snap.uploads ?? []) {
    const ins = await q(
      'INSERT INTO uploads (data, content_type) VALUES ($1, $2) RETURNING id',
      [u.data, u.content_type],
    )
    imageMap.set(Number(u.id), `/api/uploads/${Number(ins[0].id)}`)
  }

  let qCount = 0
  for (const st of snap.stages ?? []) {
    const ins = await q(
      `INSERT INTO stages ("order", icon, title, subtitle, pass_ratio)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [st.order, st.icon, st.title, st.subtitle ?? '', st.pass_ratio ?? 0.5],
    )
    const stageId = Number(ins[0].id)
    for (const qq of st.questions ?? []) {
      const m = /\/api\/uploads\/(\d+)/.exec(qq.image ?? '')
      const image = m && imageMap.has(Number(m[1])) ? imageMap.get(Number(m[1])) : qq.image
      // در فایل خروجی، options به‌صورت رشتهٔ JSON ذخیره شده است → دوباره کدگذاری نکن
      const optionsJson =
        typeof qq.options === 'string' ? qq.options : JSON.stringify(qq.options ?? [])
      await q(
        `INSERT INTO questions
           (stage_id, prompt, explanation, image, image_width, image_height, zones,
            type, options, correct_index, video_url, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          stageId,
          qq.prompt,
          qq.explanation ?? '',
          image ?? '',
          qq.image_width ?? 0,
          qq.image_height ?? 0,
          typeof qq.zones === 'string' ? qq.zones : JSON.stringify(qq.zones ?? []),
          qq.type ?? 'image',
          optionsJson,
          qq.correct_index ?? -1,
          qq.video_url ?? '',
          qq.sort ?? 0,
        ],
      )
      qCount += 1
    }
  }

  // بازبینی: سؤال‌های گزینه‌ای/ویدیویی باید گزینه داشته باشند
  const broken = await q(
    `SELECT COUNT(*) AS n FROM questions
     WHERE type IN ('mcq', 'video') AND (options IS NULL OR options = '[]' OR options = '""')`,
  )
  const brokenCount = Number(broken[0].n)

  await q("INSERT INTO meta (key, value) VALUES ('seeded', '1') ON CONFLICT (key) DO UPDATE SET value = '1'")
  await q('COMMIT')

  const host = /@([^/:]+)/.exec(DATABASE_URL)?.[1] ?? DATABASE_URL.slice(0, 30)
  console.log(`انتقال انجام شد: ${snap.stages?.length ?? 0} مرحله، ${qCount} سؤال، ${snap.uploads?.length ?? 0} تصویر → ${host}`)
  if (brokenCount > 0) {
    console.error(
      `هشدار: ${brokenCount} سؤال گزینه‌ای/ویدیویی بدون گزینه در مقصد ثبت شد — ساختار options را بررسی کنید.`,
    )
    process.exit(1)
  }
  console.log('بازبینی: همهٔ سؤال‌های گزینه‌ای/ویدیویی گزینه دارند ✅')
} catch (e) {
  try {
    await q('ROLLBACK')
  } catch {
    /* ignore */
  }
  console.error('انتقال ناموفق:', e instanceof Error ? e.message : e)
  process.exit(1)
}
