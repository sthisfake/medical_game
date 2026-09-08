/* ------------------------------------------------------------------ */
/* خروجی‌گرفتن از دیتابیس محلی (SQLite) به فایل JSON                   */
/* کاربرد: ساخت محتوا به‌صورت محلی → سپس `npm run push:remote` برای    */
/* انتقال به Neon (روی Vercel)                                        */
/*                                                                     */
/*   node scripts/snapshot.mjs [خروجی.json]                            */
/* ------------------------------------------------------------------ */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dbPath = path.join(process.cwd(), 'data', 'game.db')
const outPath = path.resolve(process.argv[2] ?? path.join(process.cwd(), 'data', 'snapshot.json'))

if (!fs.existsSync(dbPath)) {
  console.error(`فایل دیتابیس محلی یافت نشد: ${dbPath}`)
  console.error('ابتدا برنامه را یک‌بار به‌صورت محلی اجرا کنید تا data/game.db ساخته شود.')
  process.exit(1)
}

const db = new DatabaseSync(dbPath)
const stages = db
  .prepare('SELECT id, "order", icon, title, subtitle, pass_ratio FROM stages ORDER BY "order", id')
  .all()
const uploads = db.prepare('SELECT id, data, content_type FROM uploads ORDER BY id').all()

const full = stages.map((st) => ({
  ...st,
  questions: db
    .prepare(
      `SELECT id, stage_id, prompt, explanation, image, image_width, image_height, zones,
              type, options, correct_index, video_url, sort
       FROM questions WHERE stage_id = ? ORDER BY sort, id`,
    )
    .all(st.id),
}))

const snapshot = {
  version: 1,
  exportedAt: new Date().toISOString(),
  stages: full,
  uploads,
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2))

const qCount = full.reduce((n, s) => n + s.questions.length, 0)
console.log(`خروجی گرفته شد: ${full.length} مرحله، ${qCount} سؤال، ${uploads.length} تصویر`)
console.log(`فایل: ${outPath}`)
