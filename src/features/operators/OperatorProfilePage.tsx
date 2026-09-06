import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, SelectInput, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  daysAgoISO,
  expectedUnitsPerHour,
  formatMinutes,
  formatPercent,
  mermaPercent,
  rollupOperatorDays,
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

export function OperatorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [from, setFrom] = useState(daysAgoISO(30))
  const [to, setTo] = useState(todayISO())
  const [referenceId, setReferenceId] = useState('')
  const [orderId, setOrderId] = useState('')

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
    queryFn: async () => {
      const { data, error } = await supabase.from('garment_references').select('*').order('code')
      if (error) throw error
      return data as GarmentReference[]
    },
  })

  const ordersQuery = useQuery({
    queryKey: ['production_orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('production_orders').select('*').order('order_number')
      if (error) throw error
      return data as ProductionOrder[]
    },
  })

  const summaryQuery = useQuery({
    queryKey: ['daily_operator_efficiency', id, from, to, referenceId, orderId],
    enabled: Boolean(id),
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

  const detailQuery = useQuery({
    queryKey: ['production_entry_calculations', id, from, to, orderId],
    enabled: Boolean(id),
    queryFn: async () => {
      let request = supabase
        .from('production_entry_calculations')
        .select('*')
        .eq('operator_id', id!)
        .gte('production_date', from)
        .lte('production_date', to)
      if (orderId) request = request.eq('production_order_id', orderId)
      const { data, error } = await request
      if (error) throw error
      return data as ProductionEntryCalculation[]
    },
  })

  const days = useMemo(() => rollupOperatorDays(summaryQuery.data ?? []), [summaryQuery.data])
  const lastDay = days.at(-1)

  const period = useMemo(() => {
    const minutes = days.reduce((sum, item) => sum + item.total_delivered_minutes, 0)
    const units = days.reduce((sum, item) => sum + item.total_delivered_units, 0)
    const defective = days.reduce((sum, item) => sum + item.total_defective_units, 0)
    const capacity = days.reduce((sum, item) => sum + item.installed_capacity_minutes, 0)
    const efficiency = capacity > 0 ? (minutes / capacity) * 100 : 0
    return { minutes, units, defective, capacity, efficiency, days: days.length }
  }, [days])

  const operationMix = useMemo(() => {
    const allowedOrders = new Set((summaryQuery.data ?? []).map((row) => row.production_order_id))
    const byOp = new Map<
      string,
      { id: string; units: number; defective: number; minutes: number }
    >()

    for (const row of detailQuery.data ?? []) {
      if (orderId && row.production_order_id !== orderId) continue
      if (referenceId && !allowedOrders.has(row.production_order_id)) continue
      const current = byOp.get(row.reference_operation_id)
      const units = Number(row.delivered_units)
      const defective = Number(row.defective_units)
      const minutes = Number(row.delivered_minutes)
      if (!current) {
        byOp.set(row.reference_operation_id, {
          id: row.reference_operation_id,
          units,
          defective,
          minutes,
        })
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
  }, [detailQuery.data, operationsQuery.data, orderId, referenceId, summaryQuery.data])

  const lastDayOps = useMemo(() => {
    if (!lastDay) return []
    return (detailQuery.data ?? [])
      .filter((row) => row.production_date === lastDay.production_date)
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
  }, [detailQuery.data, lastDay, operationsQuery.data])

  const operator = operatorQuery.data
  const chartData = days.map((item) => ({
    date: item.production_date.slice(5),
    efficiency: Number(item.efficiency_percentage.toFixed(1)),
  }))

  return (
    <div>
      <Link to="/operarios" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Volver a operarios
      </Link>
      <PageHeader
        title={operator ? operator.name : 'Ficha de operario'}
        description="Historial diario, operaciones realizadas y productividad acumulada."
      />

      {operatorQuery.isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {operatorQuery.error ? <p className="text-sm text-rose-600">No se encontró el operario.</p> : null}

      {operator ? (
        <>
          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Código" value={operator.code || '—'} />
              <Info label="Cargo" value={operator.position || '—'} />
              <Info label="Línea / módulo" value={operator.line || '—'} />
              <Info
                label="Estado"
                value={operator.active ? 'Activo' : 'Inactivo'}
                tone={operator.active ? 'ok' : 'muted'}
              />
              <Info label="Documento" value={operator.document || '—'} />
              <Info label="Ingreso" value={operator.hire_date || '—'} />
              <Info label="Notas" value={operator.notes || '—'} />
            </div>
          </div>

          <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Desde">
              <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="Hasta">
              <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            <Field label="Referencia">
              <SelectInput value={referenceId} onChange={(event) => setReferenceId(event.target.value)}>
                <option value="">Todas</option>
                {referencesQuery.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Orden / lote">
              <SelectInput value={orderId} onChange={(event) => setOrderId(event.target.value)}>
                <option value="">Todas</option>
                {ordersQuery.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.order_number}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Eficiencia del periodo" value={formatPercent(period.efficiency)} />
            <Stat label="Minutos producidos" value={formatMinutes(period.minutes)} />
            <Stat label="Unidades" value={String(period.units)} />
            <Stat
              label="Defectuosas"
              value={`${period.defective} · ${formatPercent(mermaPercent(period.defective, period.units))}`}
            />
            <Stat label="Días con captura" value={String(period.days)} />
          </div>

          {lastDay ? (
            <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-800">Última jornada</h2>
                  <p className="text-xs text-zinc-500">
                    {lastDay.production_date} · {lastDay.order_numbers.join(', ')} ·{' '}
                    {lastDay.reference_labels.join(' · ')}
                  </p>
                </div>
                <StatusBadge value={lastDay.efficiency_percentage} />
              </div>
              <p className="mb-3 text-sm text-zinc-600">
                {formatMinutes(lastDay.total_delivered_minutes)} min /{' '}
                {formatMinutes(lastDay.installed_capacity_minutes)} de meta · {lastDay.total_delivered_units} und ·{' '}
                {lastDay.total_defective_units} def.
              </p>
              {lastDayOps.length === 0 ? (
                <p className="text-sm text-zinc-500">Sin detalle de operaciones ese día.</p>
              ) : (
                <ul className="space-y-1 text-sm text-zinc-700">
                  {lastDayOps.map((item) => (
                    <li key={item.id}>
                      <span className="font-semibold tabular">{item.number}</span>
                      {' — '}
                      {item.name}
                      <span className="text-zinc-500">
                        {' '}
                        ({item.units} und
                        {item.defective > 0 ? ` / ${item.defective} def.` : ''} × {item.standard.toFixed(2)} min ={' '}
                        {formatMinutes(item.minutes)} min)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800">Productividad día a día</h2>
            <div className="h-72">
              {chartData.length === 0 ? (
                <p className="grid h-full place-items-center text-sm text-zinc-500">
                  Sin capturas en este rango.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 120]} />
                    <Tooltip formatter={(value) => formatPercent(Number(value ?? 0))} />
                    <Line type="monotone" dataKey="efficiency" stroke="#3f3f46" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="mb-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold">
              Qué hizo cada día
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Lotes</th>
                  <th className="px-3 py-2.5">Prendas</th>
                  <th className="px-3 py-2.5">Unidades</th>
                  <th className="px-3 py-2.5">Defectuosas</th>
                  <th className="px-3 py-2.5">Minutos</th>
                  <th className="px-3 py-2.5">Eficiencia</th>
                </tr>
              </thead>
              <tbody>
                {days.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                      Sin historial en el rango.
                    </td>
                  </tr>
                ) : (
                  [...days].reverse().map((item) => (
                    <tr key={item.production_date} className="border-t border-zinc-100">
                      <td className="px-3 py-2.5 tabular">{item.production_date}</td>
                      <td className="px-3 py-2.5">{item.order_numbers.join(', ')}</td>
                      <td className="px-3 py-2.5 text-zinc-600">{item.reference_labels.join(' · ')}</td>
                      <td className="px-3 py-2.5 tabular">{item.total_delivered_units}</td>
                      <td className="px-3 py-2.5 tabular">{item.total_defective_units}</td>
                      <td className="px-3 py-2.5 tabular">{formatMinutes(item.total_delivered_minutes)}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge value={item.efficiency_percentage} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold">
              Acumulado por operación
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">Nº</th>
                  <th className="px-3 py-2.5">Proceso</th>
                  <th className="px-3 py-2.5">Máquina</th>
                  <th className="px-3 py-2.5">Min/und</th>
                  <th className="px-3 py-2.5">Und/hora 100%</th>
                  <th className="px-3 py-2.5">Unidades</th>
                  <th className="px-3 py-2.5">Defectuosas</th>
                  <th className="px-3 py-2.5">Minutos</th>
                </tr>
              </thead>
              <tbody>
                {operationMix.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                      Sin operaciones en el rango.
                    </td>
                  </tr>
                ) : (
                  operationMix.map((item) => (
                    <tr key={item.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2.5 font-semibold tabular">{item.number}</td>
                      <td className="px-3 py-2.5">{item.name}</td>
                      <td className="px-3 py-2.5 text-zinc-600">{item.machine}</td>
                      <td className="px-3 py-2.5 tabular">{item.standard.toFixed(2)}</td>
                      <td className="px-3 py-2.5 tabular">{expectedUnitsPerHour(item.standard).toFixed(0)}</td>
                      <td className="px-3 py-2.5 tabular">{item.units}</td>
                      <td className="px-3 py-2.5 tabular">{item.defective}</td>
                      <td className="px-3 py-2.5 tabular">{formatMinutes(item.minutes)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {days.length === 0 && !summaryQuery.isLoading ? (
            <div className="mt-5">
              <EmptyState
                title="Este operario aún no tiene capturas en el rango"
                description="Cuando registren producción diaria, aquí se verá el historial y el acumulado."
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Info({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ok' | 'muted'
}) {
  const color = tone === 'ok' ? 'text-emerald-700' : tone === 'muted' ? 'text-zinc-400' : 'text-zinc-900'
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 font-medium ${color}`}>{value}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
    </div>
  )
}
