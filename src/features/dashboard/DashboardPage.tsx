import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { WeekDots } from '../../components/charts/WeekDots'
import { ResultCard } from '../../components/result/ResultCard'
import { Field, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useMonthResult } from '../../hooks/useMonthResult'
import { dayResultFromMonth } from '../../lib/result'
import {
  aggregateOperatorsByDay,
  fillDailySeries,
  formatPercent,
  mermaPercent,
  overallEfficiency,
  todayISO,
  workshopDailySeries,
} from '../../lib/efficiency'
import { supabase } from '../../lib/supabase'
import type { DailyOperatorEfficiency, OrderEfficiency, ReferenceEfficiency } from '../../types/database'

export function DashboardPage() {
  const [date, setDate] = useState(todayISO())
  const [showBreakdown, setShowBreakdown] = useState(false)
  const weekFrom = daysAgoISOFrom(date, 6)

  const weekQuery = useQuery({
    queryKey: ['dashboard_week', weekFrom, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_operator_efficiency')
        .select('*')
        .gte('production_date', weekFrom)
        .lte('production_date', date)
      if (error) throw error
      return data as DailyOperatorEfficiency[]
    },
  })

  const referenceRows = useQuery({
    queryKey: ['reference_efficiency', date],
    enabled: showBreakdown,
    queryFn: async () => {
      const { data, error } = await supabase.from('reference_efficiency').select('*').eq('production_date', date)
      if (error) throw error
      return data as ReferenceEfficiency[]
    },
  })

  const orderRows = useQuery({
    queryKey: ['order_efficiency', date],
    enabled: showBreakdown,
    queryFn: async () => {
      const { data, error } = await supabase.from('order_efficiency').select('*').eq('production_date', date)
      if (error) throw error
      return data as OrderEfficiency[]
    },
  })

  const todayRows = (weekQuery.data ?? []).filter((row) => row.production_date === date)
  const summaries = useMemo(() => aggregateOperatorsByDay(todayRows), [todayRows])
  const general = overallEfficiency(summaries)
  const units = summaries.reduce((sum, item) => sum + item.total_delivered_units, 0)
  const defective = summaries.reduce((sum, item) => sum + item.total_defective_units, 0)
  const below = summaries.filter((item) => item.status === 'red')
  const merma = mermaPercent(defective, units)

  const monthResult = useMonthResult(date)
  const todayResult = dayResultFromMonth(monthResult.result, date)

  const weekDots = useMemo(() => {
    const series = workshopDailySeries(weekQuery.data ?? [])
    return fillDailySeries(weekFrom, date, series).map((point) => ({
      ...point,
      label: point.date.slice(8),
    }))
  }, [date, weekFrom, weekQuery.data])

  return (
    <div>
      <PageHeader
        title="Hoy"
        actions={
          <Field label="Fecha">
            <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        }
      />

      {weekQuery.error ? (
        <p className="mb-4 text-sm text-rose-600">No se pudo leer el dashboard.</p>
      ) : null}

      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Eficiencia del taller</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-4xl font-semibold tracking-tight tabular text-zinc-900 sm:text-5xl">
              {summaries.length === 0 ? '—' : formatPercent(general)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {summaries.length > 0 ? <StatusBadge value={general} /> : null}
              <span className="text-sm text-zinc-500">
                {summaries.length} operario{summaries.length === 1 ? '' : 's'}
                {below.length > 0 ? ` · ${below.length} bajo meta` : summaries.length > 0 ? ' · todos en rango' : ''}
                {units > 0 ? ` · merma ${formatPercent(merma)}` : ''}
              </span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-right text-[11px] text-zinc-400">Últimos 7 días</p>
            <WeekDots days={weekDots} />
          </div>
        </div>
        {below.length > 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            Hoy hay que mirar a{' '}
            {below.map((item, index) => (
              <span key={item.operator_id}>
                {index > 0 ? (index === below.length - 1 ? ' y ' : ', ') : null}
                <Link to={`/operarios/${item.operator_id}`} className="font-medium text-zinc-900 hover:underline">
                  {item.operator_name}
                </Link>
              </span>
            ))}
            .
          </p>
        ) : null}
      </section>

      {todayResult ? (
        <div className="mb-6">
          <ResultCard
            title="Resultado de hoy"
            result={todayResult.result}
            revenue={todayResult.revenue}
            variableCosts={todayResult.variableCosts}
            fixedCosts={todayResult.allocatedFixed}
            fixedLabel="Fijos del día"
            missingRate={todayResult.missingRate}
            hasFixed={todayResult.hasFixed}
            href="/resultado"
          />
        </div>
      ) : null}

      <section className="mb-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {summaries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-400">Sin registros para esta fecha.</p>
        ) : (
          <ul>
            {summaries.map((item) => (
              <li key={item.operator_id} className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-3.5 first:border-t-0">
                <Link to={`/operarios/${item.operator_id}`} className="truncate font-medium text-zinc-900 hover:underline">
                  {item.operator_name}
                </Link>
                <StatusBadge value={item.efficiency_percentage} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => setShowBreakdown((value) => !value)}
        className="text-sm text-zinc-500 hover:text-zinc-800"
      >
        {showBreakdown ? 'Ocultar prendas y lotes' : 'Ver por prenda y lote'}
      </button>

      {showBreakdown ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <QuietTable
            title="Por referencia"
            rows={(referenceRows.data ?? []).map((row) => ({
              key: row.reference_id,
              name: `${row.reference_code} · ${row.reference_name}`,
              efficiency: Number(row.efficiency_percentage),
            }))}
          />
          <QuietTable
            title="Por orden / lote"
            rows={(orderRows.data ?? []).map((row) => ({
              key: row.production_order_id,
              name: `${row.order_number} · ${row.reference_code}`,
              efficiency: Number(row.efficiency_percentage),
            }))}
          />
        </div>
      ) : null}
    </div>
  )
}

function daysAgoISOFrom(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() - days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function QuietTable({
  title,
  rows,
}: {
  title: string
  rows: { key: string; name: string; efficiency: number }[]
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="px-4 py-3 text-sm font-medium text-zinc-700">{title}</div>
      {rows.length === 0 ? (
        <p className="px-4 pb-5 text-sm text-zinc-400">Sin datos.</p>
      ) : (
        <ul className="border-t border-zinc-100">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate text-zinc-700">{row.name}</span>
              <StatusBadge value={row.efficiency} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
