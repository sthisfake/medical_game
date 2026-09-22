import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AnswerZone, ExplanationMode, ImageLabel, Question, Stage } from '../types'
import { parseExplanationMode, DEFAULT_EXPLANATION_MODE } from './explanation'
import { demoImageBytes, demoStage, demoSkeletonStages } from './seed-content'
import { parseLabels, serializeLabels } from './labels'

/* ------------------------------------------------------------------ */
/* بک‌اند SQLite (محلی) — فقط وقتی DATABASE_URL تنظیم نشده استفاده می‌شود */
/* فایل دیتابیس: data/game.db                                          */
/* ------------------------------------------------------------------ */

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'game.db')

interface DbStageRow {
  id: number
  order: number
  icon: string
  title: string
  subtitle: string
  pass_ratio: number
}

interface DbQuestionRow {
  id: number
  stage_id: number
  prompt: string
  explanation: string
  explanation_mode: string
  image: string
  image_width: number
  image_height: number
  zones: string
  labels: string
  type: string
  options: string
  correct_index: number
  video_url: string
  sort: number
}

// سینگلتون برای جلوگیری از اتصال مجدد در hot-reload توسعه
const globalForDb = globalThis as unknown as { __gameDb?: DatabaseSync }

function openDb(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true })

  // پشتیبان خودکار روزانه — تا اگر دیتابیس پاک/بازنویسی شد، یک نسخه از روز موجود باشد
  if (fs.existsSync(DB_PATH)) {
    try {
      const now = new Date()
      const day =
        `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const backupDir = path.join(DATA_DIR, 'backups')
      fs.mkdirSync(backupDir, { recursive: true })
      const backupPath = path.join(backupDir, `game-${day}.db`)
      if (!fs.existsSync(backupPath)) fs.copyFileSync(DB_PATH, backupPath)
    } catch {
      /* پشتیبان‌گیری نباید اجرای برنامه را متوقف کند */
    }
  }

  const db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  // چند فرایند (مثلاً در حین build) ممکن است هم‌زمان باز شوند
  db.exec('PRAGMA busy_timeout = 8000;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS stages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      "order"    INTEGER NOT NULL DEFAULT 1,
      icon       TEXT    NOT NULL DEFAULT '📘',
      title      TEXT    NOT NULL,
      subtitle   TEXT    NOT NULL DEFAULT '',
      pass_ratio REAL    NOT NULL DEFAULT 0.5
    );

    CREATE TABLE IF NOT EXISTS questions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_id      INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      prompt        TEXT    NOT NULL,
      explanation   TEXT    NOT NULL DEFAULT '',
      explanation_mode TEXT NOT NULL DEFAULT 'always',
      image         TEXT    NOT NULL DEFAULT '',
      image_width   INTEGER NOT NULL DEFAULT 0,
      image_height  INTEGER NOT NULL DEFAULT 0,
      zones         TEXT    NOT NULL DEFAULT '[]',
      labels        TEXT    NOT NULL DEFAULT '[]',
      type          TEXT    NOT NULL DEFAULT 'image',
      options       TEXT    NOT NULL DEFAULT '[]',
      correct_index INTEGER NOT NULL DEFAULT -1,
      video_url     TEXT    NOT NULL DEFAULT '',
      sort          INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      data         TEXT    NOT NULL, -- تصویر به‌صورت base64
      content_type TEXT    NOT NULL DEFAULT 'image/jpeg',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // ارتقای دیتابیس‌های قدیمی: ستون‌های انواع جدید سؤال
  const qCols = db.prepare('PRAGMA table_info(questions)').all() as unknown as { name: string }[]
  const hasCol = (name: string) => qCols.some((c) => c.name === name)
  if (!hasCol('type')) db.exec(`ALTER TABLE questions ADD COLUMN type TEXT NOT NULL DEFAULT 'image'`)
  if (!hasCol('options')) db.exec(`ALTER TABLE questions ADD COLUMN options TEXT NOT NULL DEFAULT '[]'`)
  if (!hasCol('correct_index'))
    db.exec(`ALTER TABLE questions ADD COLUMN correct_index INTEGER NOT NULL DEFAULT -1`)
  if (!hasCol('video_url')) db.exec(`ALTER TABLE questions ADD COLUMN video_url TEXT NOT NULL DEFAULT ''`)
  if (!hasCol('labels')) db.exec(`ALTER TABLE questions ADD COLUMN labels TEXT NOT NULL DEFAULT '[]'`)
  if (!hasCol('explanation_mode'))
    db.exec(`ALTER TABLE questions ADD COLUMN explanation_mode TEXT NOT NULL DEFAULT 'always'`)

  return db
}

export const db = globalForDb.__gameDb ??= openDb()

/* ------------------------------------------------------------------ */
/* نگاشت ردیف → شیء                                                  */
/* ------------------------------------------------------------------ */

function parseZones(raw: string): AnswerZone[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as AnswerZone[]
  } catch {
    return []
  }
}

function parseOptions(raw: string): string[] {
  // ممکن است مقدار یک یا دو بار کدگذاری شده باشد (باگ قدیمی اسکریپت انتقال داده)
  let value: unknown = raw
  for (let depth = 0; depth < 2; depth += 1) {
    if (typeof value !== 'string') break
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
    if (Array.isArray(value)) return value.filter((o): o is string => typeof o === 'string')
  }
  return []
}

function rowToQuestion(row: DbQuestionRow): Question {
  return {
    id: row.id,
    stageId: row.stage_id,
    prompt: row.prompt,
    explanation: row.explanation,
    explanationMode: parseExplanationMode(row.explanation_mode),
    image: row.image,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    zones: parseZones(row.zones),
    labels: parseLabels(row.labels),
    type: row.type === 'mcq' || row.type === 'video' ? row.type : 'image',
    options: parseOptions(row.options),
    correctIndex: Number(row.correct_index ?? -1),
    videoUrl: row.video_url ?? '',
  }
}

function rowToStage(row: DbStageRow): Omit<Stage, 'questions'> {
  return {
    id: row.id,
    order: row.order,
    icon: row.icon,
    title: row.title,
    subtitle: row.subtitle,
    passRatio: row.pass_ratio,
  }
}

/* ------------------------------------------------------------------ */
/* کوئری‌ها                                                           */
/* ------------------------------------------------------------------ */

export function listStages(): Stage[] {
  const stageRows = db.prepare('SELECT * FROM stages ORDER BY "order", id').all() as unknown as DbStageRow[]
  return stageRows.map((sr) => {
    const qRows = db
      .prepare('SELECT * FROM questions WHERE stage_id = ? ORDER BY sort, id')
      .all(sr.id) as unknown as DbQuestionRow[]
    return { ...rowToStage(sr), questions: qRows.map(rowToQuestion) }
  })
}

export function getStage(stageId: number): Stage | null {
  const sr = db.prepare('SELECT * FROM stages WHERE id = ?').get(stageId) as unknown as
    | DbStageRow
    | undefined
  if (!sr) return null
  const qRows = db
    .prepare('SELECT * FROM questions WHERE stage_id = ? ORDER BY sort, id')
    .all(sr.id) as unknown as DbQuestionRow[]
  return { ...rowToStage(sr), questions: qRows.map(rowToQuestion) }
}

export function getQuestion(questionId: number): Question | null {
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId) as unknown as
    | DbQuestionRow
    | undefined
  return row ? rowToQuestion(row) : null
}

export function createStage(input: {
  order: number
  icon: string
  title: string
  subtitle: string
  passRatio: number
}): number {
  const res = db
    .prepare(
      'INSERT INTO stages ("order", icon, title, subtitle, pass_ratio) VALUES (?, ?, ?, ?, ?)',
    )
    .run(input.order, input.icon, input.title, input.subtitle, input.passRatio)
  return Number(res.lastInsertRowid)
}

export function updateStage(
  stageId: number,
  input: { order: number; icon: string; title: string; subtitle: string; passRatio: number },
): void {
  db.prepare(
    'UPDATE stages SET "order" = ?, icon = ?, title = ?, subtitle = ?, pass_ratio = ? WHERE id = ?',
  ).run(input.order, input.icon, input.title, input.subtitle, input.passRatio, stageId)
}

export function deleteStage(stageId: number): void {
  const questions = db
    .prepare('SELECT image FROM questions WHERE stage_id = ?')
    .all(stageId) as unknown as { image: string }[]
  db.prepare('DELETE FROM stages WHERE id = ?').run(stageId)
  for (const q of questions) deleteUploadedImage(q.image)
}

export function createQuestion(input: {
  stageId: number
  prompt: string
  explanation: string
  explanationMode?: ExplanationMode
  image: string
  imageWidth: number
  imageHeight: number
  zones: AnswerZone[]
  labels?: ImageLabel[]
  type?: Question['type']
  options?: string[]
  correctIndex?: number
  videoUrl?: string
  sort?: number
}): number {
  const res = db
    .prepare(
      `INSERT INTO questions
         (stage_id, prompt, explanation, explanation_mode, image, image_width, image_height,
          zones, labels, type, options, correct_index, video_url, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.stageId,
      input.prompt,
      input.explanation,
      input.explanationMode ?? DEFAULT_EXPLANATION_MODE,
      input.image,
      input.imageWidth,
      input.imageHeight,
      JSON.stringify(input.zones),
      serializeLabels(input.labels),
      input.type ?? 'image',
      JSON.stringify(input.options ?? []),
      input.correctIndex ?? -1,
      input.videoUrl ?? '',
      input.sort ?? 0,
    )
  return Number(res.lastInsertRowid)
}

export function updateQuestion(
  questionId: number,
  input: {
    stageId: number
    prompt: string
    explanation: string
    explanationMode?: ExplanationMode
    image: string
    imageWidth: number
    imageHeight: number
    zones: AnswerZone[]
    labels?: ImageLabel[]
    type?: Question['type']
    options?: string[]
    correctIndex?: number
    videoUrl?: string
  },
  prev: Question | null,
): void {
  if (prev && prev.image !== input.image) deleteUploadedImage(prev.image)
  db.prepare(
    `UPDATE questions
     SET stage_id = ?, prompt = ?, explanation = ?, explanation_mode = ?, image = ?,
         image_width = ?, image_height = ?, zones = ?, labels = ?,
         type = ?, options = ?, correct_index = ?, video_url = ?
     WHERE id = ?`,
  ).run(
    input.stageId,
    input.prompt,
    input.explanation,
    input.explanationMode ?? DEFAULT_EXPLANATION_MODE,
    input.image,
    input.imageWidth,
    input.imageHeight,
    JSON.stringify(input.zones),
    serializeLabels(input.labels),
    input.type ?? 'image',
    JSON.stringify(input.options ?? []),
    input.correctIndex ?? -1,
    input.videoUrl ?? '',
    questionId,
  )
}

export function deleteQuestion(questionId: number): void {
  const row = db.prepare('SELECT image FROM questions WHERE id = ?').get(questionId) as unknown as
    | { image: string }
    | undefined
  if (!row) return
  db.prepare('DELETE FROM questions WHERE id = ?').run(questionId)
  deleteUploadedImage(row.image)
}

/* ------------------------------------------------------------------ */
/* تصویر — در خودِ دیتابیس ذخیره می‌شود (روی Vercel فایل‌سیستم ماندگار  */
/* نیست) و از مسیر /api/uploads/:id سرو می‌شود                        */
/* ------------------------------------------------------------------ */

export interface StoredUpload {
  id: number
  /** base64 */
  data: string
  contentType: string
}

export interface SavedUpload extends StoredUpload {
  path: string
}

export function parseUploadId(imagePath: string): number | null {
  const m = /^\/api\/uploads\/(\d+)$/.exec(imagePath)
  return m ? Number(m[1]) : null
}

/** آپلودهای مربوط به یک مسیر تصویر را از دیتابیس حذف می‌کند */
export function deleteUploadedImage(imagePath: string): void {
  const id = parseUploadId(imagePath)
  if (id === null) return
  db.prepare('DELETE FROM uploads WHERE id = ?').run(id)
}

export function saveUpload(dataBase64: string, contentType: string): SavedUpload {
  const res = db
    .prepare('INSERT INTO uploads (data, content_type) VALUES (?, ?)')
    .run(dataBase64, contentType)
  const id = Number(res.lastInsertRowid)
  return { id, data: dataBase64, contentType, path: `/api/uploads/${id}` }
}

export function getUpload(uploadId: number): StoredUpload | null {
  const row = db
    .prepare('SELECT id, data, content_type FROM uploads WHERE id = ?')
    .get(uploadId) as unknown as { id: number; data: string; content_type: string } | undefined
  return row ? { id: row.id, data: row.data, contentType: row.content_type } : null
}

/* ------------------------------------------------------------------ */
/* دادهٔ نمونه (seed) — فقط بار اول، وقتی دیتابیس خالی است            */
/* ------------------------------------------------------------------ */

const SEED_LOCK = path.join(DATA_DIR, 'seed.lock')

/** خوابِ هم‌زمانِ کوتاه (بدون async) */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** قفل انحصاری seed بین چند فرایند (مثلاً workerهای build) */
function tryLockSeed(): boolean {
  for (let i = 0; i < 60; i++) {
    try {
      fs.writeFileSync(SEED_LOCK, '', { flag: 'wx' })
      return true
    } catch {
      sleepSync(250)
    }
  }
  return false
}

function seedIfEmpty(): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM stages').get() as unknown as { n: number }
  if (n > 0) return

  if (!tryLockSeed()) return // فرایند دیگری در حال seed کردن است
  try {
    const again = db.prepare('SELECT COUNT(*) AS n FROM stages').get() as unknown as { n: number }
    if (again.n > 0) return
    runSeed()
  } finally {
    try {
      fs.unlinkSync(SEED_LOCK)
    } catch {
      /* ignore */
    }
  }
}

function runSeed(): void {
  db.exec('BEGIN')
  try {
    const saved = saveUpload(demoImageBytes().toString('base64'), 'image/svg+xml')
    const IMAGE = saved.path

    const stage1 = createStage({
      order: demoStage.order,
      icon: demoStage.icon,
      title: demoStage.title,
      subtitle: demoStage.subtitle,
      passRatio: demoStage.passRatio,
    })

    for (const dq of demoStage.questions) {
      createQuestion({
        stageId: stage1,
        prompt: dq.prompt,
        explanation: dq.explanation,
        image: dq.type === 'image' || !dq.type ? IMAGE : '',
        imageWidth: dq.type === 'image' || !dq.type ? 300 : 0,
        imageHeight: dq.type === 'image' || !dq.type ? 360 : 0,
        zones: dq.zones,
        labels: dq.labels,
        type: dq.type ?? 'image',
        options: dq.options,
        correctIndex: dq.correctIndex,
        videoUrl: dq.videoUrl,
      })
    }

    // اسکلت مراحل بعدی — مدیریت از پنل ادمین پر/ویرایش می‌شوند
    for (const s of demoSkeletonStages) {
      createStage({ order: s.order, icon: s.icon, title: s.title, subtitle: '', passRatio: 0.5 })
    }

    db.exec('COMMIT')
  } catch (e) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
}

seedIfEmpty()
