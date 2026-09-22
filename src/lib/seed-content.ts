import fs from 'node:fs'
import path from 'node:path'
import type { AnswerZone, ImageLabel, QuestionType } from '../types'

/* ------------------------------------------------------------------ */
/* محتوای دادهٔ نمونه — مستقل از دیتابیس؛ هر دو بک‌اند (SQLite/Postgres) */
/* همین داده‌ها را در اولین اجرا seed می‌کنند.                         */
/* ------------------------------------------------------------------ */

export const DEMO_IMAGE_W = 300
export const DEMO_IMAGE_H = 360

function nX(px: number): number {
  return px / DEMO_IMAGE_W
}
function nY(px: number): number {
  return px / DEMO_IMAGE_H
}

// ناحیه‌ها دورِ همان شکل‌های شماتیک demo-face.svg
const frontalis: AnswerZone = { kind: 'ellipse', cx: nX(150), cy: nY(82), rx: nX(80), ry: nY(32), correct: true }
const occuliL: AnswerZone = { kind: 'ellipse', cx: nX(110), cy: nY(142), rx: nX(21), ry: nY(14), correct: true }
const occuliR: AnswerZone = { kind: 'ellipse', cx: nX(190), cy: nY(142), rx: nX(21), ry: nY(14), correct: false }
const zygL: AnswerZone = { kind: 'ellipse', cx: nX(100), cy: nY(196), rx: nX(26), ry: nY(16), rotate: 14, correct: true }
const zygR: AnswerZone = { kind: 'ellipse', cx: nX(200), cy: nY(196), rx: nX(26), ry: nY(16), rotate: -14, correct: false }
const massL: AnswerZone = { kind: 'ellipse', cx: nX(86), cy: nY(254), rx: nX(22), ry: nY(38), rotate: 6, correct: true }
const massR: AnswerZone = { kind: 'ellipse', cx: nX(214), cy: nY(254), rx: nX(22), ry: nY(38), rotate: -6, correct: true }
const oris: AnswerZone = { kind: 'ellipse', cx: nX(150), cy: nY(226), rx: nX(40), ry: nY(24), correct: true }

export interface DemoQuestionSeed {
  prompt: string
  explanation: string
  zones: AnswerZone[]
  /** برچسب‌های روی تصویر — بعد از پاسخ‌دادن در بازی ظاهر می‌شوند */
  labels?: ImageLabel[]
  type?: QuestionType
  options?: string[]
  correctIndex?: number
  videoUrl?: string
}

export interface DemoStageSeed {
  order: number
  icon: string
  title: string
  subtitle: string
  passRatio: number
  questions: DemoQuestionSeed[]
}

export const demoStage: DemoStageSeed = {
  order: 1,
  icon: '💪',
  title: 'مرحلهٔ ۱ — عضلات صورت',
  subtitle: 'نمونهٔ نمایشی (تصاویر واقعی از پنل مدیریت اضافه می‌شوند)',
  passRatio: 0.5,
  questions: [
    {
      prompt:
        'عضلهٔ ماسِتر — مهم‌ترین عضلهٔ جویدن — در کدام ناحیه‌ها قرار دارد؟ (دو ناحیهٔ درست)',
      explanation:
        'ماسِتر قوی‌ترین عضلهٔ جویدن است و در دو طرف صورت (چپ و راست) وجود دارد. از قوس زیگوماتیک (استخوان گونه) شروع می‌شود و به زاویهٔ فک می‌چسبد؛ هر دو طرف را روی تصویر بیابید.',
      zones: [massL, massR],
      labels: [
        { text: 'ماسِتر (چپ)', x: 86 / 300, y: 254 / 360 },
        { text: 'ماسِتر (راست)', x: 214 / 300, y: 254 / 360 },
      ],
    },
    {
      prompt: 'عضلهٔ دور چشم (اوربیکولاریس اوکولی) کدام است؟',
      explanation:
        'اوربیکولاریس اوکولی به‌صورت حلقه‌ای دور هر چشم قرار دارد و کارش بستن چشم و پلک‌زدن است؛ همان عضله‌ای که هنگام چشمک زدن کار می‌کند.',
      zones: [occuliL, occuliR],
    },
    {
      prompt: 'کدام ناحیه، عضلهٔ زیگوماتیکوس ماژور (عضلهٔ خنده) است؟',
      explanation:
        'زیگوماتیکوس ماژور از استخوان گونه شروع شده و به گوشهٔ دهان می‌چسبد؛ هنگام خندیدن گوشهٔ لب را به بالا و بیرون می‌کشد.',
      zones: [zygL, zygR],
    },
    {
      prompt: 'عضلهٔ فرونتالیس (عضلهٔ پیشانی) در کدام ناحیه قرار دارد؟',
      explanation:
        'فرونتالیس زیر پوست پیشانی قرار دارد؛ ابروها را بالا می‌برد و باعث ایجاد چین‌های افقی پیشانی هنگام تعجب می‌شود.',
      zones: [frontalis],
    },
    {
      prompt: 'عضلهٔ اطراف دهان (اوربیکولاریس اوریس) کدام است؟',
      explanation:
        'اوربیکولاریس اوریس به‌صورت حلقه دور دهان را احاطه کرده است؛ دهان را می‌بندد (مثل بوسه و سوت زدن) و در تکلم نقش مهمی دارد.',
      zones: [oris],
    },
    {
      type: 'mcq',
      prompt: 'کدام عضله وظیفهٔ بالا بردن گوشهٔ لب هنگام خندیدن را دارد؟',
      explanation:
        'زیگوماتیکوس ماژور از استخوان گونه به گوشهٔ دهان می‌رسد و هنگام خنده گوشهٔ لب را به بالا و بیرون می‌کشد.',
      zones: [],
      options: ['عضلهٔ زیگوماتیکوس ماژور', 'عضلهٔ فرونتالیس', 'عضلهٔ اوریس', 'عضلهٔ تمپورالیس'],
      correctIndex: 0,
    },
    {
      type: 'video',
      prompt:
        'ویدیوی نمونه را پخش کنید و ببینید؛ کدام عضله در این ویدیو نمایش داده شده است؟',
      explanation:
        'این یک ویدیوی نمونه است؛ از پنل مدیریت، ویدیوی آموزشی واقعی خود را جایگزین کنید و سؤال مرتبط را طرح کنید.',
      zones: [],
      videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      options: ['عضلهٔ ماسِتر', 'عضلهٔ فرونتالیس', 'عضلهٔ اوریس'],
      correctIndex: 0,
    },
  ],
}

export const demoSkeletonStages: Array<{ order: number; icon: string; title: string }> = [
  { order: 2, icon: '🩸', title: 'مرحلهٔ ۲ — عروق صورت' },
  { order: 3, icon: '🧠', title: 'مرحلهٔ ۳ — موضوع بعدی' },
  { order: 4, icon: '🗺️', title: 'مرحلهٔ ۴ — موضوع بعدی' },
]

export function demoImageBytes(): Buffer {
  return fs.readFileSync(path.join(process.cwd(), 'src', 'assets', 'images', 'demo-face.svg'))
}
