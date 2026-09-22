/* ------------------------------------------------------------------ */
/* آزمون سرتاسری در مرورگر واقعی: یک اجرای کامل بازی + ارسال کارنامه    */
/*                                                                     */
/*   npm run test:e2e                          (سرور روی ۳۰۲۳ روشن باشد)*/
/*   BASE=http://localhost:3000 node scripts/e2e-play.mjs               */
/*   MIX=1 npm run test:e2e                    (پاسخ‌های ترکیبی)        */
/*                                                                     */
/* چه چیزهایی را می‌سنجد:                                               */
/*  • دکمهٔ شروع تا پر نشدن نام و نام خانوادگی غیرفعال است                */
/*  • پس از گذراندن هر ۲۷ سؤال، دقیقاً یک درخواست به /api/submit می‌رود  */
/*  • محتوای همان درخواست: نام، یک سطر برای هر سؤال، نتیجهٔ هر سؤال و    */
/*    شمارهٔ تلاش‌ها، و آماری که باید با بازیِ انجام‌شده بخواند            */
/*  • اجرای نیمه‌کاره هیچ درخواستی نمی‌فرستد                             */
/*  • با MIX=1 سؤال‌ها به‌صورت تلاش دوم/نادرست/اتمام‌زمان پاسخ داده        */
/*    می‌شوند؛ این حالت رگرسیونِ یک اشکال واقعی است: سؤالی که بلافاصله    */
/*    پس از سؤالِ بی‌پاسخ می‌آمد، پیش‌تر خودبه‌خود بی‌پاسخ رد می‌شد.        */
/*                                                                     */
/* این آزمون چیزی ذخیره نمی‌کند؛ نشانی گیرنده را موقتاً عوض و در پایان   */
/* به مقدار اول بازمی‌گرداند. Chrome در مسیر پیش‌فرض ویندوز لازم است.    */
/* ------------------------------------------------------------------ */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const PORT = 9271
const BASE = process.env.BASE ?? 'http://localhost:3023'
const PROFILE = path.join(process.cwd(), `.chrome-profile-e2e-${PORT}`)
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, ok, detail = '') => {
  results.push([name, ok])
  console.log(`${ok ? 'PASS' : 'FAIL'} : ${name}${detail ? ` — ${detail}` : ''}`)
}

/* با MIX=1 یک اجرا با پاسخ‌های ترکیبی بازی می‌شود تا ثبت «تلاش دوم»،
   «نادرست» و «اتمام زمان» هم آزموده شود — و مهم‌تر: بررسی شود که سؤالِ
   بعد از یک سؤالِ بی‌پاسخ، خودش باز و پاسخ‌پذیر باشد. */
const MIX = process.env.MIX === '1'
/** ایندکس سراسری سؤال (از صفر) → شیوهٔ پاسخ‌دهی */
const MIX_PLAN = { 1: 'second', 2: 'timeout', 3: 'wrong' }

/* --------------------------- هندسهٔ نواحی --------------------------- */
function pointInZone(z, x, y, w, h) {
  if (z.kind === 'ellipse') {
    const cx = z.cx * w, cy = z.cy * h, rx = z.rx * w, ry = z.ry * h
    if (rx <= 0 || ry <= 0) return false
    let dx = x - cx, dy = y - cy
    if (z.rotate) {
      const a = (-z.rotate * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
      const nx = dx * c - dy * s
      dy = dx * s + dy * c
      dx = nx
    }
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1
  }
  const pts = z.points
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if (
      yi * h > y !== yj * h > y &&
      x < ((xj - xi) * (y - yi * h) * h) / ((yj - yi) * h) + xi * w
    ) {
      inside = !inside
    }
  }
  return inside
}

function pickPoint(zones, target, w, h, attempt = 0) {
  const z = zones[target]
  const base =
    z.kind === 'ellipse'
      ? { x: z.cx * w, y: z.cy * h }
      : {
          x: (z.points.reduce((s, p) => s + p[0], 0) / z.points.length) * w,
          y: (z.points.reduce((s, p) => s + p[1], 0) / z.points.length) * h,
        }
  const offsets = [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35], [0.25, 0.25], [-0.25, -0.25]]
  const o = offsets[Math.min(attempt, offsets.length - 1)]
  const rx = z.kind === 'ellipse' ? z.rx * w : w * 0.05
  const ry = z.kind === 'ellipse' ? z.ry * h : h * 0.05
  const p = { x: base.x + o[0] * rx, y: base.y + o[1] * ry }
  if (
    zones.some((zz, i) => i !== target && pointInZone(zz, p.x, p.y, w, h)) &&
    attempt < offsets.length - 1
  ) {
    return pickPoint(zones, target, w, h, attempt + 1)
  }
  return p
}

/* ------------------------------- CDP ------------------------------- */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.handlers = new Map()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
        return
      }
      if (m.method && this.handlers.has(m.method)) {
        for (const fn of this.handlers.get(m.method)) fn(m.params)
      }
    })
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(fn)
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }
  async clickAt(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      })
    }
  }
  /** کلیک واقعی روی مرکز عنصری که با متن دکمه پیدا می‌شود */
  async clickButton(text) {
    const box = await this.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(text)}));
      if (!b || b.disabled) return 'null';
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`)
    if (box === 'null') return false
    const { x, y } = JSON.parse(box)
    await sleep(120)
    await this.clickAt(x, y)
    return true
  }
}

async function waitFor(fn, timeout = 15000, step = 150) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > timeout) return null
    await sleep(step)
  }
}

const api = async (p, init = {}) => {
  const res = await fetch(BASE + p, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: AUTH,
      ...(init.headers ?? {}),
    },
  })
  return res.json()
}

/* ----------------------------- اجرای آزمون ----------------------------- */
const stages = (await api('/api/stages')).stages
const plan = stages
  .map((s, i) => ({ index: i, title: s.title, questions: s.questions }))
  .filter((s) => s.questions.length > 0)
const totalQuestions = plan.reduce((n, s) => n + s.questions.length, 0)
console.log(`برنامه: ${plan.length} مرحله، ${totalQuestions} سؤال`)

const settingsBefore = await api('/api/settings')
const TEST_EMAIL = 'e2e-result@example.com'
await api('/api/settings', {
  method: 'PUT',
  body: JSON.stringify({ notifyEmail: TEST_EMAIL }),
})
console.log(`گیرندهٔ آزمایشی: ${TEST_EMAIL} | پیکربندی سرور: ${settingsBefore.mailConfigured}`)
check('server reports mail configured (fake key present)', settingsBefore.mailConfigured === true)

fs.rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const submitRequests = []
const submitResponses = []
let cdp

try {
  const target = await waitFor(async () => {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    } catch {
      return null
    }
  }, 20000)
  if (!target) throw new Error('CDP در دسترس نشد')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  // در حالت headless صفحه ممکن است تمرکز نداشته باشد و درج متن گم شود
  try {
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  } catch {
    /* ignore */
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  cdp.on('Network.requestWillBeSent', (p) => {
    if (p.request?.url?.endsWith('/api/submit')) {
      submitRequests.push({ requestId: p.requestId, postData: p.request.postData ?? '' })
    }
  })
  cdp.on('Network.responseReceived', (p) => {
    if (p.response?.url?.endsWith('/api/submit')) {
      submitResponses.push({ requestId: p.requestId, status: p.response.status })
    }
  })

  /** تایپ واقعی در یک ورودی: کلیک → بررسی تمرکز → درج متن → بررسی مقدار */
  async function typeInto(sel, text) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const box = JSON.parse(
        await cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
          el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
          return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) })()`),
      )
      await cdp.clickAt(box.x, box.y)
      await sleep(220)
      const focused = await cdp.eval(
        `document.activeElement === document.querySelector(${JSON.stringify(sel)})`,
      )
      if (!focused) continue
      await cdp.send('Input.insertText', { text })
      await sleep(220)
      const value = await cdp.eval(`document.querySelector(${JSON.stringify(sel)}).value`)
      if (value === text) return true
    }
    return false
  }

  /* ---------------- صفحهٔ شروع: نام و نام خانوادگی ---------------- */
  await cdp.send('Page.navigate', { url: BASE + '/' })
  await waitFor(() => cdp.eval(`!!document.querySelector('.hero__form')`))

  const startDisabled = await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('شروع آزمون'));
    return b ? b.disabled : null })()`)
  check('start button is disabled before the name is entered', startDisabled === true)

  // پر کردن نام و نام خانوادگی با ورودی واقعی
  const typedFirst = await typeInto('.hero__form input[autocomplete="given-name"]', 'سارا')
  const typedLast = await typeInto('.hero__form input[autocomplete="family-name"]', 'محمدی')
  check(
    'both name fields accept real typing',
    typedFirst && typedLast,
    `first=${typedFirst} last=${typedLast}`,
  )

  const typed = JSON.parse(
    await cdp.eval(`(() => {
      const f = document.querySelector('.hero__form input[autocomplete="given-name"]');
      const l = document.querySelector('.hero__form input[autocomplete="family-name"]');
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('شروع آزمون'));
      return JSON.stringify({ first: f.value, last: l.value, disabled: b.disabled }) })()`),
  )
  check(
    'name fields accept typing and enable the start button',
    typed.first === 'سارا' && typed.last === 'محمدی' && typed.disabled === false,
    `${typed.first} ${typed.last} | disabled=${typed.disabled}`,
  )

  await cdp.clickButton('شروع آزمون')
  await sleep(900)

  /* ---------------------- پاسخ به همهٔ سؤال‌ها ---------------------- */
  let answered = 0
  for (const stage of plan) {
    for (let qi = 0; qi < stage.questions.length; qi += 1) {
      const q = stage.questions[qi]
      // پایان گذار: متن سؤال باید دقیقاً همان سؤال مورد انتظار باشد، وگرنه
      // کلیک‌ها روی DOM سؤال قبلی می‌نشینند و بی‌اثر می‌شوند.
      const arrived = await waitFor(
        () =>
          cdp.eval(
            `document.querySelector('.question__prompt')?.textContent === ${JSON.stringify(q.prompt)}`,
          ),
        15000,
        200,
      )
      if (!arrived) throw new Error(`سؤال ${answered + 1} بارگذاری نشد (متن مطابقت نداشت)`)
      const ready = await waitFor(
        () =>
          cdp.eval(
            `!!document.querySelector('.anatomy img, .option')`,
          ),
        15000,
      )
      if (!ready) throw new Error(`اجزای سؤال ${answered + 1} بارگذاری نشد`)
      await sleep(250)

      const mode = MIX ? MIX_PLAN[answered] : undefined
      /** کلیک روی گزینه‌ای که درست نیست */
      const clickWrongOption = async () => {
        const wrongIndex = q.correctIndex === 0 ? 1 : 0
        const box = JSON.parse(
          await cdp.eval(`(() => {
            const b = document.querySelectorAll('.option')[${wrongIndex}];
            b.scrollIntoView({ block: 'center' });
            const r = b.getBoundingClientRect();
            return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) })()`),
        )
        await sleep(200)
        await cdp.clickAt(box.x, box.y)
        await sleep(450)
      }
      const clickCorrectOption = async () => {
        const box = JSON.parse(
          await cdp.eval(`(() => {
            const b = document.querySelectorAll('.option')[${q.correctIndex}];
            b.scrollIntoView({ block: 'center' });
            const r = b.getBoundingClientRect();
            return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) })()`),
        )
        await sleep(200)
        await cdp.clickAt(box.x, box.y)
        await sleep(450)
      }

      if (mode === 'timeout') {
        // بدون پاسخ می‌مانیم تا زمان تمام شود؛ فقط بنر «زمان پاسخ به پایان رسید»
        // نشانهٔ واقعی اتمام زمان است (ظرف feedback از ابتدا در صفحه هست).
        const revealed = await waitFor(
          () =>
            cdp.eval(
              `(() => { const el = document.querySelector('.feedback__banner--bad');
                 return !!el && el.textContent.includes('زمان پاسخ به پایان رسید') })()`,
            ),
          90000,
          1000,
        )
        check('the question times out and the answer is revealed', revealed === true)
      } else if (q.type === 'image') {
        const w = q.imageWidth
        const h = q.imageHeight
        const correct = q.zones.map((z, i) => (z.correct !== false ? i : -1)).filter((i) => i >= 0)
        for (const idx of correct) {
          await cdp.eval(`(() => { const el = document.querySelector('.anatomy');
            const bar = document.querySelector('.scorebar-wrap')?.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            if (bar && r.bottom > bar.top) window.scrollBy(0, r.bottom - bar.top + 14);
            return true })()`)
          await sleep(260)
          const ibox = JSON.parse(
            await cdp.eval(`(() => { const r = document.querySelector('.anatomy').getBoundingClientRect();
              return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }) })()`),
          )
          let clicked = false
          for (let attempt = 0; attempt < 9 && !clicked; attempt += 1) {
            const p = pickPoint(q.zones, idx, w, h, attempt)
            const cx = ibox.x + (p.x / w) * ibox.w
            const cy = ibox.y + (p.y / h) * ibox.h
            const clear = await cdp.eval(
              `(() => { const el = document.elementFromPoint(${cx}, ${cy}); return !!el && !!el.closest('.anatomy') })()`,
            )
            if (clear) {
              await cdp.clickAt(cx, cy)
              clicked = true
            }
          }
          if (!clicked) throw new Error(`کلیک روی ناحیهٔ درست سؤال ${answered + 1} انجام نشد`)
          await sleep(320)
        }
      } else if (mode === 'wrong') {
        // دو پاسخ نادرست → سؤال ناموفق می‌شود
        await clickWrongOption()
        await clickWrongOption()
      } else {
        if (mode === 'second') await clickWrongOption()
        await clickCorrectOption()
      }

      answered += 1
      // ابتدا مطمئن شو دکمهٔ ادامه ظاهر شده، بعد کلیک کن
      const advanced = await waitFor(async () => {
        const present = await cdp.eval(
          `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('سؤال بعدی'))`,
        )
        if (!present) return false
        return await cdp.clickButton('سؤال بعدی')
      }, 15000, 400)
      if (!advanced) throw new Error(`دکمهٔ ادامه پس از سؤال ${answered} پیدا نشد`)
      await sleep(500)
    }

    // پس از آخرین سؤال هر مرحله صفحهٔ نتیجه می‌آید
    const stageContinue = await waitFor(async () => cdp.clickButton('رفتن به مرحلهٔ بعد'), 12000, 400)
    if (!stageContinue) throw new Error(`ادامهٔ مرحلهٔ «${stage.title}» پیدا نشد`)
    await sleep(700)
  }

  const finalShown = await waitFor(
    async () =>
      (await cdp.eval(
        `!!document.querySelector('.result__title') && document.querySelector('.result__title').textContent.includes('پایان')`,
      )) === true,
    20000,
    400,
  )
  check(`finished all ${totalQuestions} questions and reached the final screen`, finalShown === true, `پاسخ‌داده‌شده: ${answered}`)

  /* --------------------- بررسی درخواست ارسال کارنامه --------------------- */
  await waitFor(async () => submitResponses.length > 0, 15000, 300)
  for (const r of submitResponses) {
    try {
      const body = await cdp.send('Network.getResponseBody', { requestId: r.requestId })
      r.body = body.body
    } catch {
      r.body = ''
    }
  }

  check('exactly one submit request for one finished run', submitRequests.length === 1, `${submitRequests.length}`)
  check('exactly one submit response', submitResponses.length === 1)

  const payload = submitRequests[0]?.postData ? JSON.parse(submitRequests[0].postData) : null
  check('payload carries the typed name', payload?.student?.firstName === 'سارا' && payload?.student?.lastName === 'محمدی')
  check(
    `payload carries one row per question (${totalQuestions})`,
    payload?.answers?.length === totalQuestions,
    `${payload?.answers?.length}`,
  )
  const outcomeCounts = (payload?.answers ?? []).reduce((acc, a) => {
    acc[a.outcome] = (acc[a.outcome] ?? 0) + 1
    return acc
  }, {})
  if (MIX) {
    check(
      'logged outcomes match the played strategy (second / wrong / timeout)',
      outcomeCounts.first === totalQuestions - 3 &&
        outcomeCounts.second === 1 &&
        outcomeCounts.wrong === 1 &&
        outcomeCounts.timeout === 1,
      JSON.stringify(outcomeCounts),
    )
    check(
      'overall counts match the mixed run',
      payload?.overall?.total === totalQuestions &&
        payload?.overall?.firstTryCorrect === totalQuestions - 3 &&
        payload?.overall?.secondTryCorrect === 1 &&
        payload?.overall?.mistakes === 2 &&
        payload?.overall?.timedOut === 1,
      JSON.stringify(payload?.overall),
    )
    const attempts = (payload?.answers ?? []).map((a) => a.attempts)
    check(
      'attempts used recorded per question',
      attempts.filter((n) => n === 2).length === 2 && attempts.includes(0),
      JSON.stringify(attempts),
    )
  } else {
    check(
      'all answers logged as first-try correct',
      outcomeCounts.first === totalQuestions,
      JSON.stringify(outcomeCounts),
    )
    check(
      'payload overall matches the log',
      payload?.overall?.total === totalQuestions &&
        payload?.overall?.firstTryCorrect === totalQuestions,
      JSON.stringify(payload?.overall),
    )
  }
  check('payload carries per-stage report', Array.isArray(payload?.stages) && payload.stages.length === plan.length, `${payload?.stages?.length}`)

  const responseBody = submitResponses[0]?.body ? JSON.parse(submitResponses[0].body) : null
  check(
    'server attempted a real Brevo send (not "not-configured")',
    typeof responseBody?.reason === 'string' && responseBody.reason.startsWith('brevo-'),
    JSON.stringify(responseBody),
  )
  check('server reported the attempt as not sent', responseBody?.sent === false)

  /* ---------------- اجرای نیمه‌کاره هیچ ایمیلی نمی‌فرستد ---------------- */
  await cdp.clickButton('بازگشت به صفحهٔ نخست')
  await waitFor(() => cdp.eval(`!!document.querySelector('.hero__form')`))
  const nameKept = await cdp.eval(
    `document.querySelector('.hero__form input[autocomplete="given-name"]').value`,
  )
  check('name is kept after returning home', nameKept === 'سارا', nameKept)

  await cdp.clickButton('شروع آزمون')
  await waitFor(() => cdp.eval(`!!document.querySelector('.anatomy img, .option')`))
  await sleep(500)
  await cdp.clickButton('خروج')
  await waitFor(() => cdp.eval(`!!document.querySelector('.hero__form')`))
  await sleep(1200)
  check(
    'an abandoned run sends nothing',
    submitRequests.length === 1,
    `${submitRequests.length} درخواست`,
  )
} catch (e) {
  check(`unexpected: ${e.message}`, false)
} finally {
  try {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ notifyEmail: settingsBefore.notifyEmail }),
    })
    const now = await api('/api/settings')
    console.log(
      `\nبازگرداندن تنظیمات: ${now.notifyEmail === settingsBefore.notifyEmail ? 'درست ✅' : 'ناموفق ❌'}`,
    )
  } catch (e) {
    console.log(`بازگرداندن تنظیمات ناموفق: ${e.message}`)
  }
  try {
    await cdp?.send('Browser.close')
  } catch {
    /* ignore */
  }
  await sleep(400)
  chrome.kill()
}

const failed = results.filter(([, ok]) => !ok).length
console.log(`\n${results.length - failed}/${results.length} بررسی موفق`)
process.exit(failed === 0 ? 0 : 1)
