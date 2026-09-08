import { QuestionEditor } from '@/components/admin/QuestionEditor'

export default async function AdminQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <QuestionEditor questionId={Number(id)} />
}
