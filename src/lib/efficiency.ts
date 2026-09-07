import type {
  DailyOperatorEfficiency,
  EfficiencyStatus,
  OperatorDailySummary,
} from '../types/database'

export const DEFAULT_CAPACITY = 510
export const MINUTES_PER_HOUR = 60
export const META_EFFICIENCY_PERCENT = 70
export const WATCH_EFFICIENCY_PERCENT = 60

export function capacityFromWorkedHours(hours: number): number {
  return Number((Number(hours) * MINUTES_PER_HOUR).toFixed(2))
}

export function hoursFromCapacity(minutes: number): number {
  if (minutes <= 0) return 0
  return Number((Number(minutes) / MINUTES_PER_HOUR).toFixed(4))
}

export function efficiencyStatus(value: number): EfficiencyStatus {
  if (value >= META_EFFICIENCY_PERCENT) return 'green'
  if (value >= WATCH_EFFICIENCY_PERCENT) return 'yellow'
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

export function daysAgoISO(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function fromLocalDate(year: number, monthIndex: number, day: number): string {
  const date = new Date(year, monthIndex, day)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function startOfMonthISO(iso: string = todayISO()): string {
  const [year, month] = iso.split('-').map(Number)
  return fromLocalDate(year, month - 1, 1)
}

export function endOfMonthISO(iso: string = todayISO()): string {
  const [year, month] = iso.split('-').map(Number)
  return fromLocalDate(year, month, 0)
}

export function shiftMonthISO(iso: string, delta: number): string {
  const [year, month] = iso.split('-').map(Number)
  return fromLocalDate(year, month - 1 + delta, 1)
}

export function formatMonthLong(iso: string): string {
  const [year, month] = iso.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
}

export function eachDateISO(from: string, to: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (cursor <= end) {
    const offset = cursor.getTimezoneOffset()
    dates.push(new Date(cursor.getTime() - offset * 60_000).toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function statusHex(value: number): string {
  const status = efficiencyStatus(value)
  if (status === 'green') return '#059669'
  if (status === 'yellow') return '#d97706'
  return '#e11d48'
}

export interface WorkshopDayPoint {
  date: string
  label: string
  efficiency: number | null
  minutes: number
  units: number
  defective: number
}

export function workshopDailySeries(rows: DailyOperatorEfficiency[]): WorkshopDayPoint[] {
  const byDate = new Map<string, DailyOperatorEfficiency[]>()
  for (const row of rows) {
    const list = byDate.get(row.production_date) ?? []
    list.push(row)
    byDate.set(row.production_date, list)
  }

  return [...byDate.keys()]
    .sort()
    .map((date) => {
      const summaries = aggregateOperatorsByDay(byDate.get(date) ?? [])
      const minutes = summaries.reduce((sum, item) => sum + item.total_delivered_minutes, 0)
      const units = summaries.reduce((sum, item) => sum + item.total_delivered_units, 0)
      const defective = summaries.reduce((sum, item) => sum + item.total_defective_units, 0)
      return {
        date,
        label: date.slice(8),
        efficiency: summaries.length > 0 ? overallEfficiency(summaries) : null,
        minutes,
        units,
        defective,
      }
    })
}

export function fillDailySeries(from: string, to: string, points: WorkshopDayPoint[]): WorkshopDayPoint[] {
  const byDate = new Map(points.map((point) => [point.date, point]))
  return eachDateISO(from, to).map((date) => {
    const existing = byDate.get(date)
    if (existing) return existing
    return {
      date,
      label: date.slice(8),
      efficiency: null,
      minutes: 0,
      units: 0,
      defective: 0,
    }
  })
}

/** Periodo de varios días: suma minutos y capacidad de cada jornada, no un solo 510. */
export function aggregateOperatorsByPeriod(rows: DailyOperatorEfficiency[]): OperatorDailySummary[] {
  const byOperator = new Map<string, DailyOperatorEfficiency[]>()
  for (const row of rows) {
    const list = byOperator.get(row.operator_id) ?? []
    list.push(row)
    byOperator.set(row.operator_id, list)
  }

  return [...byOperator.entries()]
    .map(([operatorId, operatorRows]) => {
      const days = rollupOperatorDays(operatorRows)
      const minutes = days.reduce((sum, item) => sum + item.total_delivered_minutes, 0)
      const capacity = days.reduce((sum, item) => sum + item.installed_capacity_minutes, 0)
      const units = days.reduce((sum, item) => sum + item.total_delivered_units, 0)
      const defective = days.reduce((sum, item) => sum + item.total_defective_units, 0)
      const efficiency = capacity > 0 ? (minutes / capacity) * 100 : 0
      return {
        operator_id: operatorId,
        operator_name: operatorRows[0]?.operator_name ?? '',
        installed_capacity_minutes: capacity,
        total_delivered_minutes: minutes,
        total_delivered_units: units,
        total_defective_units: defective,
        efficiency_percentage: efficiency,
        status: efficiencyStatus(efficiency),
      }
    })
    .sort((a, b) => b.efficiency_percentage - a.efficiency_percentage)
}

export interface OperatorDayRollup {
  production_date: string
  installed_capacity_minutes: number
  total_delivered_minutes: number
  total_delivered_units: number
  total_defective_units: number
  efficiency_percentage: number
  status: EfficiencyStatus
  order_numbers: string[]
  reference_labels: string[]
}

/** Una jornada = max capacidad del día (no se suma 510 por cada lote). */
export function rollupOperatorDays(rows: DailyOperatorEfficiency[]): OperatorDayRollup[] {
  const byDate = new Map<
    string,
    {
      production_date: string
      installed_capacity_minutes: number
      total_delivered_minutes: number
      total_delivered_units: number
      total_defective_units: number
      order_numbers: Set<string>
      reference_labels: Set<string>
    }
  >()

  for (const row of rows) {
    const current = byDate.get(row.production_date)
    const minutes = Number(row.total_delivered_minutes)
    const units = Number(row.total_delivered_units)
    const defective = Number(row.total_defective_units)
    const capacity = Number(row.installed_capacity_minutes)
    const referenceLabel = `${row.reference_code} · ${row.reference_name}`

    if (!current) {
      byDate.set(row.production_date, {
        production_date: row.production_date,
        installed_capacity_minutes: capacity,
        total_delivered_minutes: minutes,
        total_delivered_units: units,
        total_defective_units: defective,
        order_numbers: new Set([row.order_number]),
        reference_labels: new Set([referenceLabel]),
      })
      continue
    }

    current.total_delivered_minutes += minutes
    current.total_delivered_units += units
    current.total_defective_units += defective
    current.installed_capacity_minutes = Math.max(current.installed_capacity_minutes, capacity)
    current.order_numbers.add(row.order_number)
    current.reference_labels.add(referenceLabel)
  }

  return [...byDate.values()]
    .map((item) => {
      const efficiency =
        item.installed_capacity_minutes > 0
          ? (item.total_delivered_minutes / item.installed_capacity_minutes) * 100
          : 0
      return {
        production_date: item.production_date,
        installed_capacity_minutes: item.installed_capacity_minutes,
        total_delivered_minutes: item.total_delivered_minutes,
        total_delivered_units: item.total_delivered_units,
        total_defective_units: item.total_defective_units,
        efficiency_percentage: efficiency,
        status: efficiencyStatus(efficiency),
        order_numbers: [...item.order_numbers],
        reference_labels: [...item.reference_labels],
      }
    })
    .sort((a, b) => a.production_date.localeCompare(b.production_date))
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

/** Unidades teóricas a 100% en una hora: 60 / tiempo_operación */
export function expectedUnitsPerHour(standardMinutes: number): number {
  const time = Number(standardMinutes)
  if (time <= 0) return 0
  return 60 / time
}

/**
 * Rendimiento vs la hora a 100%.
 * Ejemplo: 60 / 0.50 = 120 und/hora; 80 entregadas → 66.7%.
 */
export function hourlyPerformancePercent(deliveredUnits: number, standardMinutes: number): number {
  const expected = expectedUnitsPerHour(standardMinutes)
  if (expected <= 0) return 0
  return (Number(deliveredUnits || 0) / expected) * 100
}

/** Merma de calidad: defectuosas / entregadas. No entra en la eficiencia. */
export function mermaPercent(defectiveUnits: number, deliveredUnits: number): number {
  const delivered = Number(deliveredUnits || 0)
  if (delivered <= 0) return 0
  return (Number(defectiveUnits || 0) / delivered) * 100
}
