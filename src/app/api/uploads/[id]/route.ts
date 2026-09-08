import { getUpload } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * سرو تصویرِ ذخیره‌شده در دیتابیس.
 * شناسهٔ آپلود یکتا و تغییرناپذیر است؛ کشِ طولانی در مرورگر بی‌خطر است.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const uploadId = Number(id)
  if (!Number.isFinite(uploadId)) {
    return new Response('bad request', { status: 400 })
  }
  const upload = await getUpload(uploadId)
  if (!upload) return new Response('not found', { status: 404 })

  const bytes = Buffer.from(upload.data, 'base64')
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': upload.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
