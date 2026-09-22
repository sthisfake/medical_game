/* Smoke test برای پنل مدیریت و API — بدون وابستگی خارجی */
import fs from 'node:fs'

const base = process.env.SMOKE_BASE ?? 'http://localhost:3000'
const results = []

const check = (name, ok, detail) =>
  results.push([detail === undefined ? name : `${name} — ${detail}`, ok])

// اعتبارنامهٔ پنل مدیریت (پیش‌فرض admin/admin — قابل تغییر با متغیرهای محیطی)
const ADMIN_USER = process.env.ADMIN_USER ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin'
const authHeader = `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64')}`

async function json(url, init) {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('Content-Type', 'application/json')
  // اعتبارنامه همیشه فرستاده می‌شود: مسیرهای عمومی با fetch خام آزموده می‌شوند
  headers.set('Authorization', authHeader)
  const res = await fetch(base + url, { ...init, headers, redirect: 'follow' })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}: ${String(text).slice(0, 200)}`)
  return data
}

/** نشانی گیرندهٔ نتیجه پیش از آزمون — برای بازگرداندن دقیق در پایان */
let originalNotifyEmail = null

try {
  // 0) محافظت از پنل مدیریت و تغییرات داده
  const adminNoAuth = await fetch(base + '/admin', { redirect: 'manual' })
  check('admin page requires auth (401)', adminNoAuth.status === 401)
  const adminWithAuth = await fetch(base + '/admin', { headers: { Authorization: authHeader } })
  check('admin page opens with auth (200)', adminWithAuth.status === 200)
  const writeNoAuth = await fetch(base + '/api/stages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'smoke-unauthorized' }),
  })
  check('write API blocked without auth (401)', writeNoAuth.status === 401)
  const readPublic = await fetch(base + '/api/stages')
  check('read API stays public (200)', readPublic.status === 200)

  // 1) ساختار دادهٔ موجود (ممکن است محتوای واقعی جای دادهٔ نمونه را گرفته باشد)
  const all = await json('/api/stages')
  const stage1 = all.stages.find((s) => s.id === 1)
  check('seeded: 4 stages', all.stages.length === 4)
  check(
    'stage 1 has questions with zones',
    !!stage1 && stage1.questions.length > 0 && stage1.questions.some((q) => q.zones.length > 0),
  )
  const existing = all.stages.flatMap((s) => s.questions)
  const mcqQ = existing.find((q) => q.type === 'mcq')
  const vidQ = existing.find((q) => q.type === 'video')
  check(
    'existing mcq questions are well-formed',
    !mcqQ || (mcqQ.correctIndex >= 0 && mcqQ.options.length >= 3),
  )
  check(
    'existing video questions are well-formed',
    !vidQ || (!!vidQ.videoUrl && vidQ.options.length >= 3),
  )
  // ستون تازهٔ زمان نمایش توضیح: دادهٔ قدیمی باید «همیشه» بماند (بدون تغییر رفتار)
  const badMode = existing.filter(
    (q) => q.explanationMode !== 'always' && q.explanationMode !== 'after',
  )
  check(
    'every question has a valid explanation mode',
    existing.length > 0 && badMode.length === 0,
    badMode.length ? `${badMode.length} سؤال نامعتبر` : `${existing.length} سؤال`,
  )
  check(
    'existing questions default to «always» (behaviour unchanged)',
    existing.every((q) => q.explanationMode === 'always'),
  )
  console.log(
    `— محتوا: ${all.stages.length} مرحله، ${existing.length} سؤال ` +
      `(mcq: ${existing.filter((q) => q.type === 'mcq').length}، ` +
      `video: ${existing.filter((q) => q.type === 'video').length})`,
  )

  // 2) آپلود تصویر (multipart)
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const fd = new FormData()
  fd.append('file', new Blob([png], { type: 'image/png' }), 'smoke.png')
  const upRes = await fetch(base + '/api/upload', {
    method: 'POST',
    body: fd,
    headers: { Authorization: authHeader },
  })
  const up = await upRes.json()
  check('upload image', upRes.status === 200 && up.ok === true && /^\/api\/uploads\/\d+$/.test(up.path))

  // سرو تصویر از دیتابیس
  const imgRes = await fetch(base + up.path)
  const imgType = imgRes.headers.get('content-type') ?? ''
  check('serve uploaded image', imgRes.status === 200 && imgType.startsWith('image/png'))

  // 3) ساخت مرحله
  const stage = await json('/api/stages', {
    method: 'POST',
    body: JSON.stringify({ order: 9, icon: 'T', title: 'Smoke Test Stage', subtitle: '', passRatio: 0.5 }),
  })
  check('create stage', stage.ok === true && stage.id > 0)

  // 4) ساخت سؤال با دو گزینه: یکی پاسخِ درست، یکی نادرست
  const q1 = {
    stageId: stage.id,
    prompt: 'Smoke question?',
    explanation: 'expl',
    image: up.path,
    imageWidth: 1,
    imageHeight: 1,
    zones: [
      { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1, correct: true },
      { kind: 'ellipse', cx: 0.2, cy: 0.2, rx: 0.1, ry: 0.1, correct: false },
    ],
  }
  const created = await json('/api/questions', { method: 'POST', body: JSON.stringify(q1) })
  check('create question', created.ok === true && created.id > 0)

  // 5) ویرایش سؤال: تبدیل ناحیه به چندضلعی + تغییر متن
  const q2 = {
    ...q1,
    prompt: 'Smoke question edited?',
    zones: [{ kind: 'polygon', points: [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]], correct: true }],
  }
  const updated = await json(`/api/questions/${created.id}`, { method: 'PUT', body: JSON.stringify(q2) })
  check('update question', updated.ok === true)

  const detail = await json(`/api/stages/${stage.id}`)
  const got = detail.stage.questions[0]
  check('question reflected with polygon zone', got && got.prompt.includes('edited') && got.zones[0].kind === 'polygon')
  check('correct flag round-trips', got.zones[0].correct === true)

  // 6) سؤال چهارگزینه‌ای (mcq) — با تصویر نمایشی (غیرقابل کلیک)
  const mcq = await json('/api/questions', {
    method: 'POST',
    body: JSON.stringify({
      stageId: stage.id,
      prompt: 'Smoke mcq?',
      explanation: 'e',
      image: up.path,
      imageWidth: 1,
      imageHeight: 1,
      zones: [],
      type: 'mcq',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 2,
    }),
  })
  check('create mcq question', mcq.ok === true && mcq.id > 0)
  const mcqDetail = await json(`/api/questions/${mcq.id}`)
  check(
    'mcq round-trips options + correctIndex',
    mcqDetail.question.type === 'mcq' &&
      mcqDetail.question.options.length === 4 &&
      mcqDetail.question.correctIndex === 2,
  )
  check('mcq carries display image', mcqDetail.question.image === up.path)

  // 6b) برچسب‌های روی تصویر — ذخیره، خواندن، ویرایش و پاک‌کردن
  const withLabels = await json(`/api/questions/${mcq.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      stageId: stage.id,
      prompt: 'Smoke mcq?',
      explanation: 'e',
      image: up.path,
      imageWidth: 1,
      imageHeight: 1,
      zones: [],
      labels: [
        { text: 'عضلهٔ ماسِتر', x: 0.25, y: 0.4 },
        { text: 'فک پایین', x: 0.6, y: 0.75 },
      ],
      type: 'mcq',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 2,
    }),
  })
  check('update question with image labels', withLabels.ok === true)
  const labDetail = await json(`/api/questions/${mcq.id}`)
  check(
    'labels round-trip text + normalized coords',
    labDetail.question.labels.length === 2 &&
      labDetail.question.labels[0].text === 'عضلهٔ ماسِتر' &&
      labDetail.question.labels[1].x === 0.6 &&
      labDetail.question.labels[1].y === 0.75,
  )

  const dirty = await json(`/api/questions/${mcq.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      stageId: stage.id,
      prompt: 'Smoke mcq?',
      explanation: 'e',
      image: up.path,
      imageWidth: 1,
      imageHeight: 1,
      zones: [],
      // متن خالی و مختصات بیرون از بازه باید پاک‌سازی شوند
      labels: [
        { text: '  ', x: 0.2, y: 0.2 },
        { text: 'درست', x: 5, y: -3 },
        'not-an-object',
      ],
      type: 'mcq',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 2,
    }),
  })
  check('update with dirty labels', dirty.ok === true)
  const cleaned = await json(`/api/questions/${mcq.id}`)
  check(
    'dirty labels sanitized (empty dropped, coords clamped)',
    cleaned.question.labels.length === 1 &&
      cleaned.question.labels[0].text === 'درست' &&
      cleaned.question.labels[0].x === 1 &&
      cleaned.question.labels[0].y === 0,
  )

  // 6c) زمان نمایش توضیح آموزشی — ذخیره، خواندن و مقدار نامعتبر
  const baseMcq = {
    stageId: stage.id,
    prompt: 'Smoke mcq?',
    explanation: 'توضیح آزمایشی',
    image: up.path,
    imageWidth: 1,
    imageHeight: 1,
    zones: [],
    type: 'mcq',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 2,
  }
  const afterRes = await json(`/api/questions/${mcq.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...baseMcq, explanationMode: 'after' }),
  })
  check('update question with explanationMode=after', afterRes.ok === true)
  const modeDetail = await json(`/api/questions/${mcq.id}`)
  check(
    'explanationMode round-trips as «after»',
    modeDetail.question.explanationMode === 'after' &&
      modeDetail.question.explanation === 'توضیح آزمایشی',
  )

  await json(`/api/questions/${mcq.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...baseMcq, explanationMode: 'whenever' }),
  })
  const junkDetail = await json(`/api/questions/${mcq.id}`)
  check(
    'unknown explanationMode falls back to «always»',
    junkDetail.question.explanationMode === 'always',
    junkDetail.question.explanationMode,
  )

  // 7) سؤال ویدیویی (video)
  const vid = await json('/api/questions', {
    method: 'POST',
    body: JSON.stringify({
      stageId: stage.id,
      prompt: 'Smoke video?',
      explanation: 'e',
      image: '',
      imageWidth: 0,
      imageHeight: 0,
      zones: [],
      type: 'video',
      options: ['x', 'y', 'z'],
      correctIndex: 1,
      videoUrl: 'https://example.com/video.mp4',
    }),
  })
  check('create video question', vid.ok === true && vid.id > 0)
  const vidDetail = await json(`/api/questions/${vid.id}`)
  check(
    'video round-trips url + options',
    vidDetail.question.type === 'video' &&
      vidDetail.question.videoUrl.includes('video.mp4') &&
      vidDetail.question.options.length === 3,
  )

  // 8) حذف مرحله → حذف آبشاری سؤال و تصویرِ ذخیره‌شده در دیتابیس
  await json(`/api/stages/${stage.id}`, { method: 'DELETE' })
  const after = await json('/api/stages')
  check('delete stage cascades', !after.stages.some((s) => s.id === stage.id))
  const goneImg = await fetch(base + up.path)
  check('uploaded image removed', goneImg.status === 404)
  // 9) تنظیمات اطلاع‌رسانی — خواندن و نوشتن فقط با ورود مدیر
  const settingsNoAuth = await fetch(base + '/api/settings')
  check('settings GET requires auth (401)', settingsNoAuth.status === 401)

  const settingsPutNoAuth = await fetch(base + '/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notifyEmail: 'attacker@example.com' }),
  })
  check('settings PUT blocked without auth (401)', settingsPutNoAuth.status === 401)

  const settingsBefore = await json('/api/settings')
  originalNotifyEmail = settingsBefore.notifyEmail
  check(
    'settings expose notifyEmail + mailConfigured',
    typeof settingsBefore.notifyEmail === 'string' &&
      typeof settingsBefore.mailConfigured === 'boolean',
  )

  const badEmail = await fetch(base + '/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ notifyEmail: 'not-an-email' }),
  })
  check('invalid notify email rejected (400)', badEmail.status === 400)

  const savedSettings = await json('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ notifyEmail: 'smoke@example.com' }),
  })
  check('valid notify email saved', savedSettings.notifyEmail === 'smoke@example.com')
  const rereadSettings = await json('/api/settings')
  check('notify email persists in meta', rereadSettings.notifyEmail === 'smoke@example.com')
  // وجود کلید در محیط سرور تعیین می‌کند؛ پیش‌فرض = بدون کلید
  const expectConfigured = process.env.EXPECT_MAIL_CONFIGURED === '1'
  check(
    `mailConfigured گزارش درست می‌دهد (${expectConfigured ? 'با کلید' : 'بدون کلید'})`,
    rereadSettings.mailConfigured === expectConfigured,
    String(rereadSettings.mailConfigured),
  )

  // بازگرداندن مقدار اولیه (ممکن است نشانی واقعیِ کاربر باشد)
  const restoredSettings = await json('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ notifyEmail: originalNotifyEmail }),
  })
  check('notify email restored to original', restoredSettings.notifyEmail === originalNotifyEmail)

  // از اینجا تا پایان بخش ۱۰ نشانی خالی می‌ماند تا هیچ ایمیلی بیرون نرود
  await json('/api/settings', { method: 'PUT', body: JSON.stringify({ notifyEmail: '' }) })

  // 10) /api/submit — تنها نوشتنِ عمومی برنامه (بدون ورود مدیر)
  const firstQ = all.stages.flatMap((s) => s.questions)[0]
  const s0 = { total: 1, firstTryCorrect: 1, secondTryCorrect: 0, mistakes: 0, timedOut: 0 }
  const submitPayload = (over = {}) => ({
    student: { firstName: 'آزمون', lastName: 'سنجش' },
    runId: `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    overall: s0,
    stages: [{ order: 1, title: 'مرحلهٔ آزمایشی', stats: s0 }],
    answers: [{ questionId: firstQ.id, prompt: firstQ.prompt, outcome: 'first', attempts: 1 }],
    finishedAt: new Date().toISOString(),
    ...over,
  })
  const post = (body, headers = {}) =>
    fetch(base + '/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

  const emptySubmit = await post({})
  check(
    'submit is public (400 from validation, not 401)',
    emptySubmit.status === 400,
    emptySubmit.status,
  )

  const badOutcome = await post(
    submitPayload({
      answers: [{ questionId: firstQ.id, prompt: 'p', outcome: 'maybe', attempts: 1 }],
    }),
  )
  check('submit rejects unknown outcome (400)', badOutcome.status === 400)

  const unknownId = await post(
    submitPayload({
      answers: [{ questionId: 99999999, prompt: 'p', outcome: 'first', attempts: 1 }],
    }),
  )
  check('submit rejects unknown question id (400)', unknownId.status === 400)

  const dupe = submitPayload()
  await post(dupe)
  const dupeSecond = await (await post(dupe)).json()
  check(
    'the same run is not emailed twice',
    dupeSecond.sent === false && dupeSecond.reason === 'duplicate',
  )

  const okSubmit = await post(submitPayload())
  const okBody = await okSubmit.json()
  check(
    'valid payload accepted; no recipient so nothing is sent',
    okSubmit.status === 200 && okBody.ok === true && okBody.sent === false && okBody.reason === 'no-recipient',
    JSON.stringify(okBody),
  )

  // محدودکنندهٔ نرخ با IP جعلیِ یکتا آزموده می‌شود تا سبد بقیه خراب نشود
  const fakeIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
  let lastStatus = 0
  for (let i = 0; i < 31; i += 1) {
    const r = await post(submitPayload(), { 'x-real-ip': fakeIp })
    lastStatus = r.status
  }
  check('submit rate limits a single IP (429)', lastStatus === 429, lastStatus)
} catch (e) {
  check(`unexpected: ${e.message}`, false)
}

// بازگرداندن تنظیمات به حالت اولیه — حتی اگر آزمون نیمه‌کاره ماند
try {
  if (typeof originalNotifyEmail === 'string') {
    await fetch(base + '/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ notifyEmail: originalNotifyEmail }),
    })
  }
} catch {
  /* ignore */
}

for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'} : ${name}`)
process.exit(results.every(([, ok]) => ok) ? 0 : 1)
