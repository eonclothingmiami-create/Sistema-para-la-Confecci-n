import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, PrimaryButton, SelectInput, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { aggregateOperatorsByDay, formatMinutes, formatPercent, todayISO } from '../../lib/efficiency'
import { supabase } from '../../lib/supabase'
import type {
  DailyOperatorEfficiency,
  GarmentReference,
  Operator,
  ProductionEntryCalculation,
  ProductionOrder,
} from '../../types/database'

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function ReportsPage() {
  const [from, setFrom] = useState(daysAgo(7))
  const [to, setTo] = useState(todayISO())
  const [operatorId, setOperatorId] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [orderId, setOrderId] = useState('')

  const operatorsQuery = useQuery({
    queryKey: ['operators'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operators').select('*').order('name')
      if (error) throw error
      return data as Operator[]
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
    queryKey: ['daily_operator_efficiency', from, to, operatorId, referenceId, orderId],
    queryFn: async () => {
      let request = supabase
        .from('daily_operator_efficiency')
        .select('*')
        .gte('production_date', from)
        .lte('production_date', to)
      if (operatorId) request = request.eq('operator_id', operatorId)
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
      const { data, error } = await supabase.from('reference_operations').select('id, operation_name, operation_number')
      if (error) throw error
      return data as { id: string; operation_name: string; operation_number: number }[]
    },
  })

  const detailQuery = useQuery({
    queryKey: ['production_entry_calculations', from, to, operatorId, orderId],
    queryFn: async () => {
      let request = supabase
        .from('production_entry_calculations')
        .select('*')
        .gte('production_date', from)
        .lte('production_date', to)
      if (operatorId) request = request.eq('operator_id', operatorId)
      if (orderId) request = request.eq('production_order_id', orderId)
      const { data, error } = await request
      if (error) throw error
      return data as ProductionEntryCalculation[]
    },
  })

  const rows = summaryQuery.data ?? []
  const ranking = useMemo(() => aggregateOperatorsByDay(rows), [rows])
  const totalUnits = rows.reduce((sum, row) => sum + Number(row.total_delivered_units), 0)
  const totalMinutes = rows.reduce((sum, row) => sum + Number(row.total_delivered_minutes), 0)
  const avgEfficiency =
    ranking.length > 0
      ? ranking.reduce((sum, item) => sum + item.efficiency_percentage, 0) / ranking.length
      : 0

  function exportCsv() {
    const header = [
      'fecha',
      'operario',
      'orden',
      'referencia',
      'unidades',
      'defectuosas',
      'minutos',
      'capacidad',
      'eficiencia',
    ]
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
        title="Reportes"
        description="Filtra por rango y exporta el detalle."
        actions={
          <PrimaryButton onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> Exportar CSV
          </PrimaryButton>
        }
      />

      <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Desde">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Operario">
          <SelectInput value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">Todos</option>
            {operatorsQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Referencia">
          <SelectInput value={referenceId} onChange={(e) => setReferenceId(e.target.value)}>
            <option value="">Todas</option>
            {referencesQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Orden / lote">
          <SelectInput value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Todas</option>
            {ordersQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.order_number}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Eficiencia promedio" value={formatPercent(avgEfficiency)} />
        <Stat label="Unidades entregadas" value={String(totalUnits)} />
        <Stat label="Minutos producidos" value={formatMinutes(totalMinutes)} />
      </div>

      <div className="mb-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold">Ranking de operarios</div>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Operario</th>
              <th className="px-3 py-2">Minutos</th>
              <th className="px-3 py-2">Eficiencia</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((item, index) => (
              <tr key={item.operator_id} className="border-t border-zinc-100">
                <td className="px-3 py-2 tabular">{index + 1}</td>
                <td className="px-3 py-2 font-medium">
                  <Link to={`/operarios/${item.operator_id}`} className="hover:underline">
                    {item.operator_name}
                  </Link>
                </td>
                <td className="px-3 py-2 tabular">{formatMinutes(item.total_delivered_minutes)}</td>
                <td className="px-3 py-2">
                  <StatusBadge value={item.efficiency_percentage} />
                </td>
              </tr>
            ))}
            {ranking.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  Sin datos en el rango.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold">Detalle por operación</div>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Operación</th>
              <th className="px-3 py-2">Unidades</th>
              <th className="px-3 py-2">Defectuosas</th>
              <th className="px-3 py-2">Min/und</th>
              <th className="px-3 py-2">Minutos</th>
            </tr>
          </thead>
          <tbody>
            {(detailQuery.data ?? []).map((row) => (
              <tr key={row.entry_id} className="border-t border-zinc-100">
                <td className="px-3 py-2">{row.production_date}</td>
                <td className="px-3 py-2">
                  {operationsQuery.data?.find((item) => item.id === row.reference_operation_id)?.operation_name ??
                    row.reference_operation_id.slice(0, 8)}
                </td>
                <td className="px-3 py-2 tabular">{row.delivered_units}</td>
                <td className="px-3 py-2 tabular">{row.defective_units}</td>
                <td className="px-3 py-2 tabular">{Number(row.standard_minutes).toFixed(4)}</td>
                <td className="px-3 py-2 tabular">{formatMinutes(Number(row.delivered_minutes))}</td>
              </tr>
            ))}
            {(detailQuery.data?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  Sin detalle de operaciones.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
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
