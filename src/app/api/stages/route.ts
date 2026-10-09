import { NextResponse } from 'next/server'
import { createStage, listStages } from '@/lib/db'
import { parseStageInput } from '@/lib/stageInput'

export const dynamic = 'force-dynamic'

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
