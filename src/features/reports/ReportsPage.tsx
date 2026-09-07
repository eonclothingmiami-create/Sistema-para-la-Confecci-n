import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EfficiencyArea } from '../../components/charts/EfficiencyArea'
import { RankingBars } from '../../components/charts/RankingBars'
import { ResultCard } from '../../components/result/ResultCard'
import { Field, PrimaryButton, SelectInput } from '../../components/ui/FormField'
import { useMonthResult } from '../../hooks/useMonthResult'
import { formatMoney, formatSignedMoney } from '../../lib/money'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  aggregateOperatorsByPeriod,
  endOfMonthISO,
  fillDailySeries,
  formatMinutes,
  formatMonthLong,
  formatPercent,
  mermaPercent,
  overallEfficiency,
  shiftMonthISO,
  startOfMonthISO,
  todayISO,
  workshopDailySeries,
} from '../../lib/efficiency'
import { supabase } from '../../lib/supabase'
import type { DailyOperatorEfficiency, Operator, ProductionEntryCalculation } from '../../types/database'

export function ReportsPage() {
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [operatorId, setOperatorId] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const monthAnchor = `${month}-01`
  const from = startOfMonthISO(monthAnchor)
  const to = endOfMonthISO(monthAnchor)
  const previousFrom = startOfMonthISO(shiftMonthISO(monthAnchor, -1))
  const previousTo = endOfMonthISO(shiftMonthISO(monthAnchor, -1))

  const operatorsQuery = useQuery({
    queryKey: ['operators'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operators').select('*').order('name')
      if (error) throw error
      return data as Operator[]
    },
  })

  const monthQuery = useQuery({
    queryKey: ['daily_operator_efficiency', 'month', from, to, operatorId],
    queryFn: async () => {
      let request = supabase
        .from('daily_operator_efficiency')
        .select('*')
        .gte('production_date', from)
        .lte('production_date', to)
      if (operatorId) request = request.eq('operator_id', operatorId)
      const { data, error } = await request
      if (error) throw error
      return data as DailyOperatorEfficiency[]
    },
  })

  const previousQuery = useQuery({
    queryKey: ['daily_operator_efficiency', 'prev-month', previousFrom, previousTo, operatorId],
    queryFn: async () => {
      let request = supabase
        .from('daily_operator_efficiency')
        .select('*')
        .gte('production_date', previousFrom)
        .lte('production_date', previousTo)
      if (operatorId) request = request.eq('operator_id', operatorId)
      const { data, error } = await request
      if (error) throw error
      return data as DailyOperatorEfficiency[]
    },
  })

  const operationsQuery = useQuery({
    queryKey: ['reference_operations'],
    enabled: showDetail,
    queryFn: async () => {
      const { data, error } = await supabase.from('reference_operations').select('id, operation_name, operation_number')
      if (error) throw error
      return data as { id: string; operation_name: string; operation_number: number }[]
    },
  })

  const detailQuery = useQuery({
    queryKey: ['production_entry_calculations', from, to, operatorId],
    enabled: showDetail,
    queryFn: async () => {
      let request = supabase
        .from('production_entry_calculations')
        .select('*')
        .gte('production_date', from)
        .lte('production_date', to)
      if (operatorId) request = request.eq('operator_id', operatorId)
      const { data, error } = await request
      if (error) throw error
      return data as ProductionEntryCalculation[]
    },
  })

  const rows = monthQuery.data ?? []
  const ranking = useMemo(() => aggregateOperatorsByPeriod(rows), [rows])
  const previousRanking = useMemo(
    () => aggregateOperatorsByPeriod(previousQuery.data ?? []),
    [previousQuery.data],
  )
  const general = overallEfficiency(ranking)
  const previousGeneral = overallEfficiency(previousRanking)
  const units = ranking.reduce((sum, item) => sum + item.total_delivered_units, 0)
  const defective = ranking.reduce((sum, item) => sum + item.total_defective_units, 0)
  const minutes = ranking.reduce((sum, item) => sum + item.total_delivered_minutes, 0)
  const delta = previousRanking.length > 0 ? general - previousGeneral : null

  const chartData = useMemo(
    () => fillDailySeries(from, to, workshopDailySeries(rows)),
    [from, rows, to],
  )
  const monthMoney = useMonthResult(monthAnchor)
  const previousMoney = useMonthResult(previousFrom)
  const moneyDelta =
    previousMoney.result.revenue > 0 || previousMoney.result.fixedCosts > 0 || previousMoney.result.variableCosts > 0
      ? monthMoney.result.result - previousMoney.result.result
      : null
  const dayMoneyRows = monthMoney.result.days.filter(
    (item) => item.revenue > 0 || item.variableCosts > 0 || item.allocatedFixed > 0,
  )

  function exportCsv() {
    const header = ['fecha', 'operario', 'orden', 'referencia', 'unidades', 'defectuosas', 'minutos', 'capacidad', 'eficiencia']
    const body = rows.map((row) =>
      [
        row.production_date,
        row.operator_name,
        row.order_number,
        row.reference_code,
        row.total_delivered_units,
        row.total_defective_units,
        Number(row.total_delivered_minutes).toFixed(2),
        row.installed_capacity_minutes,
        Number(row.efficiency_percentage).toFixed(2),
      ].join(','),
    )
    const csv = [header.join(','), ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reporte-confeccion-${from}-${to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        title="Este mes"
        description={`${formatMonthLong(monthAnchor)}. Para evaluar, no para operar el turno.`}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Mes">
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </Field>
            <PrimaryButton onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </PrimaryButton>
          </div>
        }
      />

      <div className="mb-5">
        <ResultCard
          title="Resultado del mes"
          result={monthMoney.result.result}
          revenue={monthMoney.result.revenue}
          variableCosts={monthMoney.result.variableCosts}
          fixedCosts={monthMoney.result.fixedCosts}
          fixedLabel="Fijos del mes"
          missingRate={monthMoney.result.missingRate}
          hasFixed={monthMoney.result.hasFixed}
          href="/resultado"
        />
        {moneyDelta != null ? (
          <p className={`mt-2 text-sm ${moneyDelta >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {moneyDelta >= 0 ? '↑' : '↓'} {formatSignedMoney(moneyDelta)} vs {formatMonthLong(previousFrom)}
          </p>
        ) : null}
      </div>

      {dayMoneyRows.length > 0 ? (
        <div className="mb-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="px-4 py-3 text-sm font-medium text-zinc-800">Día a día</div>
          <ul>
            {[...dayMoneyRows].reverse().map((item) => (
              <li
                key={item.date}
                className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-2.5"
              >
                <span className="tabular text-sm text-zinc-600">{item.date}</span>
                <span
                  className={`tabular text-sm font-medium ${
                    item.result > 0 ? 'text-emerald-700' : item.result < 0 ? 'text-rose-600' : 'text-zinc-700'
                  }`}
                >
                  {formatSignedMoney(item.result)}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400">
            Ingreso {formatMoney(monthMoney.result.revenue)} · el día usa fijos prorrateados; el mes usa fijos enteros.
          </p>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:col-span-1">
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Eficiencia del mes</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight tabular text-zinc-900">
            {ranking.length === 0 ? '—' : formatPercent(general)}
          </p>
          {ranking.length > 0 ? (
            <div className="mt-3">
              <StatusBadge value={general} />
            </div>
          ) : null}
          {delta != null ? (
            <p className={`mt-3 text-sm ${delta >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {delta >= 0 ? '↑' : '↓'} {formatPercent(Math.abs(delta))} vs {formatMonthLong(previousFrom)}
            </p>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">Sin mes anterior para comparar.</p>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Merma</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight tabular text-zinc-900">
            {units === 0 ? '—' : formatPercent(mermaPercent(defective, units))}
          </p>
          <p className="mt-3 text-sm text-zinc-500">{defective} defectuosas · {units} und</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Minutos</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight tabular text-zinc-900">
            {minutes === 0 ? '—' : formatMinutes(minutes)}
          </p>
          <p className="mt-3 text-sm text-zinc-500">{ranking.length} operarios con captura</p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-800">Tendencia del mes</h2>
        <p className="mb-3 text-xs text-zinc-400">Línea de meta en 70%. Los días vacíos se omiten.</p>
        <EfficiencyArea data={chartData} />
      </div>

      <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-800">Ranking del mes</h2>
          <Field label="Operario">
            <SelectInput value={operatorId} onChange={(event) => setOperatorId(event.target.value)}>
              <option value="">Todos</option>
              {operatorsQuery.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <RankingBars
          items={ranking.map((item) => ({
            id: item.operator_id,
            name: item.operator_name,
            value: item.efficiency_percentage,
          }))}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowDetail((value) => !value)}
        className="text-sm text-zinc-500 hover:text-zinc-800"
      >
        {showDetail ? 'Ocultar detalle de operaciones' : 'Ver detalle de operaciones'}
      </button>

      {showDetail ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Operación</th>
                <th className="px-4 py-3 font-medium">Unidades</th>
                <th className="px-4 py-3 font-medium">Defectuosas</th>
                <th className="px-4 py-3 font-medium">Minutos</th>
              </tr>
            </thead>
            <tbody>
              {(detailQuery.data ?? []).map((row) => (
                <tr key={row.entry_id} className="border-t border-zinc-100">
                  <td className="px-4 py-2.5 tabular text-zinc-600">{row.production_date}</td>
                  <td className="px-4 py-2.5">
                    {operationsQuery.data?.find((item) => item.id === row.reference_operation_id)?.operation_name ??
                      row.reference_operation_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2.5 tabular">{row.delivered_units}</td>
                  <td className="px-4 py-2.5 tabular">{row.defective_units}</td>
                  <td className="px-4 py-2.5 tabular">{formatMinutes(Number(row.delivered_minutes))}</td>
                </tr>
              ))}
              {(detailQuery.data?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                    Sin detalle de operaciones.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
