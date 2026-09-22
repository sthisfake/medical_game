import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/* ------------------------------------------------------------------ */
/* محافظت از پنل مدیریت و تغییرات داده                                 */
/*   نام کاربری/گذرواژه به‌صورت پیش‌فرض: admin / admin                  */
/*   در صورت نیاز می‌توان با متغیرهای محیطی ADMIN_USER و ADMIN_PASSWORD */
/*   روی Vercel تغییرشان داد.                                          */
/*                                                                     */
/* تنها استثنا: POST /api/submit — کاربرِ آزمون (بدون ورود مدیر)        */
/* کارنامهٔ پایان آزمون را می‌فرستد. فقط همین یک مسیر و فقط POST.       */
/* ------------------------------------------------------------------ */

const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin'
const REALM = 'Admin'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function authorized(request: NextRequest): boolean {
  const header = request.headers.get('authorization') ?? ''
  if (!header.toLowerCase().startsWith('basic ')) return false
  let decoded = ''
  try {
    decoded = atob(header.slice(6).trim())
  } catch {
    return false
  }
  const separator = decoded.indexOf(':')
  if (separator < 0) return false
  const user = decoded.slice(0, separator)
  const password = decoded.slice(separator + 1)
  return user === ADMIN_USER && password === ADMIN_PASSWORD
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // صفحه‌های پنل مدیریت + درخواست‌های تغییردهندهٔ داده
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
  const isMutation = pathname.startsWith('/api/') && MUTATING.has(request.method)
  // تنظیمات: خواندنش هم باید محافظت شود (نشانی ایمیل مدیر داخلش است)
  const isSettings = pathname === '/api/settings' || pathname.startsWith('/api/settings/')
  // تنها نوشتنِ عمومی برنامه: کاربرِ آزمون کارنامهٔ پایان را می‌فرستد
  const isPublicSubmit = pathname === '/api/submit' && request.method === 'POST'

  if (isPublicSubmit) return NextResponse.next()
  if (!isAdminPage && !isSettings && !isMutation) return NextResponse.next()
  if (authorized(request)) return NextResponse.next()

  return new NextResponse('دسترسی نیازمند ورود مدیر است.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
}
