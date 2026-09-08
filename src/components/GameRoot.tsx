'use client'

import { useGameEngine } from '../hooks/useGameEngine'
import type { Stage } from '../types'
import { FinalScreen } from './FinalScreen'
import { QuestionScreen } from './QuestionScreen'
import { StageResultScreen } from './StageResultScreen'
import { StartScreen } from './StartScreen'

/** بدنهٔ بازی — دادهٔ مراحل از سرور (دیتابیس) به اینجا می‌رسد */
export function GameRoot({ stages }: { stages: Stage[] }) {
  const game = useGameEngine(stages)

  switch (game.phase) {
    case 'start':
      return (
        <StartScreen
          stages={stages}
          totalQuestions={stages.reduce((n, s) => n + s.questions.length, 0)}
          onStart={game.startGame}
        />
      )

    case 'play':
      if (!game.stage || !game.question) return null
      return (
        <QuestionScreen
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
          onRestart={game.startGame}
          onHome={game.backToStart}
        />
      )
  }
}
