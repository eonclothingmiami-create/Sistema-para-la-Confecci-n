import { eachDateISO, endOfMonthISO, startOfMonthISO } from './efficiency'
import type { CostEntry, DailyProductionRevenue } from '../types/database'

export const DEFAULT_FIXED_CATEGORIES = [
  'Arriendo',
  'Nómina taller',
  'Nómina administrativa',
  'Servicios',
  'Internet',
  'Mantenimiento de máquinas',
  'Otro fijo',
] as const

export const DEFAULT_VARIABLE_CATEGORIES = [
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

export function isWorkshopDay(date: string, activeDates: Set<string>): boolean {
  const weekday = new Date(`${date}T00:00:00`).getDay()
  return weekday !== 0 || activeDates.has(date)
}

export function workingDaysInMonth(iso: string, activeDates: Set<string> = new Set()): number {
  const days = eachDateISO(startOfMonthISO(iso), endOfMonthISO(iso))
  return days.filter((date) => isWorkshopDay(date, activeDates)).length
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
  const activeDates = new Set<string>([
    ...revenueRows.filter((row) => Number(row.delivered_minutes) > 0).map((row) => row.production_date),
    ...variableEntries.map((entry) => entry.occurred_on),
  ])
  const workingDays = Math.max(1, workingDaysInMonth(monthIso, activeDates))
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
    const dayFixed = isWorkshopDay(date, activeDates) ? allocatedFixed : 0
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
