/* Smoke test برای پنل مدیریت و API — بدون وابستگی خارجی */
import fs from 'node:fs'

const base = process.env.SMOKE_BASE ?? 'http://localhost:3000'
const results = []

const check = (name, ok) => results.push([name, ok])

async function json(url, init) {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('Content-Type', 'application/json')
  const res = await fetch(base + url, { ...init, headers, redirect: 'follow' })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}: ${String(text).slice(0, 200)}`)
  return data
}

try {
  // 1) دادهٔ نمونه (seed)
  const all = await json('/api/stages')
  const stage1 = all.stages.find((s) => s.id === 1)
  check('seeded: 4 stages', all.stages.length === 4)
  check(
    'stage 1 has 7 demo questions with zones',
    !!stage1 && stage1.questions.length === 7 && stage1.questions[0].zones.length > 0,
  )
  const mcqDemo = stage1?.questions.find((q) => q.type === 'mcq')
  const vidDemo = stage1?.questions.find((q) => q.type === 'video')
  check('demo has mcq question', !!mcqDemo && mcqDemo.correctIndex >= 0 && mcqDemo.options.length >= 3)
  check('demo has video question', !!vidDemo && !!vidDemo.videoUrl && vidDemo.options.length >= 3)

  // 2) آپلود تصویر (multipart)
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const fd = new FormData()
  fd.append('file', new Blob([png], { type: 'image/png' }), 'smoke.png')
  const upRes = await fetch(base + '/api/upload', { method: 'POST', body: fd })
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
} catch (e) {
  check(`unexpected: ${e.message}`, false)
}

for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'} : ${name}`)
process.exit(results.every(([, ok]) => ok) ? 0 : 1)
