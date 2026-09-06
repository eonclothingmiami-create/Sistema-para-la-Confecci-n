import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, PrimaryButton, SecondaryButton, TextInput } from '../../components/ui/FormField'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { supabase } from '../../lib/supabase'
import type { GarmentReference, ReferenceOperation } from '../../types/database'

const schema = z.object({
  operation_number: z.number().int().min(1, 'Número requerido'),
  operation_name: z.string().min(2, 'Nombre requerido'),
  machine_type: z.string().optional(),
  standard_minutes: z.number().positive('Debe ser mayor a 0'),
  sort_order: z.number().int().optional(),
  active: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export function ReferenceRoutePage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ReferenceOperation | null>(null)

  const referenceQuery = useQuery({
    queryKey: ['garment_reference', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('garment_references').select('*').eq('id', id!).single()
      if (error) throw error
      return data as GarmentReference
    },
  })

  const operationsQuery = useQuery({
    queryKey: ['reference_operations', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reference_operations')
        .select('*')
        .eq('reference_id', id!)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('operation_number')
      if (error) throw error
      return data as ReferenceOperation[]
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      operation_number: 1,
      operation_name: '',
      machine_type: '',
      standard_minutes: 0.17,
      sort_order: 1,
      active: true,
    },
  })

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        reference_id: id!,
        operation_number: values.operation_number,
        operation_name: values.operation_name,
        machine_type: values.machine_type || null,
        standard_minutes: values.standard_minutes,
        sort_order: values.sort_order ?? values.operation_number,
        active: values.active,
      }
      if (editing) {
        const { error } = await supabase.from('reference_operations').update(payload).eq('id', editing.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('reference_operations').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reference_operations', id] })
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: async (operationId: string) => {
      const { error } = await supabase.from('reference_operations').delete().eq('id', operationId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reference_operations', id] })
    },
  })

  const reference = referenceQuery.data
  const nextNumber = (operationsQuery.data?.length ?? 0) + 1

  function startCreate() {
    setEditing(null)
    form.reset({
      operation_number: nextNumber,
      operation_name: '',
      machine_type: '',
      standard_minutes: 0.2,
      sort_order: nextNumber,
      active: true,
    })
    setOpen(true)
  }

  function startEdit(item: ReferenceOperation) {
    setEditing(item)
    form.reset({
      operation_number: item.operation_number,
      operation_name: item.operation_name,
      machine_type: item.machine_type ?? '',
      standard_minutes: Number(item.standard_minutes),
      sort_order: item.sort_order ?? item.operation_number,
      active: item.active,
    })
    setOpen(true)
  }

  return (
    <div>
      <Link to="/referencias" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Volver a referencias
      </Link>
      <PageHeader
        title={reference ? `Ruta · ${reference.code} ${reference.name}` : 'Ruta operacional'}
        description="Los tiempos estándar son minutos por unidad y pueden cambiar entre prendas."
        actions={
          <PrimaryButton onClick={startCreate}>
            <Plus className="h-4 w-4" /> Agregar operación
          </PrimaryButton>
        }
      />

      {(operationsQuery.data?.length ?? 0) === 0 && !operationsQuery.isLoading ? (
        <EmptyState
          title="Sin operaciones"
          description="Define la ruta de esta prenda para poder registrar producción."
          action={<PrimaryButton onClick={startCreate}>Agregar operación</PrimaryButton>}
        />
      ) : null}

      {(operationsQuery.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Nº</th>
                <th className="px-3 py-2.5">Operación</th>
                <th className="px-3 py-2.5">Máquina</th>
                <th className="px-3 py-2.5">Min / und</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {operationsQuery.data?.map((item) => (
                <tr key={item.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2.5 tabular">{item.operation_number}</td>
                  <td className="px-3 py-2.5 font-medium text-zinc-900">{item.operation_name}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{item.machine_type || '—'}</td>
                  <td className="px-3 py-2.5 tabular">{Number(item.standard_minutes).toFixed(4)}</td>
                  <td className="px-3 py-2.5">{item.active ? 'Activa' : 'Inactiva'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button className="mr-2 text-zinc-500 hover:text-zinc-900" onClick={() => startEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="text-rose-500 hover:text-rose-700"
                      onClick={() => {
                        if (confirm('¿Eliminar esta operación?')) void remove.mutate(item.id)
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
          title={editing ? 'Editar operación' : 'Nueva operación'}
          onClose={() => {
            setOpen(false)
            setEditing(null)
          }}
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            <Field label="Número" error={form.formState.errors.operation_number?.message}>
              <TextInput type="number" min={1} {...form.register('operation_number', { valueAsNumber: true })} />
            </Field>
            <Field label="Orden visual">
              <TextInput type="number" {...form.register('sort_order', { valueAsNumber: true })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Nombre de operación" error={form.formState.errors.operation_name?.message}>
                <TextInput {...form.register('operation_name')} />
              </Field>
            </div>
            <Field label="Máquina / tipo">
              <TextInput {...form.register('machine_type')} />
            </Field>
            <Field label="Tiempo estándar (min/und)" error={form.formState.errors.standard_minutes?.message}>
              <TextInput
                type="number"
                step="0.0001"
                min="0.0001"
                {...form.register('standard_minutes', { valueAsNumber: true })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
              <input type="checkbox" {...form.register('active')} /> Activa
            </label>
            {save.error ? <p className="text-sm text-rose-600 sm:col-span-2">No se pudo guardar. Revisa número único.</p> : null}
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
