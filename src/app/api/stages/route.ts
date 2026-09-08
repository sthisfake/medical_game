import { NextResponse } from 'next/server'
import { createStage, listStages } from '@/lib/db'
import type { StageInput } from '@/types'

export const dynamic = 'force-dynamic'

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

/** فهرست کامل مراحل به همراه سؤال‌ها — هم برای بازی، هم برای پنل مدیریت */
export async function GET() {
  return NextResponse.json({ stages: await listStages() })
}

/** ساخت مرحلهٔ جدید */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const input = parseStageInput(body)
  if (!input) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  const id = await createStage(input)
  return NextResponse.json({ ok: true, id }, { status: 201 })
}
