import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, PrimaryButton, SecondaryButton, TextArea, TextInput } from '../../components/ui/FormField'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatMinuteRate } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import type { Client } from '../../types/database'

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  minute_rate: z.number().min(0, 'El valor minuto no puede ser negativo'),
  active: z.boolean(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = {
  name: '',
  minute_rate: 0,
  active: true,
  notes: '',
}

function clientSaveErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string }
  if (err.code === '23505' || /duplicate|unique/i.test(err.message ?? '')) {
    return 'Ya existe un cliente con ese nombre.'
  }
  return err.message || 'No se pudo guardar.'
}

function clientDeleteErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string }
  if (err.code === '23503') {
    return 'No se puede eliminar: hay referencias asociadas a este cliente.'
  }
  return err.message || 'No se pudo eliminar.'
}

export function ClientsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) throw error
      return data as Client[]
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  })

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name.trim(),
        minute_rate: values.minute_rate,
        active: values.active,
        notes: values.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('clients').update(payload).eq('id', editing.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('clients').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] })
      await queryClient.invalidateQueries({ queryKey: ['garment_references'] })
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      setDeleteError(null)
      await queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (error) => {
      setDeleteError(clientDeleteErrorMessage(error))
    },
  })

  function startCreate() {
    setEditing(null)
    form.reset(emptyValues)
    setOpen(true)
  }

  function startEdit(client: Client) {
    setEditing(client)
    form.reset({
      name: client.name,
      minute_rate: Number(client.minute_rate) || 0,
      active: client.active,
      notes: client.notes ?? '',
    })
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cada cliente tiene un valor minuto pactado. Se ajusta una vez al año y lo heredan todas sus referencias."
        actions={
          <PrimaryButton onClick={startCreate}>
            <Plus className="h-4 w-4" /> Nuevo cliente
          </PrimaryButton>
        }
      />

      {query.isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {query.error ? <p className="text-sm text-rose-600">No se pudieron cargar los clientes.</p> : null}
      {deleteError ? <p className="mb-3 text-sm text-rose-600">{deleteError}</p> : null}

      {!query.isLoading && (query.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Sin clientes"
          description="Crea el primer cliente y define su valor minuto antes de asignarlo a las referencias."
          action={<PrimaryButton onClick={startCreate}>Crear cliente</PrimaryButton>}
        />
      ) : null}

      {(query.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Valor minuto</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Notas</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {query.data?.map((client) => (
                <tr key={client.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2.5 font-medium text-zinc-900">{client.name}</td>
                  <td className="px-3 py-2.5 tabular text-zinc-700">{formatMinuteRate(client.minute_rate)}</td>
                  <td className="px-3 py-2.5">
                    <span className={client.active ? 'text-emerald-700' : 'text-zinc-400'}>
                      {client.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2.5 text-zinc-600">{client.notes || '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button className="mr-2 text-zinc-500 hover:text-zinc-900" onClick={() => startEdit(client)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="text-rose-500 hover:text-rose-700"
                      onClick={() => {
                        if (confirm('¿Eliminar este cliente?')) void remove.mutate(client.id)
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
          title={editing ? 'Editar cliente' : 'Nuevo cliente'}
          onClose={() => {
            setOpen(false)
            setEditing(null)
          }}
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            <Field label="Nombre" error={form.formState.errors.name?.message}>
              <TextInput {...form.register('name')} />
            </Field>
            <Field label="Valor minuto" error={form.formState.errors.minute_rate?.message}>
              <TextInput
                type="number"
                min={0}
                step="0.01"
                {...form.register('minute_rate', { valueAsNumber: true })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
              <input type="checkbox" {...form.register('active')} /> Activo
            </label>
            <div className="sm:col-span-2">
              <Field label="Observaciones">
                <TextArea {...form.register('notes')} />
              </Field>
            </div>
            {save.error ? (
              <p className="text-sm text-rose-600 sm:col-span-2">{clientSaveErrorMessage(save.error)}</p>
            ) : null}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <SecondaryButton type="button" onClick={() => setOpen(false)}>
                Cancelar
              </SecondaryButton>
              <PrimaryButton disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar'}</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
