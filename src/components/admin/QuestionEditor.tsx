'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../lib/api'
import { toFa } from '../../lib/format'
import { prepareImageForUpload } from '../../lib/image-resize'
import type { AnswerZone, Question, QuestionInput, QuestionType, Stage } from '../../types'
import { AdminShell } from './AdminShell'
import { ZoneCanvas } from './ZoneCanvas'
import { VideoPlayer } from '../VideoPlayer'
import { Button } from '../ui'

interface QuestionEditorProps {
  questionId?: number
  initialStageId?: number
}

interface QuestionResponse {
  question: Question
}

interface StagesResponse {
  stages: Stage[]
}

interface UploadResponse {
  path: string
}

const QTYPE_LABELS: Record<QuestionType, string> = {
  image: 'تصویری — کلیک روی تصویر',
  mcq: 'چهارگزینه‌ای',
  video: 'ویدیویی',
}

/** ساخت/ویرایش سؤال با سه نوع: تصویری (ناحیهٔ کلیک)، چهارگزینه‌ای، ویدیویی */
export function QuestionEditor({ questionId, initialStageId }: QuestionEditorProps) {
  const router = useRouter()
  const [stages, setStages] = useState<Stage[]>([])
  const [stageId, setStageId] = useState<number>(initialStageId ?? 0)
  const [prompt, setPrompt] = useState('')
  const [explanation, setExplanation] = useState('')

  // نوع سؤال و فیلدهای مخصوص هر نوع
  const [type, setType] = useState<QuestionType>('image')
  const [image, setImage] = useState('')
  const [imageWidth, setImageWidth] = useState(0)
  const [imageHeight, setImageHeight] = useState(0)
  const [zones, setZones] = useState<AnswerZone[]>([])
  const [options, setOptions] = useState<string[]>(['', '', '', ''])
  const [correctIndex, setCorrectIndex] = useState(-1)
  const [videoUrl, setVideoUrl] = useState('')
  const [repoVideos, setRepoVideos] = useState<string[]>([])

  const [busy, setBusy] = useState(false)
  const [videoBusy, setVideoBusy] = useState(false)
  const [uploadNote, setUploadNote] = useState('')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const videoFileRef = useRef<HTMLInputElement>(null)

  const loadStages = useCallback(async () => {
    try {
      const data = await api<StagesResponse>('/api/stages')
      setStages(data.stages)
    } catch (e) {
      setMessage(String(e))
    }
  }, [])

  const loadRepoVideos = useCallback(async () => {
    try {
      const d = await api<{ videos: Array<{ name: string }> }>('/api/videos')
      setRepoVideos((d.videos ?? []).map((v) => v.name))
    } catch {
      setRepoVideos([])
    }
  }, [])

  useEffect(() => {
    void loadStages()
  }, [loadStages])

  // فهرست ویدیوهای داخل پوشهٔ پروژه (public/videos)
  useEffect(() => {
    void loadRepoVideos()
  }, [loadRepoVideos])

  useEffect(() => {
    if (!questionId) return
    api<QuestionResponse>(`/api/questions/${questionId}`)
      .then(({ question }) => {
        setStageId(question.stageId)
        setPrompt(question.prompt)
        setExplanation(question.explanation)
        setType(question.type)
        setImage(question.image)
        setImageWidth(question.imageWidth)
        setImageHeight(question.imageHeight)
        setZones(question.zones)
        const opts = question.options.length > 0 ? question.options : ['', '', '', '']
        setOptions(opts.length >= 3 ? opts : [...opts, '', '', ''])
        setCorrectIndex(question.correctIndex)
        setVideoUrl(question.videoUrl)
      })
      .catch((e) => setMessage(String(e)))
  }, [questionId])

  /** بعد از آپلود، ابعاد طبیعی تصویر خوانده می‌شود */
  const applyUploadedImage = (path: string) => {
    const probe = new window.Image()
    probe.onload = () => {
      setImage(path)
      setImageWidth(probe.naturalWidth)
      setImageHeight(probe.naturalHeight)
    }
    probe.src = path
  }

  const upload = async (file: File) => {
    setBusy(true)
    setMessage('')
    setUploadNote('')
    try {
      // فشرده‌سازی و کوچک‌سازی در مرورگر پیش از آپلود (سقف درخواست Vercel ≈ ۴.۵MB)
      const prepared = await prepareImageForUpload(file)
      setUploadNote(prepared.note)
      const fd = new FormData()
      fd.append('file', prepared.blob, prepared.fileName)
      const data = await api<UploadResponse>('/api/upload', { method: 'POST', body: fd })
      applyUploadedImage(data.path)
    } catch (e) {
      setMessage(String(e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const setOption = (i: number, value: string) =>
    setOptions((o) => o.map((v, j) => (j === i ? value : v)))

  /** آپلود ویدیو به پوشهٔ پروژه (public/videos) — فقط در اجرای محلی */
  const uploadVideo = async (file: File) => {
    setVideoBusy(true)
    setMessage('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await api<{ url: string }>('/api/videos', { method: 'POST', body: fd })
      setVideoUrl(data.url)
      await loadRepoVideos()
    } catch (e) {
      setMessage(String(e))
    } finally {
      setVideoBusy(false)
      if (videoFileRef.current) videoFileRef.current.value = ''
    }
  }

  const addOption = () => {
    if (options.length < 4) setOptions((o) => [...o, ''])
  }

  const removeOption = (i: number) => {
    setOptions((o) => o.filter((_, j) => j !== i))
    setCorrectIndex((c) => {
      if (c === i) return -1
      if (c > i) return c - 1
      return c
    })
  }

  const backTo = () => router.push(stageId ? `/admin/stage/${stageId}` : '/admin')

  const save = async () => {
    if (!stageId) return setMessage('ابتدا مرحله را انتخاب کنید')
    if (!prompt.trim()) return setMessage('متن سؤال را بنویسید')

    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean)

    if (type === 'image') {
      if (!image) return setMessage('تصویر سؤال را آپلود کنید')
      if (zones.length === 0) return setMessage('دست‌کم یک ناحیه روی تصویر رسم کنید')
      if (!zones.some((z) => z.correct !== false))
        return setMessage('یکی از ناحیه‌ها را به‌عنوان «پاسخ درست» علامت بزنید')
    } else {
      if (trimmedOptions.length < 3 || trimmedOptions.length > 4)
        return setMessage('برای سؤال چهارگزینه‌ای، ۳ یا ۴ گزینه وارد کنید')
      if (correctIndex < 0 || correctIndex >= options.length || !options[correctIndex]?.trim())
        return setMessage('گزینهٔ درست را انتخاب کنید')
      if (type === 'video' && !videoUrl.trim())
        return setMessage('آدرس ویدیو (mp4/webm یا لینک YouTube) را وارد کنید')
    }

    const payload: QuestionInput = {
      stageId,
      prompt: prompt.trim(),
      explanation: explanation.trim(),
      image,
      imageWidth,
      imageHeight,
      zones,
      type,
      options: trimmedOptions,
      correctIndex,
      videoUrl: videoUrl.trim(),
    }

    setBusy(true)
    setMessage('')
    try {
      if (questionId) {
        await api(`/api/questions/${questionId}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await api('/api/questions', { method: 'POST', body: JSON.stringify(payload) })
      }
      backTo()
    } catch (e) {
      setMessage(String(e))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!questionId) return
    if (!window.confirm('این سؤال حذف شود؟')) return
    setBusy(true)
    try {
      await api(`/api/questions/${questionId}`, { method: 'DELETE' })
      router.push(`/admin/stage/${stageId}`)
    } catch (e) {
      setMessage(String(e))
      setBusy(false)
    }
  }

  return (
    <AdminShell
      title={questionId ? 'ویرایش سؤال' : 'سؤال جدید'}
      backHref="/admin"
      backLabel="مدیریت مراحل"
    >
      {message && <div className="admin-alert">{message}</div>}

      <div className="editor">
        <div className="editor__form admin-card">
          <div className="field">
            <span>نوع سؤال</span>
            <div className="qtype__switch" role="radiogroup" aria-label="نوع سؤال">
              {(Object.keys(QTYPE_LABELS) as QuestionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  className={`qtype__btn${type === t ? ' qtype__btn--on' : ''}`}
                  onClick={() => setType(t)}
                >
                  {QTYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>مرحله *</span>
            <select value={stageId} onChange={(e) => setStageId(Number(e.target.value))}>
              <option value={0}>— انتخاب مرحله —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.title}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>متن سؤال *</span>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="مثلاً: عضلهٔ ماسِتر در کدام ناحیه قرار دارد؟"
            />
          </label>

          <label className="field">
            <span>توضیح آموزشی (اگر پر باشد، همیشه زیر متن سؤال نمایش داده می‌شود)</span>
            <textarea
              rows={4}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="توضیح کوتاه دربارهٔ پاسخ درست…"
            />
          </label>

          {(type === 'image' || type === 'mcq') && (
            <div className="field">
              <span>{type === 'image' ? 'تصویر سؤال *' : 'تصویر سؤال (نمایشی — قابل کلیک نیست)'}</span>
              <div className="upload-row">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void upload(f)
                  }}
                />
                {busy && <span className="upload-row__busy">در حال آپلود…</span>}
                {image && (
                  <span className="upload-row__ok">
                    ✓ {imageWidth}×{imageHeight}
                  </span>
                )}
              </div>
              {uploadNote && <p className="upload-row__note">{uploadNote}</p>}
              {type === 'mcq' && (
                <p className="zone-editor__hint">
                  تصویر فقط نمایش داده می‌شود و قابل کلیک نیست؛ پاسخ با انتخاب گزینه داده می‌شود.
                </p>
              )}
            </div>
          )}

          <div className="editor__actions">
            <Button onClick={save} disabled={busy}>
              {busy ? 'در حال ذخیره…' : questionId ? 'ذخیرهٔ سؤال' : 'ساخت سؤال'}
            </Button>
            {questionId ? (
              <Button variant="danger" onClick={remove} disabled={busy}>
                حذف سؤال
              </Button>
            ) : null}
            <Button variant="ghost" onClick={backTo}>
              انصراف
            </Button>
          </div>
        </div>

        <div className="editor__zones">
          {type === 'image' && (
            <>
              {image && imageWidth > 0 && imageHeight > 0 ? (
                <div className="admin-card">
                  <h2 className="zone-title">گزینه‌های پاسخ — روی تصویر رسم کنید</h2>
                  <ZoneCanvas
                    zones={zones}
                    onChange={setZones}
                    image={image}
                    width={imageWidth}
                    height={imageHeight}
                  />
                </div>
              ) : (
                <div className="admin-card admin-placeholder">
                  <p>
                    بعد از آپلود تصویر، ناحیهٔ هر گزینه را روی آن رسم کنید؛ سپس از فهرست پایین،
                    گزینه‌های «پاسخ درست» را علامت بزنید.
                  </p>
                </div>
              )}
            </>
          )}

          {type !== 'image' && (
            <>
              {type === 'video' && (
                <div className="admin-card">
                  <h2 className="zone-title">ویدیوی سؤال</h2>

                  <div className="field">
                    <span>افزودن ویدیو به پوشهٔ پروژه (در اجرای محلی)</span>
                    <div className="upload-row">
                      <input
                        ref={videoFileRef}
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void uploadVideo(f)
                        }}
                      />
                      {videoBusy && <span className="upload-row__busy">در حال آپلود…</span>}
                    </div>
                    <p className="zone-editor__hint">
                      فایل در <code>public/videos</code> ذخیره می‌شود؛ برای اجرا روی Vercel همان فایل‌ها را
                      commit و push کنید.
                    </p>
                  </div>

                  {repoVideos.length > 0 && (
                    <div className="field">
                      <span>انتخاب از پوشهٔ پروژه (public/videos)</span>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) setVideoUrl(`/videos/${e.target.value}`)
                        }}
                      >
                        <option value="">— انتخاب ویدیو —</option>
                        {repoVideos.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <p className="zone-editor__hint">
                        ویدیوهای این پوشه همراه برنامه روی Vercel هم استقرار می‌یابند.
                      </p>
                    </div>
                  )}

                  <label className="field">
                    <span>یا آدرس ویدیو (فایل پروژه / آدرس مستقیم / لینک YouTube)</span>
                    <input
                      dir="ltr"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="/videos/video1.mp4 یا https://youtu.be/…"
                    />
                  </label>
                  {videoUrl && (
                    <div className="question__video" style={{ marginTop: '0.9rem' }}>
                      <VideoPlayer url={videoUrl} />
                    </div>
                  )}
                </div>
              )}

              <div className="admin-card">
                <h2 className="zone-title">گزینه‌های پاسخ — یکی را «درست» انتخاب کنید</h2>
                <div className="option-rows">
                  {options.map((opt, i) => (
                    <div key={i} className="option-row">
                      <label className="option-row__radio" title="این گزینه درست است">
                        <input
                          type="radio"
                          name="correctOption"
                          checked={correctIndex === i}
                          onChange={() => setCorrectIndex(i)}
                        />
                        <span>درست</span>
                      </label>
                      <input
                        value={opt}
                        onChange={(e) => setOption(i, e.target.value)}
                        placeholder={`گزینهٔ ${toFa(i + 1)}`}
                      />
                      {options.length > 3 && (
                        <button
                          type="button"
                          className="btn-link btn-link--danger"
                          onClick={() => removeOption(i)}
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {options.length < 4 && (
                  <Button variant="ghost" onClick={addOption}>
                    + افزودن گزینهٔ چهارم
                  </Button>
                )}
                <p className="zone-editor__hint">
                  ۳ یا ۴ گزینه مجاز است؛ گزینهٔ درست با دایرهٔ کنار هر ردیف انتخاب می‌شود.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
