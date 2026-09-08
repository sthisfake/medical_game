/* ------------------------------------------------------------------ */
/* پشتیبان‌گیری دستی از دیتابیس محلی (SQLite)                          */
/*   node scripts/backup.mjs                                           */
/* یک کپی از data/game.db در data/backups/game-<تاریخ>-<ساعت>.db      */
/* ------------------------------------------------------------------ */
import fs from 'node:fs'
import path from 'node:path'

const dbPath = path.join(process.cwd(), 'data', 'game.db')
if (!fs.existsSync(dbPath)) {
  console.error('دیتابیس محلی یافت نشد — چیزی برای پشتیبان‌گیری نیست.')
  process.exit(1)
}

const ts = new Date()
const stamp =
  `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}` +
  `-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`

const outDir = path.join(process.cwd(), 'data', 'backups')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `game-${stamp}.db`)
fs.copyFileSync(dbPath, outPath)
console.log(`پشتیبان گرفته شد: ${outPath}`)
