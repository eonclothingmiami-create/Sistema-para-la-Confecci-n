import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IdCard, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, PrimaryButton, SecondaryButton, SelectInput, TextArea, TextInput } from '../../components/ui/FormField'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { DesktopOnly, RecordCard, RecordCardList, RecordField } from '../../components/ui/RecordCard'
import { useAuth } from '../../hooks/useAuth'
import { isStaffRole } from '../../lib/access'
import { supabase } from '../../lib/supabase'
import { ACCESS_ROLE_LABELS, type Operator, type OperatorAccessRole } from '../../types/database'

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  code: z.string().optional(),
  document: z.string().optional(),
  position: z.string().optional(),
  line: z.string().optional(),
  hire_date: z.string().optional(),
  email: z.union([z.literal(''), z.string().email('Correo inválido')]).optional(),
  access_role: z.enum(['admin', 'contador', 'operario']),
  active: z.boolean(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = {
  name: '',
  code: '',
  document: '',
  position: '',
  line: '',
  hire_date: '',
  email: '',
  access_role: 'operario',
  active: true,
  notes: '',
}

function linkStatus(operator: Operator) {
  if (!operator.email) return 'Sin correo'
  if (operator.user_id) return 'Vinculado'
  return 'Pendiente de cuenta'
}

function operatorSaveError(error: unknown) {
  const err = error as { code?: string; message?: string }
  const message = err.message ?? ''
  if (err.code === '23505' || /duplicate|unique|vinculado a otro/i.test(message)) {
    return 'Ese correo ya está en otra ficha.'
  }
  if (/desarrollador/i.test(message)) {
    return 'Ese correo es la cuenta desarrollador y no se puede vincular a un operario.'
  }
  return message || 'No se pudo guardar. Revisa los datos.'
}

export function OperatorsPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const canManageIdentity = isStaffRole(profile?.role)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Operator | null>(null)

  const query = useQuery({
    queryKey: ['operators'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operators').select('*').order('name')
      if (error) throw error
      return data as Operator[]
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  })

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: Record<string, unknown> = {
        name: values.name.trim(),
        code: values.code || null,
        document: values.document || null,
        position: values.position || null,
        line: values.line || null,
        hire_date: values.hire_date || null,
        active: values.active,
        notes: values.notes || null,
      }
      if (canManageIdentity) {
        payload.email = values.email?.trim() ? values.email.trim().toLowerCase() : null
        payload.access_role = values.access_role
      }
      if (editing) {
        const { error } = await supabase.from('operators').update(payload).eq('id', editing.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('operators').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operators'] })
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('operators').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operators'] })
    },
  })

  function startCreate() {
    setEditing(null)
    form.reset(emptyValues)
    setOpen(true)
  }

  function startEdit(operator: Operator) {
    setEditing(operator)
    form.reset({
      name: operator.name,
      code: operator.code ?? '',
      document: operator.document ?? '',
      position: operator.position ?? '',
      line: operator.line ?? '',
      hire_date: operator.hire_date ?? '',
      email: operator.email ?? '',
      access_role: operator.access_role ?? 'operario',
      active: operator.active,
      notes: operator.notes ?? '',
    })
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Operarios"
        actions={
          <PrimaryButton onClick={startCreate}>
            <Plus className="h-4 w-4" /> Nuevo operario
          </PrimaryButton>
        }
      />

      {query.isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {query.error ? <p className="text-sm text-rose-600">No se pudieron cargar los operarios.</p> : null}

      {!query.isLoading && (query.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Sin operarios"
          description="Crea el primer operario para comenzar a registrar producción."
          action={<PrimaryButton onClick={startCreate}>Crear operario</PrimaryButton>}
        />
      ) : null}

      {(query.data?.length ?? 0) > 0 ? (
        <>
        <RecordCardList>
          {query.data?.map((operator) => (
            <RecordCard
              key={operator.id}
              title={
                <Link to={`/operarios/${operator.id}`} className="hover:underline">
                  {operator.name}
                </Link>
              }
              subtitle={operator.active ? 'Activo' : 'Inactivo'}
              actions={
                <>
                  <Link to={`/operarios/${operator.id}`} className="text-zinc-600 hover:text-zinc-900" title="Ver ficha">
                    <IdCard className="h-4 w-4" />
                  </Link>
                  <button className="text-zinc-500 hover:text-zinc-900" onClick={() => startEdit(operator)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="text-rose-500 hover:text-rose-700"
                    onClick={() => {
                      if (confirm('¿Eliminar este operario?')) void remove.mutate(operator.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              }
            >
              <RecordField label="Código">{operator.code || '—'}</RecordField>
              <RecordField label="Documento">{operator.document || '—'}</RecordField>
              <RecordField label="Correo">{operator.email || '—'}</RecordField>
              <RecordField label="Rol">{ACCESS_ROLE_LABELS[operator.access_role] ?? 'Operario'}</RecordField>
              <RecordField label="Acceso">{linkStatus(operator)}</RecordField>
            </RecordCard>
          ))}
        </RecordCardList>
        <DesktopOnly>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Nombre</th>
                <th className="px-3 py-2.5">Código</th>
                <th className="px-3 py-2.5">Correo</th>
                <th className="px-3 py-2.5">Rol</th>
                <th className="px-3 py-2.5">Acceso</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {query.data?.map((operator) => (
                <tr key={operator.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2.5 font-medium text-zinc-900">
                    <Link to={`/operarios/${operator.id}`} className="hover:underline">
                      {operator.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{operator.code || '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{operator.email || '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-600">
                    {ACCESS_ROLE_LABELS[operator.access_role] ?? 'Operario'}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{linkStatus(operator)}</td>
                  <td className="px-3 py-2.5">
                    <span className={operator.active ? 'text-emerald-700' : 'text-zinc-400'}>
                      {operator.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      to={`/operarios/${operator.id}`}
                      className="mr-2 inline-flex text-zinc-600 hover:text-zinc-900"
                      title="Ver ficha"
                    >
                      <IdCard className="h-4 w-4" />
                    </Link>
                    <button className="mr-2 text-zinc-500 hover:text-zinc-900" onClick={() => startEdit(operator)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="text-rose-500 hover:text-rose-700"
                      onClick={() => {
                        if (confirm('¿Eliminar este operario?')) void remove.mutate(operator.id)
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
        </DesktopOnly>
        </>
      ) : null}

      {open ? (
        <Modal
          title={editing ? 'Editar operario' : 'Nuevo operario'}
          onClose={() => {
            setOpen(false)
            setEditing(null)
          }}
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            <Field label="Nombre" error={form.formState.errors.name?.message}>
              <TextInput {...form.register('name')} />
            </Field>
            <Field label="Código interno">
              <TextInput {...form.register('code')} />
            </Field>
            <Field label="Documento">
              <TextInput {...form.register('document')} />
            </Field>
            <Field label="Cargo">
              <TextInput {...form.register('position')} />
            </Field>
            <Field label="Línea / módulo">
              <TextInput {...form.register('line')} />
            </Field>
            <Field label="Fecha de ingreso">
              <TextInput type="date" {...form.register('hire_date')} />
            </Field>
            {canManageIdentity ? (
              <>
                <Field label="Correo para entrar" error={form.formState.errors.email?.message}>
                  <TextInput type="email" autoComplete="off" placeholder="opcional" {...form.register('email')} />
                </Field>
                <Field label="Rol de acceso">
                  <SelectInput {...form.register('access_role')}>
                    {(Object.keys(ACCESS_ROLE_LABELS) as OperatorAccessRole[]).map((role) => (
                      <option key={role} value={role}>
                        {ACCESS_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <p className="text-xs text-zinc-500 sm:col-span-2">
                  Si pones un correo, esa persona entra con Crear cuenta usando el mismo correo. El rol decide qué
                  pantallas ve: operario (captura y su ficha), contador (sin piso) o administrador (todo).
                </p>
              </>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
              <input type="checkbox" {...form.register('active')} /> Activo
            </label>
            <div className="sm:col-span-2">
              <Field label="Observaciones">
                <TextArea {...form.register('notes')} />
              </Field>
            </div>
            {save.error ? (
              <p className="text-sm text-rose-600 sm:col-span-2">{operatorSaveError(save.error)}</p>
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
