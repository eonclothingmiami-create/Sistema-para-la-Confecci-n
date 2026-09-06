import { efficiencyStatus, formatPercent, statusLabel } from '../../lib/efficiency'
import type { EfficiencyStatus } from '../../types/database'

const styles: Record<EfficiencyStatus, string> = {
  green: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  yellow: 'bg-amber-100 text-amber-800 ring-amber-200',
  red: 'bg-rose-100 text-rose-800 ring-rose-200',
}

export function StatusBadge({ value }: { value: number }) {
  const status = efficiencyStatus(value)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {formatPercent(value)} · {statusLabel(status)}
    </span>
  )
}

export function StatusDot({ value }: { value: number }) {
  const status = efficiencyStatus(value)
  const color =
    status === 'green' ? 'bg-emerald-500' : status === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
}
