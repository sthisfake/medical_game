import { neon } from '@neondatabase/serverless'
import type { AnswerZone, ImageLabel, Question, Stage } from '../types'
import { demoImageBytes, demoStage, demoSkeletonStages } from './seed-content'
import { parseLabels, serializeLabels } from './labels'

/* ------------------------------------------------------------------ */
/* بک‌اند PostgreSQL — برای Vercel با Neon                             */
/* وقتی متغیر محیطی DATABASE_URL تنظیم باشد انتخاب می‌شود.            */
/* رابط: یکسان با بک‌اند SQLite ولی async (درایور serverless/HTTP).   */
/* تصاویر به‌صورت base64 داخل جدول uploads ذخیره می‌شوند.              */
/* ------------------------------------------------------------------ */

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('db-postgres: DATABASE_URL تنظیم نشده است')
}

const neonSql = neon(DATABASE_URL)

/** اجرای کوئری با پارامترهای شماره‌دار $1, $2, … */
async function q<R extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<R[]> {
  return (await neonSql.query(text, params)) as unknown as R[]
}

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
    id: Number(row.id),
    stageId: Number(row.stage_id),
    prompt: row.prompt,
    explanation: row.explanation,
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
    id: Number(row.id),
    order: row.order,
    icon: row.icon,
    title: row.title,
    subtitle: row.subtitle,
    passRatio: row.pass_ratio,
  }
}

/* ------------------------------------------------------------------ */
/* طرح اولیه (schema)                                                  */
/* ------------------------------------------------------------------ */

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS stages (
     id         BIGSERIAL PRIMARY KEY,
     "order"    INTEGER NOT NULL DEFAULT 1,
     icon       TEXT    NOT NULL DEFAULT '📘',
     title      TEXT    NOT NULL,
     subtitle   TEXT    NOT NULL DEFAULT '',
     pass_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.5
   )`,
  `CREATE TABLE IF NOT EXISTS questions (
     id            BIGSERIAL PRIMARY KEY,
     stage_id      BIGINT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
     prompt        TEXT   NOT NULL,
     explanation   TEXT   NOT NULL DEFAULT '',
     image         TEXT   NOT NULL DEFAULT '',
     image_width   INTEGER NOT NULL DEFAULT 0,
     image_height  INTEGER NOT NULL DEFAULT 0,
     zones         TEXT   NOT NULL DEFAULT '[]',
     labels        TEXT   NOT NULL DEFAULT '[]',
     type          TEXT   NOT NULL DEFAULT 'image',
     options       TEXT   NOT NULL DEFAULT '[]',
     correct_index INTEGER NOT NULL DEFAULT -1,
     video_url     TEXT   NOT NULL DEFAULT '',
     sort          INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_questions_stage ON questions(stage_id)`,
  `CREATE TABLE IF NOT EXISTS uploads (
     id           BIGSERIAL PRIMARY KEY,
     data         TEXT NOT NULL, -- تصویر به‌صورت base64
     content_type TEXT NOT NULL DEFAULT 'image/jpeg',
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
]

async function ensureSchema(): Promise<void> {
  for (const ddl of DDL) await q(ddl)
  // ارتقای دیتابیس‌های قدیمی: ستون‌های انواع جدید سؤال
  const alters = [
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'image'`,
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS options TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_index INTEGER NOT NULL DEFAULT -1`,
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS video_url TEXT NOT NULL DEFAULT ''`,
    // برچسب‌های روی تصویر — افزودن ستون، بدون دست‌زدن به دادهٔ موجود
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS labels TEXT NOT NULL DEFAULT '[]'`,
  ]
  for (const alter of alters) {
    try {
      await q(alter)
    } catch {
      /* ستون از قبل وجود دارد */
    }
  }
}

/* ------------------------------------------------------------------ */
/* seed — یک‌بار، با قفل مشاوره‌ای تا بین چند instance رقابت نشود     */
/* ------------------------------------------------------------------ */

async function seedIfEmpty(): Promise<void> {
  await q('BEGIN')
  try {
    // قفل تراکنشی: هم‌زمان فقط یک فرایند می‌تواند seed کند
    await q('SELECT pg_advisory_xact_lock(7391442)')
    const flag = await q<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'seeded'",
    )
    if (flag.length === 0) {
      const saved = await saveUpload(demoImageBytes().toString('base64'), 'image/svg+xml')
      const stageRes = await q<{ id: number }>(
        `INSERT INTO stages ("order", icon, title, subtitle, pass_ratio)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [demoStage.order, demoStage.icon, demoStage.title, demoStage.subtitle, demoStage.passRatio],
      )
      const stageId = Number(stageRes[0].id)
      for (const dq of demoStage.questions) {
        await q(
          `INSERT INTO questions
             (stage_id, prompt, explanation, image, image_width, image_height, zones,
              labels, type, options, correct_index, video_url, sort)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            stageId,
            dq.prompt,
            dq.explanation,
            dq.type === 'image' || !dq.type ? saved.path : '',
            dq.type === 'image' || !dq.type ? 300 : 0,
            dq.type === 'image' || !dq.type ? 360 : 0,
            JSON.stringify(dq.zones),
            serializeLabels(dq.labels),
            dq.type ?? 'image',
            JSON.stringify(dq.options ?? []),
            dq.correctIndex ?? -1,
            dq.videoUrl ?? '',
            0,
          ],
        )
      }
      for (const s of demoSkeletonStages) {
        await q(
          `INSERT INTO stages ("order", icon, title, subtitle, pass_ratio) VALUES ($1, $2, $3, '', 0.5)`,
          [s.order, s.icon, s.title],
        )
      }
      await q("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
    }
    await q('COMMIT')
  } catch (e) {
    try {
      await q('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
}

let readyPromise: Promise<void> | null = null

/** یک‌بار: ساخت schema + seed در صورت خالی بودن */
export function ensureReady(): Promise<void> {
  readyPromise ??= (async () => {
    await ensureSchema()
    await seedIfEmpty()
  })()
  return readyPromise
}

/* ------------------------------------------------------------------ */
/* کوئری‌ها                                                           */
/* ------------------------------------------------------------------ */

export async function listStages(): Promise<Stage[]> {
  const stageRows = await q<DbStageRow>(`SELECT * FROM stages ORDER BY "order", id`)
  const stages: Stage[] = []
  for (const sr of stageRows) {
    const qRows = await q<DbQuestionRow>(`SELECT * FROM questions WHERE stage_id = $1 ORDER BY sort, id`, [
      sr.id,
    ])
    stages.push({ ...rowToStage(sr), questions: qRows.map(rowToQuestion) })
  }
  return stages
}

export async function getStage(stageId: number): Promise<Stage | null> {
  const rows = await q<DbStageRow>(`SELECT * FROM stages WHERE id = $1`, [stageId])
  if (rows.length === 0) return null
  const sr = rows[0]
  const qRows = await q<DbQuestionRow>(`SELECT * FROM questions WHERE stage_id = $1 ORDER BY sort, id`, [
    sr.id,
  ])
  return { ...rowToStage(sr), questions: qRows.map(rowToQuestion) }
}

export async function getQuestion(questionId: number): Promise<Question | null> {
  const rows = await q<DbQuestionRow>(`SELECT * FROM questions WHERE id = $1`, [questionId])
  return rows.length > 0 ? rowToQuestion(rows[0]) : null
}

export async function createStage(input: {
  order: number
  icon: string
  title: string
  subtitle: string
  passRatio: number
}): Promise<number> {
  const rows = await q<{ id: number }>(
    `INSERT INTO stages ("order", icon, title, subtitle, pass_ratio)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.order, input.icon, input.title, input.subtitle, input.passRatio],
  )
  return Number(rows[0].id)
}

export async function updateStage(
  stageId: number,
  input: { order: number; icon: string; title: string; subtitle: string; passRatio: number },
): Promise<void> {
  await q(
    `UPDATE stages SET "order" = $1, icon = $2, title = $3, subtitle = $4, pass_ratio = $5 WHERE id = $6`,
    [input.order, input.icon, input.title, input.subtitle, input.passRatio, stageId],
  )
}

export async function deleteStage(stageId: number): Promise<void> {
  const questions = await q<{ image: string }>(`SELECT image FROM questions WHERE stage_id = $1`, [
    stageId,
  ])
  await q(`DELETE FROM stages WHERE id = $1`, [stageId])
  for (const question of questions) await deleteUploadedImage(question.image)
}

export async function createQuestion(input: {
  stageId: number
  prompt: string
  explanation: string
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
}): Promise<number> {
  const rows = await q<{ id: number }>(
    `INSERT INTO questions
       (stage_id, prompt, explanation, image, image_width, image_height, zones,
        labels, type, options, correct_index, video_url, sort)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [
      input.stageId,
      input.prompt,
      input.explanation,
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
    ],
  )
  return Number(rows[0].id)
}

export async function updateQuestion(
  questionId: number,
  input: {
    stageId: number
    prompt: string
    explanation: string
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
): Promise<void> {
  if (prev && prev.image !== input.image) await deleteUploadedImage(prev.image)
  await q(
    `UPDATE questions
     SET stage_id = $1, prompt = $2, explanation = $3, image = $4,
         image_width = $5, image_height = $6, zones = $7, labels = $8,
         type = $9, options = $10, correct_index = $11, video_url = $12
     WHERE id = $13`,
    [
      input.stageId,
      input.prompt,
      input.explanation,
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
    ],
  )
}

export async function deleteQuestion(questionId: number): Promise<void> {
  const rows = await q<{ image: string }>(`SELECT image FROM questions WHERE id = $1`, [questionId])
  if (rows.length === 0) return
  await q(`DELETE FROM questions WHERE id = $1`, [questionId])
  await deleteUploadedImage(rows[0].image)
}

/* ------------------------------------------------------------------ */
/* تصویر (ذخیره در دیتابیس)                                            */
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

export async function deleteUploadedImage(imagePath: string): Promise<void> {
  const id = parseUploadId(imagePath)
  if (id === null) return
  await q(`DELETE FROM uploads WHERE id = $1`, [id])
}

export async function saveUpload(dataBase64: string, contentType: string): Promise<SavedUpload> {
  const rows = await q<{ id: number }>(
    `INSERT INTO uploads (data, content_type) VALUES ($1, $2) RETURNING id`,
    [dataBase64, contentType],
  )
  const id = Number(rows[0].id)
  return { id, data: dataBase64, contentType, path: `/api/uploads/${id}` }
}

export async function getUpload(uploadId: number): Promise<StoredUpload | null> {
  const rows = await q<{ id: number; data: string; content_type: string }>(
    `SELECT id, data, content_type FROM uploads WHERE id = $1`,
    [uploadId],
  )
  return rows.length > 0
    ? { id: Number(rows[0].id), data: rows[0].data, contentType: rows[0].content_type }
    : null
}
