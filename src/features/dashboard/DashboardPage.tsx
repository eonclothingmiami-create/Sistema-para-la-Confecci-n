import { useQuery } from '@tanstack/react-query'
import { Activity, Clock3, TriangleAlert, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Field, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusBadge, StatusDot } from '../../components/ui/StatusBadge'
import {
  aggregateOperatorsByDay,
  formatMinutes,
  formatPercent,
  overallEfficiency,
  todayISO,
} from '../../lib/efficiency'
import { supabase } from '../../lib/supabase'
import type {
  DailyOperatorEfficiency,
  OrderEfficiency,
  ReferenceEfficiency,
} from '../../types/database'

export function DashboardPage() {
  const [date, setDate] = useState(todayISO())

  const operatorRows = useQuery({
    queryKey: ['dashboard_today_operator_efficiency', date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_today_operator_efficiency')
        .select('*')
        .eq('production_date', date)
      if (error) throw error
      return data as DailyOperatorEfficiency[]
    },
  })

  const referenceRows = useQuery({
    queryKey: ['reference_efficiency', date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reference_efficiency')
        .select('*')
        .eq('production_date', date)
      if (error) throw error
      return data as ReferenceEfficiency[]
    },
  })

  const orderRows = useQuery({
    queryKey: ['order_efficiency', date],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_efficiency').select('*').eq('production_date', date)
      if (error) throw error
      return data as OrderEfficiency[]
    },
  })

  const summaries = useMemo(
    () => aggregateOperatorsByDay(operatorRows.data ?? []),
    [operatorRows.data],
  )
  const general = overallEfficiency(summaries)
  const minutes = summaries.reduce((sum, item) => sum + item.total_delivered_minutes, 0)
  const below = summaries.filter((item) => item.status === 'red').length

  return (
    <div>
      <PageHeader
        title="Dashboard operativo"
        description="Eficiencia del día. Se actualiza cuando cambian los registros de producción."
        actions={
          <Field label="Fecha">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Activity} label="Eficiencia general" value={formatPercent(general)} />
        <Kpi icon={Clock3} label="Minutos entregados" value={formatMinutes(minutes)} />
        <Kpi icon={Users} label="Operarios activos hoy" value={String(summaries.length)} />
        <Kpi icon={TriangleAlert} label="Operarios bajo meta" value={String(below)} />
      </div>

      {operatorRows.error ? (
        <p className="mb-4 text-sm text-rose-600">
          No se pudo leer el dashboard. ¿Ya corriste las migraciones SQL en Supabase?
        </p>
      ) : null}

      <div className="mb-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Operario</th>
              <th className="px-3 py-2.5">Min. entregados</th>
              <th className="px-3 py-2.5">Capacidad</th>
              <th className="px-3 py-2.5">Eficiencia</th>
              <th className="px-3 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {summaries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  Sin registros para esta fecha.
                </td>
              </tr>
            ) : (
              summaries.map((item) => (
                <tr key={item.operator_id} className="border-t border-zinc-100">
                  <td className="px-3 py-2.5 font-medium text-zinc-900">
                    <Link to={`/operarios/${item.operator_id}`} className="hover:underline">
                      {item.operator_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 tabular">{formatMinutes(item.total_delivered_minutes)}</td>
                  <td className="px-3 py-2.5 tabular">{formatMinutes(item.installed_capacity_minutes)}</td>
                  <td className="px-3 py-2.5 tabular font-semibold">
                    {formatPercent(item.efficiency_percentage)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <StatusDot value={item.efficiency_percentage} />
                      <StatusBadge value={item.efficiency_percentage} />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-800">Eficiencia por operario</h2>
        <div className="h-72">
          {summaries.length === 0 ? (
            <p className="grid h-full place-items-center text-sm text-zinc-500">Sin datos para graficar.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summaries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="operator_name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatPercent(Number(value ?? 0))} />
                <Bar dataKey="efficiency_percentage" fill="#3f3f46" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SimpleTable
          title="Eficiencia por referencia"
          rows={(referenceRows.data ?? []).map((row) => ({
            key: row.reference_id,
            name: `${row.reference_code} · ${row.reference_name}`,
            minutes: Number(row.total_delivered_minutes),
            efficiency: Number(row.efficiency_percentage),
          }))}
        />
        <SimpleTable
          title="Eficiencia por orden / lote"
          rows={(orderRows.data ?? []).map((row) => ({
            key: row.production_order_id,
            name: `${row.order_number} · ${row.reference_code}`,
            minutes: Number(row.total_delivered_minutes),
            efficiency: Number(row.efficiency_percentage),
          }))}
        />
      </div>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-zinc-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="truncate text-2xl font-semibold tabular text-zinc-900">{value}</p>
    </div>
  )
}

function SimpleTable({
  title,
  rows,
}: {
  title: string
  rows: { key: string; name: string; minutes: number; efficiency: number }[]
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-800">{title}</div>
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Minutos</th>
            <th className="px-3 py-2">Eficiencia</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-zinc-500">
                Sin datos.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="border-t border-zinc-100">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 tabular">{formatMinutes(row.minutes)}</td>
                <td className="px-3 py-2">
                  <StatusBadge value={row.efficiency} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
