import { GameRoot } from '@/components/GameRoot'
import { listStages } from '@/lib/db'

// هر بار از دیتابیس خوانده می‌شود تا تغییرات پنل مدیریت فوراً دیده شوند
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const stages = await listStages()
  return <GameRoot stages={stages} />
}
