import { NextResponse } from 'next/server'
import { getStage, transferStageQuestions } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** همهٔ سؤال‌های یک مرحله را بدون حذف یا بازسازی به انتهای مرحلهٔ مقصد می‌برد. */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const sourceStageId = Number(id)
  if (!Number.isSafeInteger(sourceStageId) || sourceStageId <= 0) {
    return NextResponse.json({ error: 'invalid source stage' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const value =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).targetStageId
      : null
  const targetStageId = typeof value === 'number' ? value : NaN
  if (!Number.isSafeInteger(targetStageId) || targetStageId <= 0) {
    return NextResponse.json({ error: 'invalid target stage' }, { status: 400 })
  }
  if (sourceStageId === targetStageId) {
    return NextResponse.json({ error: 'source and target stages must differ' }, { status: 400 })
  }

  const [source, target] = await Promise.all([
    getStage(sourceStageId),
    getStage(targetStageId),
  ])
  if (!source) return NextResponse.json({ error: 'source stage not found' }, { status: 404 })
  if (!target) return NextResponse.json({ error: 'target stage not found' }, { status: 404 })
  if (source.questions.length === 0) {
    return NextResponse.json({ error: 'source stage has no questions' }, { status: 409 })
  }

  const expectedSourceCount = source.questions.length
  const result = await transferStageQuestions(
    sourceStageId,
    targetStageId,
    expectedSourceCount,
  )
  if (result.moved !== expectedSourceCount || result.sourceQuestionCount !== 0) {
    return NextResponse.json(
      { error: 'questions changed before transfer; reload and try again' },
      { status: 409 },
    )
  }

  return NextResponse.json({
    ok: true,
    moved: result.moved,
    sourceStageId,
    targetStageId,
    targetQuestionCount: result.targetQuestionCount,
  })
}
