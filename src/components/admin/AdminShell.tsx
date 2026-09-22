'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface StorageInfo {
  kind: 'sqlite' | 'postgres'
  databaseUrl: boolean
  vercel: boolean
}

/** قاب مشترک صفحات پنل مدیریت: سربرگ + نشانگر منبع داده + بازگشت + بدنه */
export function AdminShell({
  title,
  backHref,
  backLabel = 'بازگشت',
  children,
}: {
  title: string
  backHref?: string
  backLabel?: string
  children?: ReactNode
}) {
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  useEffect(() => {
    fetch('/api/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStorage(d))
      .catch(() => setStorage(null))
  }, [])

  const dbLabel =
    storage?.kind === 'postgres'
      ? 'منبع داده: PostgreSQL (Neon)'
      : storage?.kind === 'sqlite'
        ? 'منبع داده: SQLite (محلی)'
        : null

  return (
    <div className="admin">
      <header className="admin__bar">
        <div className="admin__bar-inner">
          <a className="admin__brand" href="/">
            آناتومی صورت — مدیریت محتوا
          </a>
          <nav className="admin__nav">
            <a href="/">بازی</a>
            <a href="/admin">مراحل</a>
            <a href="/admin/settings">تنظیمات</a>
          </nav>
          {dbLabel && <span className="admin__db">{dbLabel}</span>}
        </div>
      </header>

      <main className="admin__main">
        <div className="admin__head">
          {backHref ? (
            <a className="admin__back" href={backHref}>
              → {backLabel}
            </a>
          ) : (
            <span />
          )}
          <h1 className="admin__title">{title}</h1>
          <span />
        </div>
        {children}
      </main>
    </div>
  )
}
