'use client'

import { useMemo, useReducer } from 'react'
import { CONFIG } from '../config'
import type {
  ActiveQuestion,
  GamePhase,
  Question,
  Stage,
  StageResult,
  StageStats,
} from '../types'

/* ------------------------------------------------------------------ */
/* هستهٔ منطق بازی                                                     */
/*                                                                     */
/* قوانین:                                                             */
/*  - هر سؤال ۲ فرصت پاسخ دارد (کلیک روی هر نقطهٔ تصویر)               */
/*  - درست (داخل ناحیهٔ پاسخ) در تلاش اول → امتیاز قبولی               */
/*  - درست در تلاش دوم → فقط نمایش                                    */
/*  - دو بار اشتباه یا اتمام وقت → سؤال غلط + نمایش پاسخ درست و توضیح   */
/*  - قبولی هر مرحله: درستِ تلاش اول ≥ passRatio × تعداد سؤال           */
/*  - شکست مرحله → شروع دوباره از مرحلهٔ ۱                            */
/* ------------------------------------------------------------------ */

interface EngineState {
  phase: GamePhase
  stageIndex: number
  questionIndex: number
  active: ActiveQuestion
  stats: StageStats[]
  stageResult: StageResult | null
  overall: StageStats | null
}

type Action =
  | { type: 'START' }
  | { type: 'BACK_TO_START' }
  | { type: 'ATTEMPT'; correct: boolean }
  | { type: 'EXPIRE' }
  | { type: 'NEXT' }
  | { type: 'STAGE_CONTINUE' }

const freshActive = (): ActiveQuestion => ({
  attemptsLeft: CONFIG.maxAttempts,
  status: 'open',
  failReason: 'none',
  foundCorrect: 0,
})

const emptyStats = (total: number): StageStats => ({
  total,
  firstTryCorrect: 0,
  secondTryCorrect: 0,
  mistakes: 0,
  timedOut: 0,
})

const runStats = (stages: Stage[]): StageStats[] =>
  stages.map((s) => emptyStats(s.questions.length))

const freshRun = (phase: GamePhase, stages: Stage[]): EngineState => ({
  phase,
  stageIndex: 0,
  questionIndex: 0,
  active: freshActive(),
  stats: runStats(stages),
  stageResult: null,
  overall: null,
})

const sumStats = (all: StageStats[]): StageStats =>
  all.reduce<StageStats>(
    (acc, s) => ({
      total: acc.total + s.total,
      firstTryCorrect: acc.firstTryCorrect + s.firstTryCorrect,
      secondTryCorrect: acc.secondTryCorrect + s.secondTryCorrect,
      mistakes: acc.mistakes + s.mistakes,
      timedOut: acc.timedOut + s.timedOut,
    }),
    emptyStats(0),
  )

const bumpStat = (stats: StageStats[], index: number, field: keyof StageStats): StageStats[] => {
  const target = stats[index]
  const copy = stats.slice()
  copy[index] = { ...target, [field]: target[field] + 1 }
  return copy
}

const makeReducer = (stages: Stage[]) =>
  (state: EngineState, action: Action): EngineState => {
    switch (action.type) {
      case 'START':
        return freshRun('play', stages)

      case 'BACK_TO_START':
        return freshRun('start', stages)

      case 'ATTEMPT': {
        if (state.phase !== 'play' || state.active.status !== 'open') return state
        const firstTry = state.active.attemptsLeft === CONFIG.maxAttempts
        // چند ناحیهٔ درست برای سؤال‌های تصویری: باید همهٔ ناحیه‌های درست کلیک شوند
        const q = stages[state.stageIndex].questions[state.questionIndex]
        const requiredCorrect =
          q.type === 'image'
            ? Math.max(1, q.zones.filter((z) => z.correct !== false).length)
            : 1

        if (action.correct) {
          const found = state.active.foundCorrect + 1
          // هنوز همهٔ ناحیه‌های درست کلیک نشده — سؤال باز می‌ماند
          if (found < requiredCorrect) {
            return { ...state, active: { ...state.active, foundCorrect: found } }
          }
          const status: ActiveQuestion['status'] = firstTry ? 'solved-first' : 'solved-second'
          return {
            ...state,
            active: { ...state.active, foundCorrect: found, status },
            stats: bumpStat(state.stats, state.stageIndex, firstTry ? 'firstTryCorrect' : 'secondTryCorrect'),
          }
        }

        const attemptsLeft = state.active.attemptsLeft - 1
        if (attemptsLeft === 0) {
          return {
            ...state,
            active: { ...state.active, attemptsLeft, status: 'failed', failReason: 'exhausted' },
            stats: bumpStat(state.stats, state.stageIndex, 'mistakes'),
          }
        }
        return { ...state, active: { ...state.active, attemptsLeft } }
      }

      case 'EXPIRE': {
        if (state.phase !== 'play' || state.active.status !== 'open') return state
        return {
          ...state,
          active: { ...state.active, status: 'failed', failReason: 'timeout' },
          stats: bumpStat(
            bumpStat(state.stats, state.stageIndex, 'mistakes'),
            state.stageIndex,
            'timedOut',
          ),
        }
      }

      case 'NEXT': {
        if (state.phase !== 'play') return state
        const stage = stages[state.stageIndex]
        const nextIndex = state.questionIndex + 1

        if (nextIndex < stage.questions.length) {
          return { ...state, questionIndex: nextIndex, active: freshActive() }
        }

        const stats = state.stats[state.stageIndex]
        const required = Math.ceil(stats.total * stage.passRatio)
        const passed = stats.firstTryCorrect >= required
        return {
          ...state,
          phase: 'stage-result',
          active: freshActive(),
          stageResult: { stage, passed, required, stats },
        }
      }

      case 'STAGE_CONTINUE': {
        if (state.phase !== 'stage-result' || !state.stageResult) return state
        if (!state.stageResult.passed) return freshRun('play', stages)

        const nextIndex = state.stageIndex + 1
        const nextStage: Stage | undefined = stages[nextIndex]
        if (!nextStage || nextStage.questions.length === 0) {
          return { ...state, phase: 'final', overall: sumStats(state.stats) }
        }

        return {
          ...state,
          phase: 'play',
          stageIndex: nextIndex,
          questionIndex: 0,
          active: freshActive(),
          stageResult: null,
        }
      }
    }
  }

export interface GameEngine {
  phase: GamePhase
  stage: Stage | null
  question: Question | null
  questionIndex: number
  totalQuestions: number
  active: ActiveQuestion
  stats: StageStats
  stageResult: StageResult | null
  overall: StageStats | null
  startGame: () => void
  backToStart: () => void
  attempt: (correct: boolean) => void
  expire: () => void
  next: () => void
  continueAfterStage: () => void
}

export function useGameEngine(stages: Stage[]): GameEngine {
  const [state, dispatch] = useReducer(
    useMemo(() => makeReducer(stages), [stages]),
    stages,
    (s) => freshRun('start', s),
  )

  const stage = state.phase === 'start' ? null : stages[state.stageIndex] ?? null
  const question =
    state.phase === 'play' && stage ? stage.questions[state.questionIndex] ?? null : null

  return {
    phase: state.phase,
    stage,
    question,
    questionIndex: state.questionIndex,
    totalQuestions: stage ? stage.questions.length : 0,
    active: state.active,
    stats: state.stageIndex < state.stats.length ? state.stats[state.stageIndex] : emptyStats(0),
    stageResult: state.stageResult,
    overall: state.overall,
    startGame: () => dispatch({ type: 'START' }),
    backToStart: () => dispatch({ type: 'BACK_TO_START' }),
    attempt: (correct: boolean) => dispatch({ type: 'ATTEMPT', correct }),
    expire: () => dispatch({ type: 'EXPIRE' }),
    next: () => dispatch({ type: 'NEXT' }),
    continueAfterStage: () => dispatch({ type: 'STAGE_CONTINUE' }),
  }
}
