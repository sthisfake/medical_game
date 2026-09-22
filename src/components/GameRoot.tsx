'use client'

import { useEffect, useRef, useState } from 'react'
import { useGameEngine } from '../hooks/useGameEngine'
import type {
  ResultSubmission,
  Stage,
  StageReport,
  StudentName,
  SubmitResponse,
} from '../types'
import { FinalScreen } from './FinalScreen'
import { QuestionScreen } from './QuestionScreen'
import { StageResultScreen } from './StageResultScreen'
import { StartScreen } from './StartScreen'

/* ------------------------------------------------------------------ */
/* بدنهٔ بازی — دادهٔ مراحل از سرور (دیتابیس) به اینجا می‌رسد          */
/*                                                                     */
/* نام کاربر فقط در حافظهٔ همین صفحه می‌ماند و هنگام رسیدن به صفحهٔ     */
/* پایان (گذراندن موفق همهٔ مراحل) یک‌بار به /api/submit فرستاده می‌شود  */
/* تا کارنامه به ایمیل مدیر برود. هیچ‌چیز در دیتابیس ذخیره نمی‌شود.     */
/* ------------------------------------------------------------------ */

export function GameRoot({ stages }: { stages: Stage[] }) {
  const game = useGameEngine(stages)
  const [student, setStudent] = useState<StudentName>({ firstName: '', lastName: '' })
  const [mailSent, setMailSent] = useState(false)
  /** شمارهٔ اجرایی که کارنامه‌اش فرستاده شده — تا دوباره فرستاده نشود */
  const sentRunRef = useRef<number | null>(null)

  const { phase, runId, overall, answers, allStats } = game

  useEffect(() => {
    if (phase !== 'final' || !overall) return
    if (sentRunRef.current === runId) return // همین اجرا قبلاً فرستاده شده
    sentRunRef.current = runId
    setMailSent(false)

    const stageReports: StageReport[] = stages
      .map((stage, i) => ({ stage, stats: allStats[i] }))
      .filter((x) => x.stage.questions.length > 0 && !!x.stats)
      .map((x) => ({ order: x.stage.order, title: x.stage.title, stats: x.stats }))

    const payload: ResultSubmission = {
      student: { firstName: student.firstName.trim(), lastName: student.lastName.trim() },
      runId: `${runId}-${Date.now()}`,
      overall,
      stages: stageReports,
      answers,
      finishedAt: new Date().toISOString(),
    }

    let cancelled = false
    fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SubmitResponse | null) => {
        if (!cancelled && data?.sent) setMailSent(true)
      })
      .catch(() => {
        /* ارسال ناموفق نباید تجربهٔ کاربر را خراب کند */
      })

    return () => {
      cancelled = true
    }
  }, [phase, runId, overall, answers, allStats, stages, student])

  switch (game.phase) {
    case 'start':
      return (
        <StartScreen
          stages={stages}
          totalQuestions={stages.reduce((n, s) => n + s.questions.length, 0)}
          student={student}
          onStudentChange={setStudent}
          onStart={game.startGame}
        />
      )

    case 'play':
      if (!game.stage || !game.question) return null
      return (
        <QuestionScreen
          /* کلید یکتا برای هر سؤال: با تغییر سؤال، نمونهٔ تازه‌ای ساخته
             می‌شود تا زمان و وضعیت سؤال پیشین باقی نماند. */
          key={`${game.stage.id}:${game.questionIndex}:${game.question.id}`}
          stage={game.stage}
          question={game.question}
          questionIndex={game.questionIndex}
          active={game.active}
          stats={game.stats}
          onAttemptCorrect={game.attempt}
          onExpire={game.expire}
          onNext={game.next}
          onExit={game.backToStart}
        />
      )

    case 'stage-result':
      if (!game.stageResult) return null
      return <StageResultScreen result={game.stageResult} onContinue={game.continueAfterStage} />

    case 'final':
      if (!game.overall) return null
      return (
        <FinalScreen
          overall={game.overall}
          mailSent={mailSent}
          onRestart={game.startGame}
          onHome={game.backToStart}
        />
      )
  }
}
