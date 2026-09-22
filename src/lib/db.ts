import type { Question, Stage, StageInput, QuestionInput } from '../types'

/* ------------------------------------------------------------------ */
/* لایهٔ دسترسی به داده — فقط در سمت سرور (Node.js) قابل استفاده است  */
/* انتخاب خودکار بک‌اند:                                                */
/*   • PostgreSQL (Neon) روی Vercel — اگر DATABASE_URL تنظیم باشد      */
/*   • SQLite محلی (node:sqlite) — در غیر این صورت (توسعهٔ محلی)        */
/* همهٔ توابع async هستند؛ بک‌اند SQLite به‌صورت داخلی همگام است.      */
/* ------------------------------------------------------------------ */

export const USE_POSTGRES = !!process.env.DATABASE_URL
export const backendKind = USE_POSTGRES ? 'postgres' : 'sqlite'

export interface StoredUpload {
  id: number
  /** base64 */
  data: string
  contentType: string
}

export interface SavedUpload extends StoredUpload {
  path: string
}

interface Backend {
  ensureReady?(): Promise<void>
  listStages(): Promise<Stage[]>
  getStage(stageId: number): Promise<Stage | null>
  getQuestion(questionId: number): Promise<Question | null>
  createStage(input: StageInput): Promise<number>
  updateStage(stageId: number, input: StageInput): Promise<void>
  deleteStage(stageId: number): Promise<void>
  createQuestion(input: QuestionInput): Promise<number>
  updateQuestion(
    questionId: number,
    input: QuestionInput,
    prev: Question | null,
  ): Promise<void>
  deleteQuestion(questionId: number): Promise<void>
  saveUpload(dataBase64: string, contentType: string): Promise<SavedUpload>
  getUpload(uploadId: number): Promise<StoredUpload | null>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
}

let implPromise: Promise<unknown> | null = null

async function impl(): Promise<Backend> {
  if (USE_POSTGRES) {
    implPromise ??= import('./db-postgres')
  } else {
    // روی Vercel فایل‌سیستم ماندگار نیست؛ SQLite یعنی از دست رفتن داده در هر استقرار.
    // به‌جای خرابیِ بی‌صدا، صریح خطا می‌دهیم تا DATABASE_URL (Neon) تنظیم شود.
    if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
      throw new Error(
        'روی Vercel باید متغیر محیطی DATABASE_URL (PostgreSQL/Neon) تنظیم شود؛ SQLite فقط برای توسعهٔ محلی است.',
      )
    }
    implPromise ??= import('./db-sqlite')
  }
  const m = (await implPromise) as Backend
  if (typeof m.ensureReady === 'function') await m.ensureReady()
  return m
}

/* ------------------------- مراحل و سؤال‌ها ------------------------- */

export async function listStages(): Promise<Stage[]> {
  return (await impl()).listStages()
}

export async function getStage(stageId: number): Promise<Stage | null> {
  return (await impl()).getStage(stageId)
}

export async function getQuestion(questionId: number): Promise<Question | null> {
  return (await impl()).getQuestion(questionId)
}

export async function createStage(input: StageInput): Promise<number> {
  return (await impl()).createStage(input)
}

export async function updateStage(stageId: number, input: StageInput): Promise<void> {
  return (await impl()).updateStage(stageId, input)
}

export async function deleteStage(stageId: number): Promise<void> {
  return (await impl()).deleteStage(stageId)
}

export async function createQuestion(input: QuestionInput): Promise<number> {
  return (await impl()).createQuestion(input)
}

export async function updateQuestion(
  questionId: number,
  input: QuestionInput,
  prev: Question | null,
): Promise<void> {
  return (await impl()).updateQuestion(questionId, input, prev)
}

export async function deleteQuestion(questionId: number): Promise<void> {
  return (await impl()).deleteQuestion(questionId)
}

/* ------------------------------- تصویر ------------------------------ */

/** استخراج شناسه از مسیر تصویری مثل /api/uploads/12 */
export function parseUploadId(imagePath: string): number | null {
  const m = /^\/api\/uploads\/(\d+)$/.exec(imagePath)
  return m ? Number(m[1]) : null
}

export async function saveUpload(
  dataBase64: string,
  contentType: string,
): Promise<SavedUpload> {
  return (await impl()).saveUpload(dataBase64, contentType)
}

export async function getUpload(uploadId: number): Promise<StoredUpload | null> {
  return (await impl()).getUpload(uploadId)
}

/* ------------------------------ تنظیمات ----------------------------- */

export async function getSetting(key: string): Promise<string | null> {
  return (await impl()).getSetting(key)
}

export async function setSetting(key: string, value: string): Promise<void> {
  return (await impl()).setSetting(key, value)
}
