import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { DesktopOnly, RecordCard, RecordField } from '../../components/ui/RecordCard'
import { supabase } from '../../lib/supabase'
import type { GarmentReference, OrderOperationProgress, OrderStatus } from '../../types/database'

const OPEN_STATUSES: OrderStatus[] = ['pendiente', 'en_proceso', 'pausada']

const STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminada: 'Terminada',
  pausada: 'Pausada',
}

function progressPercent(delivered: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((delivered / total) * 100))
}

export function ReferenceProgressPage() {
  const { id } = useParams<{ id: string }>()

  const referenceQuery = useQuery({
    queryKey: ['garment_reference', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('garment_references').select('*').eq('id', id!).single()
      if (error) throw error
      return data as GarmentReference
    },
  })

  const progressQuery = useQuery({
    queryKey: ['order_operation_progress', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_operation_progress')
        .select('*')
        .eq('reference_id', id!)
        .in('status', OPEN_STATUSES)
        .order('order_number', { ascending: true })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('operation_number', { ascending: true })
      if (error) throw error
      return data as OrderOperationProgress[]
    },
  })

  const lots = useMemo(() => {
    const map = new Map<
      string,
      {
        production_order_id: string
        order_number: string
        status: OrderStatus
        total_quantity: number
        operations: OrderOperationProgress[]
      }
    >()
    for (const row of progressQuery.data ?? []) {
      const current = map.get(row.production_order_id)
      if (!current) {
        map.set(row.production_order_id, {
          production_order_id: row.production_order_id,
          order_number: row.order_number,
          status: row.status,
          total_quantity: row.total_quantity,
          operations: [row],
        })
        continue
      }
      current.operations.push(row)
    }
    return [...map.values()]
  }, [progressQuery.data])

  const reference = referenceQuery.data

  return (
    <div>
      <Link to="/referencias" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Volver a referencias
      </Link>
      <PageHeader
        title={reference ? `Avance · ${reference.code}` : 'Avance'}
        actions={
          id ? (
            <Link
              to={`/referencias/${id}/ruta`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Ruta
            </Link>
          ) : null
        }
      />

      {progressQuery.isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {progressQuery.error ? (
        <p className="text-sm text-rose-600">No se pudo cargar el avance de esta prenda.</p>
      ) : null}

      {!progressQuery.isLoading && lots.length === 0 ? (
        <EmptyState
          title="Sin lotes abiertos"
          description="Cuando haya una orden pendiente o en proceso y una ruta de operaciones, aquí verás cuántas unidades faltan en cada proceso."
        />
      ) : null}

      <div className="space-y-6">
        {lots.map((lot) => (
          <section key={lot.production_order_id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">Lote {lot.order_number}</p>
                <p className="text-xs text-zinc-500">
                  {STATUS_LABEL[lot.status]} · {lot.total_quantity} und
                </p>
              </div>
            </div>

            <div className="space-y-3 p-3 sm:hidden">
              {lot.operations.map((item) => (
                <RecordCard
                  key={item.reference_operation_id}
                  title={`${item.operation_number} · ${item.operation_name}`}
                  subtitle={
                    item.over_delivered
                      ? `Hecho ${item.delivered_units} de ${item.total_quantity} · faltan ${item.remaining_units}`
                      : `Hecho ${item.delivered_units} · faltan ${item.remaining_units}`
                  }
                >
                  <RecordField label="Hecho">{item.delivered_units}</RecordField>
                  <RecordField label="Faltan">{item.remaining_units}</RecordField>
                  {item.over_delivered ? (
                    <p className="text-xs text-amber-700">Hay más unidades entregadas que las del lote.</p>
                  ) : null}
                  <div className="pt-1">
                    <ProgressBar
                      percent={progressPercent(item.delivered_units, item.total_quantity)}
                      over={item.over_delivered}
                    />
                  </div>
                </RecordCard>
              ))}
            </div>

            <DesktopOnly>
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5">Nº</th>
                    <th className="px-4 py-2.5">Proceso</th>
                    <th className="px-4 py-2.5">Hecho</th>
                    <th className="px-4 py-2.5">Faltan</th>
                    <th className="px-4 py-2.5">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {lot.operations.map((item) => (
                    <tr key={item.reference_operation_id} className="border-t border-zinc-100">
                      <td className="px-4 py-2.5 tabular font-medium">{item.operation_number}</td>
                      <td className="px-4 py-2.5 text-zinc-800">{item.operation_name}</td>
                      <td className="px-4 py-2.5 tabular text-zinc-700">
                        {item.over_delivered ? `${item.delivered_units}/${item.total_quantity}` : item.delivered_units}
                      </td>
                      <td className="px-4 py-2.5 tabular font-medium text-zinc-900">
                        {item.remaining_units}
                        {item.over_delivered ? (
                          <span className="ml-2 text-xs font-normal text-amber-700">Por encima del lote</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <ProgressBar
                          percent={progressPercent(item.delivered_units, item.total_quantity)}
                          over={item.over_delivered}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopOnly>
          </section>
        ))}
      </div>
    </div>
  )
}

function ProgressBar({ percent, over }: { percent: number; over: boolean }) {
  return (
    <div className="flex min-w-[8rem] items-center gap-2">
      <div className="h-2 min-w-0 flex-1 rounded-full bg-zinc-200">
        {percent > 0 ? (
          <div
            className={`h-2 rounded-full ${over ? 'bg-amber-500' : 'bg-zinc-900'}`}
            style={{ width: `${percent}%` }}
          />
        ) : null}
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular text-zinc-500">
        {percent > 0 ? `${percent}%` : '0%'}
      </span>
    </div>
  )
}
