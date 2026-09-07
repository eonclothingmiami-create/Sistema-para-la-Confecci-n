import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Field, PrimaryButton, SecondaryButton, SelectInput, TextArea, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { DesktopOnly, RecordCard, RecordCardList, RecordField } from '../../components/ui/RecordCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  DEFAULT_CAPACITY,
  capacityFromWorkedHours,
  deliveredMinutes,
  expectedUnitsPerHour,
  formatMinutes,
  formatPercent,
  hourlyPerformancePercent,
  hoursFromCapacity,
  todayISO,
} from '../../lib/efficiency'
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
  const [workedHours, setWorkedHours] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [headerNotes, setHeaderNotes] = useState('')
  const [drafts, setDrafts] = useState<EntryDraft[]>([])
  const [addOperationId, setAddOperationId] = useState('')
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
    const existing = existingQuery.data
    const existingRows = existing?.entries ?? []
    setDrafts(
      existingRows.map((entry) => ({
        reference_operation_id: entry.reference_operation_id,
        delivered_units: entry.delivered_units,
        defective_units: entry.defective_units,
        notes: entry.notes ?? '',
      })),
    )
    setAddOperationId('')
    if (existing?.header) {
      const savedCapacity = Number(existing.header.installed_capacity_minutes)
      setCapacity(savedCapacity)
      setWorkedHours(savedCapacity > 0 ? String(hoursFromCapacity(savedCapacity)) : '')
      setStartTime(existing.header.start_time?.slice(0, 5) ?? '')
      setEndTime(existing.header.end_time?.slice(0, 5) ?? '')
      setHeaderNotes(existing.header.notes ?? '')
    } else {
      setCapacity(DEFAULT_CAPACITY)
      setWorkedHours('')
      setStartTime('')
      setEndTime('')
      setHeaderNotes('')
    }
  }, [existingQuery.data, date, operatorId, orderId])

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
      if (drafts.length === 0) throw new Error('Agrega al menos una operación al cuadro')
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

      const keepIds = drafts.map((draft) => draft.reference_operation_id)
      const stale = (existingQuery.data?.entries ?? []).filter(
        (entry) => !keepIds.includes(entry.reference_operation_id),
      )
      if (stale.length > 0) {
        const { error: deleteError } = await supabase
          .from('daily_production_entries')
          .delete()
          .in(
            'id',
            stale.map((entry) => entry.id),
          )
        if (deleteError) throw deleteError
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

  const availableToAdd = (operationsQuery.data ?? []).filter(
    (operation) => !drafts.some((draft) => draft.reference_operation_id === operation.id),
  )

  function addOperationRow() {
    if (!addOperationId) return
    if (drafts.some((draft) => draft.reference_operation_id === addOperationId)) return
    setDrafts((current) => [
      ...current,
      {
        reference_operation_id: addOperationId,
        delivered_units: 0,
        defective_units: 0,
        notes: '',
      },
    ])
    setAddOperationId('')
  }

  function removeOperationRow(operationId: string) {
    setDrafts((current) => current.filter((item) => item.reference_operation_id !== operationId))
  }

  return (
    <div>
      <PageHeader
        title="Registro diario de producción"
        description="Agrega solo las operaciones que hizo el operario, por su nº de proceso (ej. 17 Filetear costados)."
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
        <Field label="Horas trabajadas">
          <TextInput
            type="number"
            min={0}
            step="0.25"
            placeholder="Ej. 7.5 si se fue antes"
            value={workedHours}
            onChange={(e) => {
              const raw = e.target.value
              setWorkedHours(raw)
              const hours = Number(raw)
              setCapacity(hours > 0 ? capacityFromWorkedHours(hours) : DEFAULT_CAPACITY)
            }}
          />
        </Field>
        <Field label="Meta / capacidad instalada del día (min)">
          <TextInput
            type="number"
            min={1}
            step="0.01"
            value={capacity}
            onChange={(e) => {
              const next = Number(e.target.value) || 0
              setCapacity(next)
              setWorkedHours(next > 0 ? String(hoursFromCapacity(next)) : '')
            }}
          />
        </Field>
        <Field label="Hora inicio">
          <TextInput type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="Hora salida">
          <TextInput type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
        <Field label="Novedades del día">
          <TextInput value={headerNotes} onChange={(e) => setHeaderNotes(e.target.value)} />
        </Field>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-zinc-500">Total minutos entregados del día</p>
          <p className="tabular text-lg font-semibold">{formatMinutes(totals.totalMinutes)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Capacidad instalada del día</p>
          <p className="tabular text-lg font-semibold">{formatMinutes(capacity)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Eficiencia del día</p>
          <div className="mt-1">
            <StatusBadge value={totals.efficiency} />
          </div>
        </div>
      </div>

      {orderId && (operationsQuery.data?.length ?? 0) === 0 && !operationsQuery.isLoading ? (
        <p className="mb-4 text-sm text-amber-700">Esta referencia no tiene operaciones en su ruta.</p>
      ) : null}

      {orderId && (operationsQuery.data?.length ?? 0) > 0 ? (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Agregar nº de operación de esta prenda">
              <SelectInput value={addOperationId} onChange={(e) => setAddOperationId(e.target.value)}>
                <option value="">Seleccionar proceso…</option>
                {availableToAdd.map((operation) => (
                  <option key={operation.id} value={operation.id}>
                    {operation.operation_number} — {operation.operation_name} ({Number(operation.standard_minutes).toFixed(2)} min)
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <SecondaryButton type="button" disabled={!addOperationId} onClick={addOperationRow}>
            <Plus className="h-4 w-4" /> Agregar al cuadro
          </SecondaryButton>
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <>
        <RecordCardList>
          {drafts.map((draft) => {
            const operation = operationsQuery.data?.find((item) => item.id === draft.reference_operation_id)
            const standard = Number(operation?.standard_minutes ?? 0)
            const delivered = draft.delivered_units
            const minutes = deliveredMinutes(standard, delivered)
            const unitsHour = expectedUnitsPerHour(standard)
            return (
              <RecordCard
                key={draft.reference_operation_id}
                title={`${operation?.operation_number ?? '—'} · ${operation?.operation_name ?? '—'}`}
                subtitle={`${standard.toFixed(2)} min/und`}
                actions={
                  <button
                    type="button"
                    className="text-rose-500 hover:text-rose-700"
                    onClick={() => removeOperationRow(draft.reference_operation_id)}
                    title="Quitar del cuadro"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                }
              >
                <RecordField label="Cantidad lote">{selectedOrder?.total_quantity ?? '—'}</RecordField>
                <RecordField label="Und. entregadas">
                  <TextInput
                    type="number"
                    min={0}
                    value={delivered}
                    onChange={(e) =>
                      updateDraft(draft.reference_operation_id, {
                        delivered_units: Number(e.target.value) || 0,
                      })
                    }
                  />
                </RecordField>
                <RecordField label="Und. defectuosas">
                  <TextInput
                    type="number"
                    min={0}
                    value={draft.defective_units}
                    onChange={(e) =>
                      updateDraft(draft.reference_operation_id, {
                        defective_units: Number(e.target.value) || 0,
                      })
                    }
                  />
                </RecordField>
                <RecordField label="Total min. entregados">{formatMinutes(minutes)}</RecordField>
                <RecordField label="Und/hora 100%">
                  {unitsHour > 0 ? unitsHour.toFixed(0) : '—'}
                  {delivered > 0 ? ` · ${formatPercent(hourlyPerformancePercent(delivered, standard))} vs 1h` : ''}
                </RecordField>
                <RecordField label="Novedades">
                  <TextInput
                    value={draft.notes}
                    onChange={(e) => updateDraft(draft.reference_operation_id, { notes: e.target.value })}
                  />
                </RecordField>
              </RecordCard>
            )
          })}
        </RecordCardList>
        <DesktopOnly>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Nº operación</th>
                <th className="px-3 py-2.5">Proceso</th>
                <th className="px-3 py-2.5">Tiempo operac.</th>
                <th className="px-3 py-2.5">Cantidad lote</th>
                <th className="px-3 py-2.5">Und. entregadas</th>
                <th className="px-3 py-2.5">Und. defectuosas</th>
                <th className="px-3 py-2.5">Total min. entregados</th>
                <th className="px-3 py-2.5">Und/hora 100%</th>
                <th className="px-3 py-2.5">Novedades</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => {
                const operation = operationsQuery.data?.find((item) => item.id === draft.reference_operation_id)
                const standard = Number(operation?.standard_minutes ?? 0)
                const delivered = draft.delivered_units
                const minutes = deliveredMinutes(standard, delivered)
                const unitsHour = expectedUnitsPerHour(standard)
                return (
                  <tr key={draft.reference_operation_id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 tabular font-semibold">{operation?.operation_number ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">{operation?.operation_name ?? '—'}</td>
                    <td className="px-3 py-2 tabular">{standard.toFixed(2)}</td>
                    <td className="px-3 py-2 tabular">{selectedOrder?.total_quantity ?? '—'}</td>
                    <td className="px-3 py-2">
                      <TextInput
                        type="number"
                        min={0}
                        value={delivered}
                        onChange={(e) =>
                          updateDraft(draft.reference_operation_id, {
                            delivered_units: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        type="number"
                        min={0}
                        value={draft.defective_units}
                        onChange={(e) =>
                          updateDraft(draft.reference_operation_id, {
                            defective_units: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2 tabular font-medium">{formatMinutes(minutes)}</td>
                    <td className="px-3 py-2 tabular text-zinc-600">
                      {unitsHour > 0 ? unitsHour.toFixed(0) : '—'}
                      {delivered > 0 ? (
                        <span className="mt-0.5 block text-[11px] text-zinc-400">
                          {formatPercent(hourlyPerformancePercent(delivered, standard))} vs 1h
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        value={draft.notes}
                        onChange={(e) => updateDraft(draft.reference_operation_id, { notes: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-rose-500 hover:text-rose-700"
                        onClick={() => removeOperationRow(draft.reference_operation_id)}
                        title="Quitar del cuadro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </DesktopOnly>
        </>
      ) : orderId ? (
        <p className="mb-4 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          Agrega las operaciones que sí trabajó hoy, por su número (como en el cuadro: 17, 5…).
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PrimaryButton
          disabled={!operatorId || !orderId || drafts.length === 0 || save.isPending}
          onClick={() => {
            setMessage(null)
            void save.mutate()
          }}
        >
          {save.isPending ? 'Guardando…' : 'Guardar captura'}
        </PrimaryButton>
        {drafts.length === 0 && operatorId && orderId ? (
          <p className="text-sm text-zinc-500">Agrega al menos una operación al cuadro para guardar.</p>
        ) : message ? (
          <p className="text-sm text-zinc-600">{message}</p>
        ) : null}
      </div>
      <p className="mt-3 max-w-3xl text-xs text-zinc-500">
        El nº de operación identifica el proceso de esa prenda (ej. 17 = Filetear costados). El tiempo
        sale de la ruta de la referencia. Minutos = tiempo × unidades. Eficiencia del día = suma /
        capacidad (horas trabajadas × 60; por defecto {DEFAULT_CAPACITY}).
      </p>

      <div className="mt-4">
        <Field label="Observaciones adicionales">
          <TextArea value={headerNotes} onChange={(e) => setHeaderNotes(e.target.value)} />
        </Field>
      </div>
    </div>
  )
}
