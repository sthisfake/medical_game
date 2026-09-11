/* ------------------------------------------------------------------ */
/* بازبینی محتوای سایت منتشرشده (Vercel) بدون نیاز به دیتابیس          */
/*                                                                     */
/*   node scripts/check-live.mjs [آدرس سایت]                            */
/*   npm run check:live -- https://xxxx.vercel.app                      */
/*                                                                     */
/* بررسی می‌کند: هر سؤال گزینه‌ای/ویدیویی گزینه دارد، گزینهٔ درست داخل   */
/* بازه است، تصویرها و ویدیوها در دسترس‌اند.                            */
/* ------------------------------------------------------------------ */
const base = (process.argv[2] ?? process.env.LIVE_URL ?? '').replace(/\/$/, '')

if (!base) {
  console.error('آدرس سایت را بدهید: node scripts/check-live.mjs https://xxxx.vercel.app')
  process.exit(2)
}

const results = []
const check = (name, ok, detail = '') => results.push([name, ok, detail])

const get = async (path) => {
  const res = await fetch(base + path)
  return { status: res.status, type: res.headers.get('content-type') ?? '', res }
}

console.log(`بازبینی ${base}\n`)

let stages = []
try {
  const res = await fetch(`${base}/api/stages`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  stages = data.stages ?? []
  check('API مراحل پاسخ می‌دهد', stages.length > 0, `${stages.length} مرحله`)
} catch (e) {
  check('API مراحل پاسخ می‌دهد', false, e instanceof Error ? e.message : String(e))
}

const all = stages.flatMap((st) => st.questions.map((q) => ({ ...q, stage: st.title })))
const choice = all.filter((q) => q.type === 'mcq' || q.type === 'video')

if (all.length > 0) {
  const noOptions = choice.filter((q) => !Array.isArray(q.options) || q.options.length < 3)
  check(
    'همهٔ سؤال‌های گزینه‌ای/ویدیویی گزینه دارند',
    noOptions.length === 0,
    noOptions.length ? `${noOptions.length} سؤال بدون گزینه: ${noOptions.map((q) => q.prompt.slice(0, 24)).join(' | ')}` : `${choice.length} سؤال`,
  )

  const badIndex = choice.filter((q) => !(q.correctIndex >= 0 && q.correctIndex < (q.options?.length ?? 0)))
  check('گزینهٔ درست هر سؤال معتبر است', badIndex.length === 0, badIndex.map((q) => q.prompt.slice(0, 24)).join(' | '))

  const imageQs = all.filter((q) => q.type === 'image')
  const noZones = imageQs.filter((q) => !Array.isArray(q.zones) || q.zones.length === 0)
  check('همهٔ سؤال‌های تصویری ناحیه دارند', noZones.length === 0, `${imageQs.length} سؤال تصویری`)

  const imageUrls = [...new Set(all.filter((q) => q.image).map((q) => q.image))]
  let brokenImages = []
  for (const u of imageUrls) {
    const { status, type } = await get(u)
    if (status !== 200 || !type.startsWith('image/')) brokenImages.push(`${u} → ${status}`)
  }
  check(`تصویرها در دسترس‌اند (${imageUrls.length})`, brokenImages.length === 0, brokenImages.slice(0, 3).join(' | '))

  const videoUrls = [...new Set(all.filter((q) => q.videoUrl).map((q) => q.videoUrl))]
  let brokenVideos = []
  for (const u of videoUrls) {
    if (!u.startsWith('/')) continue
    const { status, type } = await get(u)
    if (status !== 200 || type.includes('text/html')) brokenVideos.push(`${u} → ${status}`)
  }
  check(`ویدیوها در دسترس‌اند (${videoUrls.length})`, brokenVideos.length === 0, brokenVideos.slice(0, 3).join(' | '))

  check(
    'مرحله‌ها سؤال دارند',
    stages.every((st) => st.questions.length > 0),
    stages.map((st) => `${st.title}:${st.questions.length}`).join(' '),
  )
}

const failed = results.filter(([, ok]) => !ok)
for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'} : ${name}${detail ? ` — ${detail}` : ''}`)
}
console.log(`\n${results.length - failed.length}/${results.length} بررسی موفق`)
process.exit(failed.length ? 1 : 0)
