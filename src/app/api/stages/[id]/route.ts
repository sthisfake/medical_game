import { NextResponse } from 'next/server'
import { deleteStage, getStage, updateStage } from '@/lib/db'
import type { StageInput } from '@/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function parseStageInput(body: unknown): StageInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  const icon = typeof b.icon === 'string' ? b.icon.trim() : '📘'
  const subtitle = typeof b.subtitle === 'string' ? b.subtitle.trim() : ''
  const order = typeof b.order === 'number' ? Math.round(b.order) : 0
  const passRatio = typeof b.passRatio === 'number' ? b.passRatio : 0.5
  if (!title) return null
  return { order, icon: icon || '📘', title, subtitle, passRatio }
}

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
