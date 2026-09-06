import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Route, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, PrimaryButton, SecondaryButton, TextArea, TextInput } from '../../components/ui/FormField'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { supabase } from '../../lib/supabase'
import type { GarmentReference } from '../../types/database'

const schema = z.object({
  code: z.string().min(1, 'Código requerido'),
  name: z.string().min(2, 'Nombre requerido'),
  garment_type: z.string().optional(),
  client: z.string().optional(),
  description: z.string().optional(),
  active: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = {
  code: '',
  name: '',
  garment_type: '',
  client: '',
  description: '',
  active: true,
}

export function ReferencesPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<GarmentReference | null>(null)

  const query = useQuery({
    queryKey: ['garment_references'],
    queryFn: async () => {
      const { data, error } = await supabase.from('garment_references').select('*').order('code')
      if (error) throw error
      return data as GarmentReference[]
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  })

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        garment_type: values.garment_type || null,
        client: values.client || null,
        description: values.description || null,
        active: values.active,
      }
      if (editing) {
        const { error } = await supabase.from('garment_references').update(payload).eq('id', editing.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('garment_references').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['garment_references'] })
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('garment_references').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['garment_references'] })
    },
  })

  function startCreate() {
    setEditing(null)
    form.reset(emptyValues)
    setOpen(true)
  }

  function startEdit(item: GarmentReference) {
    setEditing(item)
    form.reset({
      code: item.code,
      name: item.name,
      garment_type: item.garment_type ?? '',
      client: item.client ?? '',
      description: item.description ?? '',
      active: item.active,
    })
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Referencias / prendas"
        description="Cada referencia tiene su propia ruta operacional."
        actions={
          <PrimaryButton onClick={startCreate}>
            <Plus className="h-4 w-4" /> Nueva referencia
          </PrimaryButton>
        }
      />

      {query.isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {!query.isLoading && (query.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Sin referencias"
          description="Crea una prenda y luego define su ruta de operaciones."
          action={<PrimaryButton onClick={startCreate}>Crear referencia</PrimaryButton>}
        />
      ) : null}

      {(query.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Código</th>
                <th className="px-3 py-2.5">Nombre</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {query.data?.map((item) => (
                <tr key={item.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2.5 font-medium text-zinc-900">{item.code}</td>
                  <td className="px-3 py-2.5 text-zinc-700">{item.name}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{item.garment_type || '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{item.client || '—'}</td>
                  <td className="px-3 py-2.5">{item.active ? 'Activa' : 'Inactiva'}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Link
                      to={`/referencias/${item.id}/ruta`}
                      className="mr-2 inline-flex text-zinc-600 hover:text-zinc-900"
                      title="Ruta operacional"
                    >
                      <Route className="h-4 w-4" />
                    </Link>
                    <button className="mr-2 text-zinc-500 hover:text-zinc-900" onClick={() => startEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="text-rose-500 hover:text-rose-700"
                      onClick={() => {
                        if (confirm('¿Eliminar esta referencia y su ruta?')) void remove.mutate(item.id)
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
          title={editing ? 'Editar referencia' : 'Nueva referencia'}
          onClose={() => {
            setOpen(false)
            setEditing(null)
          }}
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            <Field label="Código" error={form.formState.errors.code?.message}>
              <TextInput {...form.register('code')} />
            </Field>
            <Field label="Nombre" error={form.formState.errors.name?.message}>
              <TextInput {...form.register('name')} />
            </Field>
            <Field label="Tipo de prenda">
              <TextInput {...form.register('garment_type')} />
            </Field>
            <Field label="Cliente">
              <TextInput {...form.register('client')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descripción">
                <TextArea {...form.register('description')} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
              <input type="checkbox" {...form.register('active')} /> Activa
            </label>
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
