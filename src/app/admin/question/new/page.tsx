import { QuestionEditor } from '@/components/admin/QuestionEditor'

export default async function AdminQuestionNewPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>
}) {
  const params = await searchParams
  const stageId = params.stage ? Number(params.stage) : undefined
  return <QuestionEditor initialStageId={Number.isFinite(stageId) && stageId ? stageId : undefined} />
}
