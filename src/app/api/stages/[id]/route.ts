import { NextResponse } from 'next/server'
import { deleteStage, getStage, updateStage } from '@/lib/db'
import { parseStageInput } from '@/lib/stageInput'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const stage = await getStage(Number(id))
  if (!stage) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ stage })
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!(await getStage(Number(id)))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const input = parseStageInput(body)
  if (!input) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  await updateStage(Number(id), input)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!(await getStage(Number(id)))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  await deleteStage(Number(id))
  return NextResponse.json({ ok: true })
}
