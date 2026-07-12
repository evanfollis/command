import Shell from '@/components/Shell'
import { ObservatoryDashboard } from '@/components/ObservatoryDashboard'
import { getObservatorySnapshot } from '@/lib/observatory'

export const dynamic = 'force-dynamic'

export default async function OwnerObservatoryPage() {
  const snapshot = await getObservatorySnapshot()
  return <Shell><ObservatoryDashboard snapshot={snapshot} /></Shell>
}
