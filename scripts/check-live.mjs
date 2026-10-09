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

  // برچسب‌های روی تصویر: اگر وجود دارند باید ساختارشان سالم باشد
  // (متن ناتهی + مختصات نرمال ۰..۱) — نبودنشان مشکلی نیست، اختیاری‌اند.
  const badLabels = []
  const badFlags = []
  let labelCount = 0
  let greenCount = 0
  for (const q of all) {
    const labels = q.labels
    if (labels === undefined || labels === null) continue
    if (!Array.isArray(labels)) {
      badLabels.push(`${q.prompt.slice(0, 20)} → labels آرایه نیست`)
      continue
    }
    for (const l of labels) {
      labelCount += 1
      const ok =
        l &&
        typeof l.text === 'string' &&
        l.text.trim() !== '' &&
        typeof l.x === 'number' &&
        typeof l.y === 'number' &&
        l.x >= 0 &&
        l.x <= 1 &&
        l.y >= 0 &&
        l.y <= 1
      if (!ok) badLabels.push(`${q.prompt.slice(0, 20)} → برچسب نامعتبر`)
      // نشانهٔ «پاسخ درست» یا نیست، یا باید دقیقاً boolean باشد
      if (l && l.correct !== undefined && typeof l.correct !== 'boolean') {
        badFlags.push(`${q.prompt.slice(0, 20)} → correct نامعتبر`)
      }
      if (l && l.correct === true) greenCount += 1
    }
  }
  check(
    'برچسب‌های روی تصویر ساختار درستی دارند',
    badLabels.length === 0,
    badLabels.length ? badLabels.slice(0, 3).join(' | ') : `${labelCount} برچسب`,
  )
  check(
    'نشانهٔ «پاسخ درست» روی برچسب‌ها معتبر است',
    badFlags.length === 0,
    badFlags.length ? badFlags.slice(0, 3).join(' | ') : `${greenCount} برچسب سبز از ${labelCount}`,
  )

  const choiceNoLabels = choice.filter((q) => !Array.isArray(q.labels))
  check(
    'سؤال‌های گزینه‌ای هم فیلد برچسب دارند (حتی خالی)',
    choiceNoLabels.length === 0,
    `${choice.length - choiceNoLabels.length}/${choice.length}`,
  )

  // زمان نمایش توضیح آموزشی: فقط «always» یا «after» معتبر است
  const badMode = all.filter((q) => q.explanationMode !== 'always' && q.explanationMode !== 'after')
  const afterCount = all.filter((q) => q.explanationMode === 'after').length
  check(
    'زمان نمایش توضیح آموزشی برای همهٔ سؤال‌ها معتبر است',
    badMode.length === 0,
    badMode.length
      ? badMode.slice(0, 3).map((q) => q.prompt.slice(0, 20)).join(' | ')
      : `${all.length - afterCount} «همیشه» ، ${afterCount} «بعد از پاسخ»`,
  )

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

  /* ---- بازبینی پایان مرحله (تصویر + متن + مدت زمان) ---- */
  /* بازهٔ مجاز مثل src/lib/review.ts: بین ۵ و ۹۰۰ ثانیه و حداکثر دو تصویر. اگر
     نسخهٔ منتشرشده هنوز این فیلد را ندارد، بررسی بی‌خطر رد می‌شود. */
  const reviewImagesOf = (st) =>
    [st.reviewImage ?? '', st.reviewImage2 ?? ''].map((s) => s.trim()).filter((s) => s !== '')
  const withReview = stages.filter(
    (st) => reviewImagesOf(st).length > 0 || (st.reviewText ?? '').trim() !== '',
  )
  const published = stages.some((st) => st.reviewSeconds !== undefined || st.reviewImage !== undefined)
  const badSeconds = stages.filter(
    (st) =>
      st.reviewSeconds !== undefined &&
      !(typeof st.reviewSeconds === 'number' && st.reviewSeconds >= 5 && st.reviewSeconds <= 900),
  )
  check(
    'مدت بازبینی هر مرحله معتبر است',
    badSeconds.length === 0,
    badSeconds.length
      ? badSeconds.map((st) => `${st.title}:${st.reviewSeconds}`).join(' | ')
      : published
        ? `${withReview.length} مرحله بازبینی دارد از ${stages.length}`
        : 'این نسخه هنوز بازبینی ندارد',
  )

  const tooManyImages = stages.filter((st) => reviewImagesOf(st).length > 2)
  check(
    'هر مرحله حداکثر دو تصویر بازبینی دارد',
    tooManyImages.length === 0,
    tooManyImages.map((st) => st.title).join(' | ') || `${stages.length} مرحله`,
  )

  const reviewUrls = [...new Set(stages.flatMap((st) => reviewImagesOf(st)))]
  const brokenReview = []
  for (const u of reviewUrls) {
    const { status, type } = await get(u)
    if (status !== 200 || !type.startsWith('image/')) brokenReview.push(`${u} → ${status}`)
  }
  check(
    `تصویرهای بازبینی مرحله‌ها در دسترس‌اند (${reviewUrls.length})`,
    brokenReview.length === 0,
    brokenReview.slice(0, 3).join(' | '),
  )

  /* ---- تنظیمات ایمیل و مسیر ارسال کارنامه ---- */
  /* این بررسی‌ها فقط خواندنی‌اند یا درخواست‌های ناقصی می‌فرستند که        */
  /* پیش از هر ارسالی رد می‌شوند؛ پس روی سایت واقعی بی‌خطرند.            */

  const settingsRes = await fetch(`${base}/api/settings`)
  check(
    'تنظیمات ایمیل فقط با ورود مدیر خوانده می‌شود',
    settingsRes.status === 401,
    `HTTP ${settingsRes.status}`,
  )

  const submitJunk = await fetch(`${base}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  check(
    'مسیر ارسال کارنامه بدنهٔ ناقص را رد می‌کند',
    submitJunk.status === 400,
    `HTTP ${submitJunk.status}`,
  )

  const submitUnknown = await fetch(`${base}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student: { firstName: 'بازبینی', lastName: 'خودکار' },
      runId: `check-live-${Date.now()}`,
      overall: { total: 1, firstTryCorrect: 1, secondTryCorrect: 0, mistakes: 0, timedOut: 0 },
      stages: [],
      answers: [{ questionId: 99999999, prompt: 'بررسی', outcome: 'first', attempts: 1 }],
      finishedAt: new Date().toISOString(),
    }),
  })
  check(
    'کارنامه با شناسهٔ سؤال ناشناخته رد می‌شود',
    submitUnknown.status === 400,
    `HTTP ${submitUnknown.status}`,
  )
}

const failed = results.filter(([, ok]) => !ok)
for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'} : ${name}${detail ? ` — ${detail}` : ''}`)
}
console.log(`\n${results.length - failed.length}/${results.length} بررسی موفق`)
process.exit(failed.length ? 1 : 0)
