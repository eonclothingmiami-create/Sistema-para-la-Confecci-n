import { eachDateISO, endOfMonthISO, startOfMonthISO } from './efficiency'
import type { CostEntry, DailyProductionRevenue } from '../types/database'

export const FIXED_CATEGORIES = [
  'Arriendo',
  'Nómina taller',
  'Nómina administrativa',
  'Servicios',
  'Internet',
  'Mantenimiento de máquinas',
  'Otro fijo',
] as const

export const VARIABLE_CATEGORIES = [
  'Insumos',
  'Imprevisto',
  'Emergencia',
  'Invitación / detalle empleados',
  'Transporte',
  'Reparación urgente',
  'Otro',
] as const

export interface DayResult {
  date: string
  revenue: number
  variableCosts: number
  allocatedFixed: number
  result: number
  missingRate: boolean
  hasFixed: boolean
}

export interface MonthResult {
  revenue: number
  variableCosts: number
  fixedCosts: number
  result: number
  missingRate: boolean
  hasFixed: boolean
  days: DayResult[]
}

export function workingDaysInMonth(iso: string): number {
  const days = eachDateISO(startOfMonthISO(iso), endOfMonthISO(iso))
  return days.filter((date) => new Date(`${date}T00:00:00`).getDay() !== 0).length
}

export function sumAmounts(entries: CostEntry[]): number {
  return entries.reduce((sum, item) => sum + Number(item.amount || 0), 0)
}

export function sumRevenue(rows: DailyProductionRevenue[]): number {
  return rows.reduce((sum, item) => sum + Number(item.revenue || 0), 0)
}

export function hasMissingRate(rows: DailyProductionRevenue[]): boolean {
  return rows.some((row) => Number(row.delivered_minutes) > 0 && Number(row.minute_rate) <= 0)
}

export function buildMonthResult(
  monthIso: string,
  revenueRows: DailyProductionRevenue[],
  fixedEntries: CostEntry[],
  variableEntries: CostEntry[],
): MonthResult {
  const from = startOfMonthISO(monthIso)
  const to = endOfMonthISO(monthIso)
  const workingDays = Math.max(1, workingDaysInMonth(monthIso))
  const fixedCosts = sumAmounts(fixedEntries)
  const allocatedFixed = fixedCosts / workingDays
  const hasFixed = fixedEntries.some((item) => Number(item.amount) > 0)

  const revenueByDate = new Map<string, DailyProductionRevenue[]>()
  for (const row of revenueRows) {
    const list = revenueByDate.get(row.production_date) ?? []
    list.push(row)
    revenueByDate.set(row.production_date, list)
  }

  const variableByDate = new Map<string, number>()
  for (const entry of variableEntries) {
    variableByDate.set(entry.occurred_on, (variableByDate.get(entry.occurred_on) ?? 0) + Number(entry.amount || 0))
  }

  const days = eachDateISO(from, to).map((date) => {
    const dayRows = revenueByDate.get(date) ?? []
    const revenue = sumRevenue(dayRows)
    const variableCosts = variableByDate.get(date) ?? 0
    const isWorkingDay = new Date(`${date}T00:00:00`).getDay() !== 0
    const dayFixed = isWorkingDay ? allocatedFixed : 0
    return {
      date,
      revenue,
      variableCosts,
      allocatedFixed: dayFixed,
      result: revenue - variableCosts - dayFixed,
      missingRate: hasMissingRate(dayRows),
      hasFixed,
    }
  })

  return {
    revenue: sumRevenue(revenueRows),
    variableCosts: sumAmounts(variableEntries),
    fixedCosts,
    result: sumRevenue(revenueRows) - sumAmounts(variableEntries) - fixedCosts,
    missingRate: hasMissingRate(revenueRows),
    hasFixed,
    days,
  }
}

export function dayResultFromMonth(month: MonthResult, date: string): DayResult | undefined {
  return month.days.find((item) => item.date === date)
}
