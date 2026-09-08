import { NextResponse } from 'next/server'
import { backendKind } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** اطلاعات منبع دادهٔ فعال — برای نشانگر در پنل مدیریت */
export async function GET() {
  return NextResponse.json({
    kind: backendKind,
    databaseUrl: !!process.env.DATABASE_URL,
    vercel: !!process.env.VERCEL,
  })
}
