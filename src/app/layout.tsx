import type { Metadata, Viewport } from 'next'
import 'vazirmatn/Vazirmatn-font-face.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'آناتومی صورت | بازی آموزشی',
  description: 'بازی آموزشی آناتومی صورت — شناسایی عضلات و ساختارهای صورت با کلیک روی تصویر',
}

export const viewport: Viewport = {
  themeColor: '#f5f5f7',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
