import type {
  DailyOperatorEfficiency,
  EfficiencyStatus,
  OperatorDailySummary,
} from '../types/database'

export const DEFAULT_CAPACITY = 510

export function efficiencyStatus(value: number): EfficiencyStatus {
  if (value >= 90) return 'green'
  if (value >= 75) return 'yellow'
  return 'red'
}

export function statusLabel(status: EfficiencyStatus): string {
  if (status === 'green') return 'En meta'
  if (status === 'yellow') return 'Aceptable'
  return 'Bajo meta'
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function formatMinutes(value: number): string {
  return value.toFixed(2)
}

export function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 10)
}

export function aggregateOperatorsByDay(
  rows: DailyOperatorEfficiency[],
): OperatorDailySummary[] {
  const byOperator = new Map<
    string,
    {
      operator_id: string
      operator_name: string
      installed_capacity_minutes: number
      total_delivered_minutes: number
      total_delivered_units: number
      total_defective_units: number
    }
  >()

  for (const row of rows) {
    const current = byOperator.get(row.operator_id)
    const capacity = Number(row.installed_capacity_minutes)
    const minutes = Number(row.total_delivered_minutes)
    const units = Number(row.total_delivered_units)
    const defective = Number(row.total_defective_units)

    if (!current) {
      byOperator.set(row.operator_id, {
        operator_id: row.operator_id,
        operator_name: row.operator_name,
        installed_capacity_minutes: capacity,
        total_delivered_minutes: minutes,
        total_delivered_units: units,
        total_defective_units: defective,
      })
      continue
    }

    current.total_delivered_minutes += minutes
    current.total_delivered_units += units
    current.total_defective_units += defective
    current.installed_capacity_minutes = Math.max(
      current.installed_capacity_minutes,
      capacity,
    )
  }

  return [...byOperator.values()]
    .map((item) => {
      const efficiency =
        item.installed_capacity_minutes > 0
          ? (item.total_delivered_minutes / item.installed_capacity_minutes) * 100
          : 0
      return {
        ...item,
        efficiency_percentage: efficiency,
        status: efficiencyStatus(efficiency),
      }
    })
    .sort((a, b) => b.efficiency_percentage - a.efficiency_percentage)
}

export function overallEfficiency(summaries: OperatorDailySummary[]): number {
  const minutes = summaries.reduce((sum, item) => sum + item.total_delivered_minutes, 0)
  const capacity = summaries.reduce(
    (sum, item) => sum + item.installed_capacity_minutes,
    0,
  )
  if (capacity <= 0) return 0
  return (minutes / capacity) * 100
}

export function deliveredMinutes(standardMinutes: number, units: number): number {
  return Number(standardMinutes) * Number(units || 0)
}
