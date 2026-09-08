import { StageDetail } from '@/components/admin/StageDetail'

export default async function AdminStagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <StageDetail stageId={Number(id)} />
}
