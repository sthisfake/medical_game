import { NextResponse } from 'next/server'
import { deleteQuestion, getQuestion, getStage, updateQuestion } from '@/lib/db'
import type { QuestionInput } from '@/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function parseQuestionInput(body: unknown): QuestionInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const stageId = typeof b.stageId === 'number' ? Math.round(b.stageId) : NaN
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : ''
  const explanation = typeof b.explanation === 'string' ? b.explanation : ''
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

  if (!Number.isFinite(stageId) || !prompt) return null
  if (type === 'image' && !image) return null
  if (type !== 'image') {
    if (options.length < 3 || options.length > 4) return null
    if (options.some((o) => !o)) return null
    if (correctIndex < 0 || correctIndex >= options.length) return null
  }
  if (type === 'video' && !videoUrl) return null

  return { stageId, prompt, explanation, image, imageWidth, imageHeight, zones, type, options, correctIndex, videoUrl }
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const question = await getQuestion(Number(id))
  if (!question) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ question })
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const prev = await getQuestion(Number(id))
  if (!prev) return NextResponse.json({ error: 'not found' }, { status: 404 })

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

  await updateQuestion(Number(id), input, prev)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const prev = await getQuestion(Number(id))
  if (!prev) return NextResponse.json({ error: 'not found' }, { status: 404 })
  await deleteQuestion(Number(id))
  return NextResponse.json({ ok: true })
}
