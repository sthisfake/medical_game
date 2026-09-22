/* ------------------------------------------------------------------ */
/* مدل دادهٔ سراسری — بین بازی، پنل مدیریت و پایگاه داده مشترک است     */
/* ------------------------------------------------------------------ */

export type ZoneKind = 'ellipse' | 'polygon'

/**
 * ناحیهٔ پاسخ درست — مختصات «نرمال» (۰ تا ۱ نسبت به عرض/ارتفاع تصویر)
 * تا مستقل از اندازهٔ عکس آپلودی ذخیره و استفاده شود.
 */
export interface EllipseZone {
  kind: 'ellipse'
  /** مرکز بیضی (۰..۱ از عرض/ارتفاع) */
  cx: number
  cy: number
  rx: number
  ry: number
  /** چرخش بر حسب درجه (اختیاری، برای عضلات مورب) */
  rotate?: number
  /**
   * آیا این ناحیه «پاسخ درست» است؟
   * فقط ناحیه‌هایی که correct !== false در بازی درست محسوب می‌شوند.
   * (داده‌های قدیمی بدون این فیلد = درست، برای سازگاری.)
   */
  correct?: boolean
}

export interface PolygonZone {
  kind: 'polygon'
  /** گوشه‌ها — [x, y] نرمال (۰..۱) */
  points: Array<[number, number]>
  /** همانند بیضی — پاسخ درست یا گزینهٔ نادرست */
  correct?: boolean
}

export type AnswerZone = EllipseZone | PolygonZone

/**
 * برچسب متنی روی تصویر — بعد از پاسخ‌دادن به سؤال (درست یا نادرست) روی
 * تصویر ظاهر می‌شود؛ مثل «عضلهٔ ماسِتر» با یک خط راهنما به همان نقطه.
 * مختصات «نرمال» (۰..۱ نسبت به عرض/ارتفاع تصویر).
 */
export interface ImageLabel {
  /** متن برچسب */
  text: string
  /** نقطهٔ روی تصویر — ۰..۱ از عرض */
  x: number
  /** نقطهٔ روی تصویر — ۰..۱ از ارتفاع */
  y: number
}

/** نوع سؤال */
export type QuestionType = 'image' | 'mcq' | 'video'

/**
 * زمان نمایش «توضیح آموزشی»:
 *  - always: از لحظهٔ نمایش سؤال (نقش راهنما)
 *  - after:  فقط بعد از پاسخ‌دادن به سؤال — درست، نادرست یا اتمام زمان
 */
export type ExplanationMode = 'always' | 'after'

/**
 * یک سؤال (همان شکلی که از API/دیتابیس به کلاینت می‌رسد)
 *  - image: کلیک روی تصویر (ناحیه‌ها) — اگر چند ناحیهٔ درست باشد، باید همه کلیک شوند
 *  - mcq:   سه یا چهار گزینهٔ متنی، یک پاسخ درست
 *  - video: ویدیو + سه یا چهار گزینهٔ متنی، یک پاسخ درست
 */
export interface Question {
  id: number
  stageId: number
  /** متن سؤال فارسی */
  prompt: string
  /** توضیح آموزشی */
  explanation: string
  /** چه زمانی نمایش داده شود: پیش از پاسخ (راهنما) یا فقط بعد از پاسخ */
  explanationMode: ExplanationMode
  /** آدرس تصویر، مثل /api/uploads/12 (تصویر در دیتابیس ذخیره می‌شود) — فقط برای نوع image */
  image: string
  imageWidth: number
  imageHeight: number
  /** ناحیه(های) پاسخ — برای نوع image؛ ناحیه‌های correct !== false پاسخِ درست‌اند */
  zones: AnswerZone[]
  /**
   * برچسب‌های متنی روی تصویر — اختیاری. اگر پر باشد، پس از پاسخ‌دادن به سؤال
   * (درست یا نادرست) روی تصویر نمایش داده می‌شوند. برای نوع image و mcq.
   */
  labels: ImageLabel[]
  type: QuestionType
  /** گزینه‌های متنی (برای mcq و video) */
  options: string[]
  /** اندیس گزینهٔ درست در options (برای mcq و video) */
  correctIndex: number
  /** آدرس ویدیو (mp4/webm یا لینک YouTube) — فقط برای نوع video */
  videoUrl: string
}

/** یک مرحله به همراه سؤال‌هایش */
export interface Stage {
  id: number
  order: number
  icon: string
  title: string
  subtitle: string
  /** نسبت درستِ تلاش اول لازم برای قبولی (مثلاً ۰.۵) */
  passRatio: number
  questions: Question[]
}

/** آمار یک مرحله یا کل بازی */
export interface StageStats {
  total: number
  firstTryCorrect: number
  secondTryCorrect: number
  mistakes: number
  timedOut: number
}

/** وضعیت لحظه‌ای سؤالِ در حال نمایش */
export interface ActiveQuestion {
  attemptsLeft: number
  status: 'open' | 'solved-first' | 'solved-second' | 'failed'
  failReason: 'none' | 'exhausted' | 'timeout'
  /**
   * تعداد ناحیه‌های درستی که تاکنون کلیک شده‌اند — برای سؤال‌های تصویریِ
   * چندپاسخه (مثلاً عضلهٔ دوطرفه) که باید همهٔ ناحیه‌های درست کلیک شوند.
   */
  foundCorrect: number
}

export type GamePhase = 'start' | 'play' | 'stage-result' | 'final'

export interface StageResult {
  stage: Stage
  passed: boolean
  required: number
  stats: StageStats
}

/* ---------- انواع پنل مدیریت ---------- */

/** فرم ذخیره/ایجاد سؤال (بدون شناسه برای ایجاد) */
export interface QuestionInput {
  stageId: number
  prompt: string
  explanation: string
  explanationMode: ExplanationMode
  image: string
  imageWidth: number
  imageHeight: number
  zones: AnswerZone[]
  labels: ImageLabel[]
  type: QuestionType
  options: string[]
  correctIndex: number
  videoUrl: string
}

export interface StageInput {
  order: number
  icon: string
  title: string
  subtitle: string
  passRatio: number
}

/* ---------- کارنامهٔ پایان آزمون و اطلاع‌رسانی ---------- */

/** سرانجام یک سؤال در کارنامهٔ پایان آزمون */
export type AnswerOutcome = 'first' | 'second' | 'wrong' | 'timeout'

/** یک ردیف از کارنامهٔ پاسخ‌های کاربر */
export interface AnswerLogEntry {
  questionId: number
  prompt: string
  outcome: AnswerOutcome
  /** تعداد تلاش‌های مصرف‌شده */
  attempts: number
}

/**
 * نام و نام خانوادگیِ کاربر — فقط در حافظهٔ همان اجرا نگه داشته می‌شود و
 * هیچ‌جا (نه دیتابیس، نه فایل) ذخیره نمی‌شود؛ فقط در ایمیل نتیجه می‌آید.
 */
export interface StudentName {
  firstName: string
  lastName: string
}

/** جمع‌بندی یک مرحله در کارنامه */
export interface StageReport {
  order: number
  title: string
  stats: StageStats
}

/** بدنهٔ ارسالی به /api/submit برای فرستادن ایمیل نتیجه */
export interface ResultSubmission {
  student: StudentName
  /** شناسهٔ یکتای این اجرا — برای جلوگیری از ارسال تکراری */
  runId: string
  overall: StageStats
  stages: StageReport[]
  answers: AnswerLogEntry[]
  /** زمان پایان آزمون (ISO) */
  finishedAt: string
}

/** پاسخ /api/submit */
export interface SubmitResponse {
  ok: boolean
  sent: boolean
  reason?: string
}

/** پاسخ /api/settings (فقط برای مدیر) */
export interface SettingsResponse {
  /** نشانی تنظیم‌شدهٔ گیرندهٔ نتیجه — خالی یعنی تنظیم نشده */
  notifyEmail: string
  /** آیا ارسال ایمیل روی سرور پیکربندی شده است (کلید API و نشانی فرستنده) */
  mailConfigured: boolean
  /** نتیجهٔ آخرین ارسال آزمایشی (برای نمایش در پنل) */
  lastTest: MailTestResult | null
}

/** نتیجهٔ آخرین ایمیل آزمایشی */
export interface MailTestResult {
  ok: boolean
  at: string
  detail: string
}
