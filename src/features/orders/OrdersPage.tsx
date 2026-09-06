import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState } from '../../components/ui/EmptyState'
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  TextArea,
  TextInput,
} from '../../components/ui/FormField'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { supabase } from '../../lib/supabase'
import type { GarmentReference, OrderStatus, ProductionOrder, ReferenceOperation } from '../../types/database'

const schema = z.object({
  order_number: z.string().min(1, 'Número requerido'),
  reference_id: z.string().min(1, 'Selecciona una referencia'),
  total_quantity: z.number().int().positive('Cantidad mayor a 0'),
  start_date: z.string().optional(),
  estimated_end_date: z.string().optional(),
  status: z.enum(['pendiente', 'en_proceso', 'terminada', 'pausada']),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const statusLabel: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminada: 'Terminada',
  pausada: 'Pausada',
}

export function OrdersPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProductionOrder | null>(null)

  const referencesQuery = useQuery({
    queryKey: ['garment_references'],
    queryFn: async () => {
      const { data, error } = await supabase.from('garment_references').select('*').order('code')
      if (error) throw error
      return data as GarmentReference[]
    },
  })

  const query = useQuery({
    queryKey: ['production_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('production_orders')
        .select('*, garment_references(id, code, name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ProductionOrder[]
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      order_number: '',
      reference_id: '',
      total_quantity: 1,
      start_date: '',
      estimated_end_date: '',
      status: 'pendiente',
      notes: '',
    },
  })

  const selectedReferenceId = form.watch('reference_id')

  const routeQuery = useQuery({
    queryKey: ['reference_operations', selectedReferenceId],
    enabled: Boolean(selectedReferenceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reference_operations')
        .select('*')
        .eq('reference_id', selectedReferenceId)
        .eq('active', true)
        .order('operation_number')
      if (error) throw error
      return data as ReferenceOperation[]
    },
  })

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        order_number: values.order_number.trim(),
        reference_id: values.reference_id,
        total_quantity: values.total_quantity,
        start_date: values.start_date || null,
        estimated_end_date: values.estimated_end_date || null,
        status: values.status,
        notes: values.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('production_orders').update(payload).eq('id', editing.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('production_orders').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['production_orders'] })
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('production_orders').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['production_orders'] })
    },
  })

  function startCreate() {
    setEditing(null)
    form.reset({
      order_number: '',
      reference_id: referencesQuery.data?.[0]?.id ?? '',
      total_quantity: 1,
      start_date: '',
      estimated_end_date: '',
      status: 'pendiente',
      notes: '',
    })
    setOpen(true)
  }

  function startEdit(item: ProductionOrder) {
    setEditing(item)
    form.reset({
      order_number: item.order_number,
      reference_id: item.reference_id,
      total_quantity: item.total_quantity,
      start_date: item.start_date ?? '',
      estimated_end_date: item.estimated_end_date ?? '',
      status: item.status,
      notes: item.notes ?? '',
    })
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Órdenes / lotes"
        description="Asigna una referencia a cada lote de producción."
        actions={
          <PrimaryButton onClick={startCreate}>
            <Plus className="h-4 w-4" /> Nueva orden
          </PrimaryButton>
        }
      />

      {!query.isLoading && (query.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Sin órdenes"
          description="Crea un lote para poder capturar producción diaria."
          action={<PrimaryButton onClick={startCreate}>Crear orden</PrimaryButton>}
        />
      ) : null}

      {(query.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Orden</th>
                <th className="px-3 py-2.5">Referencia</th>
                <th className="px-3 py-2.5">Cantidad</th>
                <th className="px-3 py-2.5">Inicio</th>
                <th className="px-3 py-2.5">Entrega est.</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {query.data?.map((item) => (
                <tr key={item.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2.5 font-medium text-zinc-900">{item.order_number}</td>
                  <td className="px-3 py-2.5 text-zinc-600">
                    {item.garment_references
                      ? `${item.garment_references.code} · ${item.garment_references.name}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular">{item.total_quantity}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{item.start_date || '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{item.estimated_end_date || '—'}</td>
                  <td className="px-3 py-2.5">{statusLabel[item.status]}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button className="mr-2 text-zinc-500 hover:text-zinc-900" onClick={() => startEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="text-rose-500 hover:text-rose-700"
                      onClick={() => {
                        if (confirm('¿Eliminar esta orden?')) void remove.mutate(item.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open ? (
        <Modal
          title={editing ? 'Editar orden' : 'Nueva orden'}
          onClose={() => {
            setOpen(false)
            setEditing(null)
          }}
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            <Field label="Número de orden / lote" error={form.formState.errors.order_number?.message}>
              <TextInput {...form.register('order_number')} />
            </Field>
            <Field label="Referencia" error={form.formState.errors.reference_id?.message}>
              <SelectInput {...form.register('reference_id')}>
                <option value="">Seleccionar…</option>
                {referencesQuery.data?.map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {reference.code} · {reference.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {selectedReferenceId ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm sm:col-span-2">
                <p className="mb-2 text-xs font-medium text-zinc-600">
                  Esta orden llevará la ruta de esa prenda en todos los cálculos
                </p>
                {(routeQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-amber-700">
                    Esta referencia aún no tiene operaciones. Defínelas en Referencias → Ruta antes de capturar.
                  </p>
                ) : (
                  <ul className="space-y-1 text-zinc-700">
                    {routeQuery.data?.map((operation) => (
                      <li key={operation.id}>
                        <span className="font-semibold tabular">{operation.operation_number}</span>
                        {' — '}
                        {operation.operation_name}
                        <span className="text-zinc-500">
                          {' '}
                          ({Number(operation.standard_minutes).toFixed(2)} min/und)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            <Field label="Cantidad total" error={form.formState.errors.total_quantity?.message}>
              <TextInput type="number" min={1} {...form.register('total_quantity', { valueAsNumber: true })} />
            </Field>
            <Field label="Estado">
              <SelectInput {...form.register('status')}>
                <option value="pendiente">Pendiente</option>
                <option value="en_proceso">En proceso</option>
                <option value="terminada">Terminada</option>
                <option value="pausada">Pausada</option>
              </SelectInput>
            </Field>
            <Field label="Fecha de inicio">
              <TextInput type="date" {...form.register('start_date')} />
            </Field>
            <Field label="Fecha estimada de entrega">
              <TextInput type="date" {...form.register('estimated_end_date')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Observaciones">
                <TextArea {...form.register('notes')} />
              </Field>
            </div>
            {save.error ? <p className="text-sm text-rose-600 sm:col-span-2">No se pudo guardar.</p> : null}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <SecondaryButton type="button" onClick={() => setOpen(false)}>
                Cancelar
              </SecondaryButton>
              <PrimaryButton disabled={save.isPending}>Guardar</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
