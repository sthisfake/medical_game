import { NextResponse } from 'next/server'
import { createQuestion, getStage } from '@/lib/db'
import { sanitizeLabels } from '@/lib/labels'
import { parseExplanationMode } from '@/lib/explanation'
import type { QuestionInput } from '@/types'

export const dynamic = 'force-dynamic'

function parseQuestionInput(body: unknown): QuestionInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const stageId = typeof b.stageId === 'number' ? Math.round(b.stageId) : NaN
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : ''
  const explanation = typeof b.explanation === 'string' ? b.explanation : ''
  // زمان نمایش توضیح آموزشی — ناشناخته یا غایب = «همیشه» (رفتار قبلی)
  const explanationMode = parseExplanationMode(b.explanationMode)
  const image = typeof b.image === 'string' ? b.image : ''
  const imageWidth = typeof b.imageWidth === 'number' ? Math.round(b.imageWidth) : 0
  const imageHeight = typeof b.imageHeight === 'number' ? Math.round(b.imageHeight) : 0
  const zones = Array.isArray(b.zones) ? (b.zones as QuestionInput['zones']) : []
  const type: QuestionInput['type'] = b.type === 'mcq' || b.type === 'video' ? b.type : 'image'
  const options = Array.isArray(b.options)
    ? (b.options.filter((o): o is string => typeof o === 'string').map((o) => o.trim()) ?? [])
    : []
  const correctIndex = typeof b.correctIndex === 'number' ? Math.round(b.correctIndex) : -1
  const videoUrl = typeof b.videoUrl === 'string' ? b.videoUrl.trim() : ''
  // برچسب‌های روی تصویر اختیاری‌اند؛ فقط برای سؤال‌هایی که تصویر دارند معنا دارند
  const labels = sanitizeLabels(b.labels)

  if (!Number.isFinite(stageId) || !prompt) return null
  if (type === 'image' && !image) return null
  if (type !== 'image') {
    if (options.length < 3 || options.length > 4) return null
    if (options.some((o) => !o)) return null
    if (correctIndex < 0 || correctIndex >= options.length) return null
  }
  if (type === 'video' && !videoUrl) return null

  return { stageId, prompt, explanation, explanationMode, image, imageWidth, imageHeight, zones, labels, type, options, correctIndex, videoUrl }
}

/** ساخت سؤال جدید */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const input = parseQuestionInput(body)
  if (!input) return NextResponse.json({ error: 'invalid question' }, { status: 400 })
  if (!(await getStage(input.stageId))) {
    return NextResponse.json({ error: 'stage not found' }, { status: 404 })
  }
  const id = await createQuestion(input)
  return NextResponse.json({ ok: true, id }, { status: 201 })
}
