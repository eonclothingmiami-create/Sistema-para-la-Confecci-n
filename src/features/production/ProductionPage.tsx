import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Field, PrimaryButton, SelectInput, TextArea, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { DEFAULT_CAPACITY, deliveredMinutes, formatMinutes, todayISO } from '../../lib/efficiency'
import { queryClient } from '../../lib/query-client'
import { supabase } from '../../lib/supabase'
import type {
  DailyProductionEntry,
  DailyProductionHeader,
  Operator,
  ProductionOrder,
  ReferenceOperation,
} from '../../types/database'

interface EntryDraft {
  reference_operation_id: string
  delivered_units: number
  defective_units: number
  notes: string
}

export function ProductionPage() {
  const [date, setDate] = useState(todayISO())
  const [operatorId, setOperatorId] = useState('')
  const [orderId, setOrderId] = useState('')
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [headerNotes, setHeaderNotes] = useState('')
  const [drafts, setDrafts] = useState<EntryDraft[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const operatorsQuery = useQuery({
    queryKey: ['operators'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operators').select('*').eq('active', true).order('name')
      if (error) throw error
      return data as Operator[]
    },
  })

  const ordersQuery = useQuery({
    queryKey: ['production_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('production_orders')
        .select('*, garment_references(id, code, name)')
        .order('order_number')
      if (error) throw error
      return data as ProductionOrder[]
    },
  })

  const selectedOrder = ordersQuery.data?.find((item) => item.id === orderId)
  const referenceId = selectedOrder?.reference_id

  const operationsQuery = useQuery({
    queryKey: ['reference_operations', referenceId],
    enabled: Boolean(referenceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reference_operations')
        .select('*')
        .eq('reference_id', referenceId!)
        .eq('active', true)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('operation_number')
      if (error) throw error
      return data as ReferenceOperation[]
    },
  })

  const existingQuery = useQuery({
    queryKey: ['daily_header', date, operatorId, orderId],
    enabled: Boolean(date && operatorId && orderId),
    queryFn: async () => {
      const { data: header, error } = await supabase
        .from('daily_production_headers')
        .select('*')
        .eq('production_date', date)
        .eq('operator_id', operatorId)
        .eq('production_order_id', orderId)
        .maybeSingle()
      if (error) throw error
      if (!header) return { header: null as DailyProductionHeader | null, entries: [] as DailyProductionEntry[] }
      const { data: entries, error: entriesError } = await supabase
        .from('daily_production_entries')
        .select('*')
        .eq('header_id', header.id)
      if (entriesError) throw entriesError
      return {
        header: header as DailyProductionHeader,
        entries: (entries ?? []) as DailyProductionEntry[],
      }
    },
  })

  useEffect(() => {
    const operations = operationsQuery.data ?? []
    const existing = existingQuery.data
    setDrafts(
      operations.map((operation) => {
        const found = existing?.entries.find((entry) => entry.reference_operation_id === operation.id)
        return {
          reference_operation_id: operation.id,
          delivered_units: found?.delivered_units ?? 0,
          defective_units: found?.defective_units ?? 0,
          notes: found?.notes ?? '',
        }
      }),
    )
    if (existing?.header) {
      setCapacity(Number(existing.header.installed_capacity_minutes))
      setStartTime(existing.header.start_time?.slice(0, 5) ?? '')
      setEndTime(existing.header.end_time?.slice(0, 5) ?? '')
      setHeaderNotes(existing.header.notes ?? '')
    } else {
      setCapacity(DEFAULT_CAPACITY)
      setStartTime('')
      setEndTime('')
      setHeaderNotes('')
    }
  }, [operationsQuery.data, existingQuery.data])

  const totals = useMemo(() => {
    const operations = operationsQuery.data ?? []
    const perOp = drafts.map((draft) => {
      const operation = operations.find((item) => item.id === draft.reference_operation_id)
      const minutes = deliveredMinutes(Number(operation?.standard_minutes ?? 0), draft.delivered_units)
      return { ...draft, minutes, standard: Number(operation?.standard_minutes ?? 0) }
    })
    const totalMinutes = perOp.reduce((sum, item) => sum + item.minutes, 0)
    const efficiency = capacity > 0 ? (totalMinutes / capacity) * 100 : 0
    return { perOp, totalMinutes, efficiency }
  }, [drafts, operationsQuery.data, capacity])

  const save = useMutation({
    mutationFn: async () => {
      if (!operatorId || !orderId) throw new Error('Selecciona operario y orden')
      const headerPayload = {
        production_date: date,
        operator_id: operatorId,
        production_order_id: orderId,
        installed_capacity_minutes: capacity,
        start_time: startTime || null,
        end_time: endTime || null,
        notes: headerNotes || null,
      }
      const { data: header, error: headerError } = await supabase
        .from('daily_production_headers')
        .upsert(headerPayload, { onConflict: 'production_date,operator_id,production_order_id' })
        .select('*')
        .single()
      if (headerError) throw headerError

      const rows = drafts.map((draft) => ({
        header_id: header.id,
        reference_operation_id: draft.reference_operation_id,
        delivered_units: draft.delivered_units,
        defective_units: draft.defective_units,
        notes: draft.notes || null,
      }))

      if (rows.length > 0) {
        const { error: entriesError } = await supabase
          .from('daily_production_entries')
          .upsert(rows, { onConflict: 'header_id,reference_operation_id' })
        if (entriesError) throw entriesError
      }
    },
    onSuccess: async () => {
      setMessage('Producción guardada.')
      await queryClient.invalidateQueries()
    },
    onError: () => {
      setMessage('No se pudo guardar. Revisa que exista ruta operacional.')
    },
  })

  function updateDraft(operationId: string, patch: Partial<EntryDraft>) {
    setDrafts((current) =>
      current.map((item) => (item.reference_operation_id === operationId ? { ...item, ...patch } : item)),
    )
  }

  return (
    <div>
      <PageHeader
        title="Registro diario de producción"
        description="Selecciona fecha, operario y lote. Las operaciones se cargan desde la ruta de la referencia."
      />

      <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Fecha">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Operario">
          <SelectInput value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {operatorsQuery.data?.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Orden / lote">
          <SelectInput value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {ordersQuery.data?.map((order) => (
              <option key={order.id} value={order.id}>
                {order.order_number}
                {order.garment_references ? ` · ${order.garment_references.code}` : ''}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Referencia">
          <TextInput
            readOnly
            value={
              selectedOrder?.garment_references
                ? `${selectedOrder.garment_references.code} · ${selectedOrder.garment_references.name}`
                : 'Se carga al elegir el lote'
            }
          />
        </Field>
        <Field label="Capacidad instalada (min)">
          <TextInput
            type="number"
            min={1}
            step="0.01"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Hora inicio">
          <TextInput type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="Hora fin">
          <TextInput type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
        <Field label="Novedades del día">
          <TextInput value={headerNotes} onChange={(e) => setHeaderNotes(e.target.value)} />
        </Field>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs text-zinc-500">Minutos entregados</p>
          <p className="tabular text-lg font-semibold">{formatMinutes(totals.totalMinutes)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Capacidad</p>
          <p className="tabular text-lg font-semibold">{formatMinutes(capacity)}</p>
        </div>
        <StatusBadge value={totals.efficiency} />
      </div>

      {orderId && (operationsQuery.data?.length ?? 0) === 0 && !operationsQuery.isLoading ? (
        <p className="mb-4 text-sm text-amber-700">Esta referencia no tiene operaciones activas.</p>
      ) : null}

      {(operationsQuery.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Nº</th>
                <th className="px-3 py-2.5">Operación</th>
                <th className="px-3 py-2.5">Min/und</th>
                <th className="px-3 py-2.5">Und. entregadas</th>
                <th className="px-3 py-2.5">Defectuosas</th>
                <th className="px-3 py-2.5">Min. entregados</th>
                <th className="px-3 py-2.5">Novedades</th>
              </tr>
            </thead>
            <tbody>
              {operationsQuery.data?.map((operation) => {
                const draft = drafts.find((item) => item.reference_operation_id === operation.id)
                const minutes = deliveredMinutes(Number(operation.standard_minutes), draft?.delivered_units ?? 0)
                return (
                  <tr key={operation.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 tabular">{operation.operation_number}</td>
                    <td className="px-3 py-2 font-medium">{operation.operation_name}</td>
                    <td className="px-3 py-2 tabular">{Number(operation.standard_minutes).toFixed(4)}</td>
                    <td className="px-3 py-2">
                      <TextInput
                        type="number"
                        min={0}
                        value={draft?.delivered_units ?? 0}
                        onChange={(e) =>
                          updateDraft(operation.id, { delivered_units: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        type="number"
                        min={0}
                        value={draft?.defective_units ?? 0}
                        onChange={(e) =>
                          updateDraft(operation.id, { defective_units: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="px-3 py-2 tabular font-medium">{formatMinutes(minutes)}</td>
                    <td className="px-3 py-2">
                      <TextInput
                        value={draft?.notes ?? ''}
                        onChange={(e) => updateDraft(operation.id, { notes: e.target.value })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PrimaryButton
          disabled={!operatorId || !orderId || save.isPending}
          onClick={() => {
            setMessage(null)
            void save.mutate()
          }}
        >
          {save.isPending ? 'Guardando…' : 'Guardar captura'}
        </PrimaryButton>
        {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
      </div>

      <div className="mt-4">
        <Field label="Observaciones adicionales">
          <TextArea value={headerNotes} onChange={(e) => setHeaderNotes(e.target.value)} />
        </Field>
      </div>
    </div>
  )
}
