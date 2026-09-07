import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EfficiencyArea } from '../../components/charts/EfficiencyArea'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, SelectInput, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { DesktopOnly, RecordCard, RecordCardList, RecordField } from '../../components/ui/RecordCard'
import { SegmentedTabs } from '../../components/ui/SegmentedTabs'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  daysAgoISO,
  endOfMonthISO,
  expectedUnitsPerHour,
  fillDailySeries,
  formatMinutes,
  formatMonthLong,
  formatPercent,
  mermaPercent,
  rollupOperatorDays,
  startOfMonthISO,
  todayISO,
} from '../../lib/efficiency'
import { supabase } from '../../lib/supabase'
import type {
  DailyOperatorEfficiency,
  GarmentReference,
  Operator,
  ProductionEntryCalculation,
  ProductionOrder,
} from '../../types/database'

type ProfileTab = 'hoy' | 'mes' | 'historial'

export function OperatorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<ProfileTab>('hoy')
  const [showInfo, setShowInfo] = useState(false)
  const [from, setFrom] = useState(daysAgoISO(90))
  const [to, setTo] = useState(todayISO())
  const [referenceId, setReferenceId] = useState('')
  const [orderId, setOrderId] = useState('')

  const today = todayISO()
  const monthFrom = startOfMonthISO(today)
  const monthTo = endOfMonthISO(today)
  const recentFrom = daysAgoISO(14)

  const operatorQuery = useQuery({
    queryKey: ['operator', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('operators').select('*').eq('id', id!).single()
      if (error) throw error
      return data as Operator
    },
  })

  const referencesQuery = useQuery({
    queryKey: ['garment_references'],
    enabled: tab === 'historial',
    queryFn: async () => {
      const { data, error } = await supabase.from('garment_references').select('*').order('code')
      if (error) throw error
      return data as GarmentReference[]
    },
  })

  const ordersQuery = useQuery({
    queryKey: ['production_orders'],
    enabled: tab === 'historial',
    queryFn: async () => {
      const { data, error } = await supabase.from('production_orders').select('*').order('order_number')
      if (error) throw error
      return data as ProductionOrder[]
    },
  })

  const recentQuery = useQuery({
    queryKey: ['daily_operator_efficiency', id, 'recent', recentFrom, today],
    enabled: Boolean(id) && tab === 'hoy',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_operator_efficiency')
        .select('*')
        .eq('operator_id', id!)
        .gte('production_date', recentFrom)
        .lte('production_date', today)
      if (error) throw error
      return data as DailyOperatorEfficiency[]
    },
  })

  const monthQuery = useQuery({
    queryKey: ['daily_operator_efficiency', id, 'month', monthFrom, monthTo],
    enabled: Boolean(id) && tab !== 'historial',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_operator_efficiency')
        .select('*')
        .eq('operator_id', id!)
        .gte('production_date', monthFrom)
        .lte('production_date', monthTo)
      if (error) throw error
      return data as DailyOperatorEfficiency[]
    },
  })

  const historyQuery = useQuery({
    queryKey: ['daily_operator_efficiency', id, from, to, referenceId, orderId],
    enabled: Boolean(id) && tab === 'historial',
    queryFn: async () => {
      let request = supabase
        .from('daily_operator_efficiency')
        .select('*')
        .eq('operator_id', id!)
        .gte('production_date', from)
        .lte('production_date', to)
      if (referenceId) request = request.eq('reference_id', referenceId)
      if (orderId) request = request.eq('production_order_id', orderId)
      const { data, error } = await request
      if (error) throw error
      return data as DailyOperatorEfficiency[]
    },
  })

  const operationsQuery = useQuery({
    queryKey: ['reference_operations'],
    enabled: tab !== 'mes',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reference_operations')
        .select('id, operation_name, operation_number, machine_type, standard_minutes')
      if (error) throw error
      return data as {
        id: string
        operation_name: string
        operation_number: number
        machine_type: string | null
        standard_minutes: number
      }[]
    },
  })

  const detailFrom = tab === 'historial' ? from : tab === 'hoy' ? recentFrom : monthFrom
  const detailTo = tab === 'historial' ? to : tab === 'hoy' ? today : monthTo

  const detailQuery = useQuery({
    queryKey: ['production_entry_calculations', id, tab, detailFrom, detailTo, orderId],
    enabled: Boolean(id) && tab !== 'mes',
    queryFn: async () => {
      let request = supabase
        .from('production_entry_calculations')
        .select('*')
        .eq('operator_id', id!)
        .gte('production_date', detailFrom)
        .lte('production_date', detailTo)
      if (tab === 'historial' && orderId) request = request.eq('production_order_id', orderId)
      const { data, error } = await request
      if (error) throw error
      return data as ProductionEntryCalculation[]
    },
  })

  const recentDays = useMemo(() => rollupOperatorDays(recentQuery.data ?? []), [recentQuery.data])
  const monthDays = useMemo(() => rollupOperatorDays(monthQuery.data ?? []), [monthQuery.data])
  const historyDays = useMemo(() => rollupOperatorDays(historyQuery.data ?? []), [historyQuery.data])
  const todayDay = recentDays.find((item) => item.production_date === today)
  const lastDay = [...recentDays].reverse()[0]

  const monthPeriod = useMemo(() => summarizeDays(monthDays), [monthDays])
  const historyPeriod = useMemo(() => summarizeDays(historyDays), [historyDays])

  const monthChart = useMemo(
    () =>
      fillDailySeries(
        monthFrom,
        monthTo,
        monthDays.map((item) => ({
          date: item.production_date,
          label: item.production_date.slice(8),
          efficiency: item.efficiency_percentage,
          minutes: item.total_delivered_minutes,
          units: item.total_delivered_units,
          defective: item.total_defective_units,
        })),
      ),
    [monthDays, monthFrom, monthTo],
  )

  const lastDayOps = useMemo(() => {
    const focus = todayDay ?? lastDay
    if (!focus) return []
    return (detailQuery.data ?? [])
      .filter((row) => row.production_date === focus.production_date)
      .map((row) => {
        const operation = operationsQuery.data?.find((item) => item.id === row.reference_operation_id)
        return {
          id: row.entry_id,
          number: operation?.operation_number ?? 0,
          name: operation?.operation_name ?? 'Operación',
          units: Number(row.delivered_units),
          defective: Number(row.defective_units),
          minutes: Number(row.delivered_minutes),
          standard: Number(row.standard_minutes),
        }
      })
      .sort((a, b) => a.number - b.number)
  }, [detailQuery.data, lastDay, operationsQuery.data, todayDay])

  const operationMix = useMemo(() => {
    const allowedOrders = new Set((historyQuery.data ?? []).map((row) => row.production_order_id))
    const byOp = new Map<string, { id: string; units: number; defective: number; minutes: number }>()

    for (const row of detailQuery.data ?? []) {
      if (orderId && row.production_order_id !== orderId) continue
      if (referenceId && !allowedOrders.has(row.production_order_id)) continue
      const current = byOp.get(row.reference_operation_id)
      const units = Number(row.delivered_units)
      const defective = Number(row.defective_units)
      const minutes = Number(row.delivered_minutes)
      if (!current) {
        byOp.set(row.reference_operation_id, { id: row.reference_operation_id, units, defective, minutes })
        continue
      }
      current.units += units
      current.defective += defective
      current.minutes += minutes
    }

    return [...byOp.values()]
      .map((item) => {
        const operation = operationsQuery.data?.find((op) => op.id === item.id)
        return {
          ...item,
          number: operation?.operation_number ?? 0,
          name: operation?.operation_name ?? item.id.slice(0, 8),
          machine: operation?.machine_type ?? '—',
          standard: Number(operation?.standard_minutes ?? 0),
        }
      })
      .sort((a, b) => b.minutes - a.minutes)
  }, [detailQuery.data, historyQuery.data, operationsQuery.data, orderId, referenceId])

  const operator = operatorQuery.data

  return (
    <div>
      <Link to="/operarios" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="h-4 w-4" /> Operarios
      </Link>
      <PageHeader
        title={operator ? operator.name : 'Ficha de operario'}
        description={
          operator ? [operator.code, operator.position, operator.line].filter(Boolean).join(' · ') || undefined : undefined
        }
        actions={
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={[
              { id: 'hoy', label: 'Hoy' },
              { id: 'mes', label: 'Este mes' },
              { id: 'historial', label: 'Historial' },
            ]}
          />
        }
      />

      {operatorQuery.isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {operatorQuery.error ? <p className="text-sm text-rose-600">No se encontró el operario.</p> : null}

      {operator ? (
        <>
          <button
            type="button"
            onClick={() => setShowInfo((value) => !value)}
            className="mb-5 text-sm text-zinc-400 hover:text-zinc-700"
          >
            {showInfo ? 'Ocultar ficha' : 'Datos personales'}
          </button>
          {showInfo ? (
            <div className="mb-5 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Documento" value={operator.document || '—'} />
              <Info label="Ingreso" value={operator.hire_date || '—'} />
              <Info label="Estado" value={operator.active ? 'Activo' : 'Inactivo'} />
              <Info label="Notas" value={operator.notes || '—'} />
            </div>
          ) : null}

          {tab === 'hoy' ? (
            <TodayPanel
              todayDay={todayDay}
              lastDay={lastDay}
              ops={lastDayOps}
            />
          ) : null}

          {tab === 'mes' ? (
            <MonthPanel
              period={monthPeriod}
              chartData={monthChart}
              days={monthDays}
              monthLabel={formatMonthLong(today)}
            />
          ) : null}

          {tab === 'historial' ? (
            <HistoryPanel
              from={from}
              to={to}
              onFrom={setFrom}
              onTo={setTo}
              referenceId={referenceId}
              orderId={orderId}
              onReference={setReferenceId}
              onOrder={setOrderId}
              references={referencesQuery.data ?? []}
              orders={ordersQuery.data ?? []}
              period={historyPeriod}
              days={historyDays}
              mix={operationMix}
              loading={historyQuery.isLoading}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function summarizeDays(days: ReturnType<typeof rollupOperatorDays>) {
  const minutes = days.reduce((sum, item) => sum + item.total_delivered_minutes, 0)
  const units = days.reduce((sum, item) => sum + item.total_delivered_units, 0)
  const defective = days.reduce((sum, item) => sum + item.total_defective_units, 0)
  const capacity = days.reduce((sum, item) => sum + item.installed_capacity_minutes, 0)
  const efficiency = capacity > 0 ? (minutes / capacity) * 100 : 0
  return { minutes, units, defective, capacity, efficiency, days: days.length }
}

function TodayPanel({
  todayDay,
  lastDay,
  ops,
}: {
  todayDay?: ReturnType<typeof rollupOperatorDays>[number]
  lastDay?: ReturnType<typeof rollupOperatorDays>[number]
  ops: { id: string; number: number; name: string; units: number; defective: number; minutes: number; standard: number }[]
}) {
  const focus = todayDay ?? lastDay
  const isToday = Boolean(todayDay)

  if (!focus) {
    return (
      <EmptyState
        title="Sin captura reciente"
        description="Cuando registren producción, aquí se verá el día."
      />
    )
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
        {isToday ? 'Hoy' : `Última jornada · ${focus.production_date}`}
      </p>
      <p className="mt-2 text-4xl font-semibold tracking-tight tabular">{formatPercent(focus.efficiency_percentage)}</p>
      <div className="mt-3">
        <StatusBadge value={focus.efficiency_percentage} />
      </div>
      <p className="mt-3 text-sm text-zinc-500">
        {formatMinutes(focus.total_delivered_minutes)} min · {focus.total_delivered_units} und
        {focus.total_defective_units > 0
          ? ` · ${focus.total_defective_units} def. (${formatPercent(mermaPercent(focus.total_defective_units, focus.total_delivered_units))})`
          : ''}
      </p>
      {focus.reference_labels.length > 0 ? (
        <p className="mt-1 text-sm text-zinc-400">{focus.reference_labels.join(' · ')}</p>
      ) : null}
      {ops.length > 0 ? (
        <ul className="mt-5 space-y-1.5 border-t border-zinc-100 pt-4 text-sm text-zinc-700">
          {ops.map((item) => (
            <li key={item.id}>
              <span className="font-semibold tabular">{item.number}</span>
              {' — '}
              {item.name}
              <span className="text-zinc-400">
                {' '}
                ({item.units} und
                {item.defective > 0 ? ` / ${item.defective} def.` : ''} · {formatMinutes(item.minutes)} min)
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function MonthPanel({
  period,
  chartData,
  days,
  monthLabel,
}: {
  period: ReturnType<typeof summarizeDays>
  chartData: ReturnType<typeof fillDailySeries>
  days: ReturnType<typeof rollupOperatorDays>
  monthLabel: string
}) {
  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <QuietStat label={`Eficiencia · ${monthLabel}`} value={period.days ? formatPercent(period.efficiency) : '—'} />
        <QuietStat
          label="Merma"
          value={period.units ? formatPercent(mermaPercent(period.defective, period.units)) : '—'}
        />
        <QuietStat label="Días con captura" value={String(period.days)} />
      </div>
      <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-medium text-zinc-800">Este mes</h2>
        <EfficiencyArea data={chartData} />
      </div>
      {days.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <ul>
            {[...days].reverse().map((item) => (
              <li
                key={item.production_date}
                className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-2.5 first:border-t-0"
              >
                <span className="tabular text-sm text-zinc-600">{item.production_date}</span>
                <StatusBadge value={item.efficiency_percentage} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState title="Sin capturas este mes" description="El historial sigue guardado en la pestaña Historial." />
      )}
    </div>
  )
}

function HistoryPanel({
  from,
  to,
  onFrom,
  onTo,
  referenceId,
  orderId,
  onReference,
  onOrder,
  references,
  orders,
  period,
  days,
  mix,
  loading,
}: {
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
  referenceId: string
  orderId: string
  onReference: (value: string) => void
  onOrder: (value: string) => void
  references: GarmentReference[]
  orders: ProductionOrder[]
  period: ReturnType<typeof summarizeDays>
  days: ReturnType<typeof rollupOperatorDays>
  mix: {
    id: string
    number: number
    name: string
    machine: string
    standard: number
    units: number
    defective: number
    minutes: number
  }[]
  loading: boolean
}) {
  return (
    <div>
      <p className="mb-4 text-sm text-zinc-400">Archivo. No es la medida del día ni del mes.</p>
      <div className="mb-4 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Desde">
          <TextInput type="date" value={from} onChange={(event) => onFrom(event.target.value)} />
        </Field>
        <Field label="Hasta">
          <TextInput type="date" value={to} onChange={(event) => onTo(event.target.value)} />
        </Field>
        <Field label="Referencia">
          <SelectInput value={referenceId} onChange={(event) => onReference(event.target.value)}>
            <option value="">Todas</option>
            {references.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Orden / lote">
          <SelectInput value={orderId} onChange={(event) => onOrder(event.target.value)}>
            <option value="">Todas</option>
            {orders.map((item) => (
              <option key={item.id} value={item.id}>
                {item.order_number}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <QuietStat label="Eficiencia del rango" value={period.days ? formatPercent(period.efficiency) : '—'} />
        <QuietStat label="Minutos" value={period.days ? formatMinutes(period.minutes) : '—'} />
        <QuietStat label="Días" value={String(period.days)} />
      </div>

      <div className="mb-5">
        <p className="mb-3 text-sm font-medium text-zinc-700 sm:hidden">Día a día</p>
        {days.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-400 sm:hidden">
            {loading ? 'Cargando…' : 'Sin historial en el rango.'}
          </p>
        ) : (
          <RecordCardList>
            {[...days].reverse().map((item) => (
              <RecordCard key={item.production_date} title={item.production_date}>
                <RecordField label="Prendas">{item.reference_labels.join(' · ') || '—'}</RecordField>
                <RecordField label="Und">{item.total_delivered_units}</RecordField>
                <RecordField label="Def.">{item.total_defective_units}</RecordField>
                <RecordField label="Eficiencia">
                  <StatusBadge value={item.efficiency_percentage} />
                </RecordField>
              </RecordCard>
            ))}
          </RecordCardList>
        )}
        <DesktopOnly>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <div className="px-4 py-3 text-sm font-medium text-zinc-700">Día a día</div>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Prendas</th>
              <th className="px-4 py-2 font-medium">Und</th>
              <th className="px-4 py-2 font-medium">Def.</th>
              <th className="px-4 py-2 font-medium">Eficiencia</th>
            </tr>
          </thead>
          <tbody>
            {days.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  {loading ? 'Cargando…' : 'Sin historial en el rango.'}
                </td>
              </tr>
            ) : (
              [...days].reverse().map((item) => (
                <tr key={item.production_date} className="border-t border-zinc-100">
                  <td className="px-4 py-2.5 tabular">{item.production_date}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{item.reference_labels.join(' · ')}</td>
                  <td className="px-4 py-2.5 tabular">{item.total_delivered_units}</td>
                  <td className="px-4 py-2.5 tabular">{item.total_defective_units}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge value={item.efficiency_percentage} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </DesktopOnly>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-zinc-700 sm:hidden">Acumulado por operación</p>
        {mix.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-400 sm:hidden">
            Sin operaciones en el rango.
          </p>
        ) : (
          <RecordCardList>
            {mix.map((item) => (
              <RecordCard key={item.id} title={`${item.number} · ${item.name}`}>
                <RecordField label="Máquina">{item.machine}</RecordField>
                <RecordField label="Und/hora">{expectedUnitsPerHour(item.standard).toFixed(0)}</RecordField>
                <RecordField label="Unidades">{item.units}</RecordField>
                <RecordField label="Minutos">{formatMinutes(item.minutes)}</RecordField>
              </RecordCard>
            ))}
          </RecordCardList>
        )}
        <DesktopOnly>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <div className="px-4 py-3 text-sm font-medium text-zinc-700">Acumulado por operación</div>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">Nº</th>
              <th className="px-4 py-2 font-medium">Proceso</th>
              <th className="px-4 py-2 font-medium">Máquina</th>
              <th className="px-4 py-2 font-medium">Und/hora</th>
              <th className="px-4 py-2 font-medium">Unidades</th>
              <th className="px-4 py-2 font-medium">Minutos</th>
            </tr>
          </thead>
          <tbody>
            {mix.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Sin operaciones en el rango.
                </td>
              </tr>
            ) : (
              mix.map((item) => (
                <tr key={item.id} className="border-t border-zinc-100">
                  <td className="px-4 py-2.5 font-semibold tabular">{item.number}</td>
                  <td className="px-4 py-2.5">{item.name}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{item.machine}</td>
                  <td className="px-4 py-2.5 tabular">{expectedUnitsPerHour(item.standard).toFixed(0)}</td>
                  <td className="px-4 py-2.5 tabular">{item.units}</td>
                  <td className="px-4 py-2.5 tabular">{formatMinutes(item.minutes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </DesktopOnly>
      </div>
    </div>
  )
}

function QuietStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular">{value}</p>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-0.5 font-medium text-zinc-800">{value}</p>
    </div>
  )
}
