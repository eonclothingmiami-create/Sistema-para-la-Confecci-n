import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Field, PrimaryButton, SecondaryButton, SelectInput, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedTabs } from '../../components/ui/SegmentedTabs'
import {
  unusedCategoryName,
  useCostCategories,
  useCreateCostCategory,
  useDeleteCostCategory,
  useRenameCostCategory,
} from '../../hooks/useCostCategories'
import { formatMonthLong, startOfMonthISO, todayISO } from '../../lib/efficiency'
import { ensureMonthFixedCosts } from '../../lib/fixedCosts'
import { formatMoney } from '../../lib/money'
import { sumAmounts } from '../../lib/result'
import { supabase } from '../../lib/supabase'
import type { CostCategory, CostEntry, ProductionOrder } from '../../types/database'

type CaptureTab = 'fijos' | 'variables'

export function ResultadoPage() {
  const [tab, setTab] = useState<CaptureTab>('fijos')

  return (
    <div>
      <PageHeader
        title="Resultado"
        description="Los fijos se copian solos del mes anterior. Edítalos solo si este mes cambió. Los gastos del día se cargan el día que ocurren."
        actions={
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={[
              { id: 'fijos', label: 'Fijos del mes' },
              { id: 'variables', label: 'Gastos del día' },
            ]}
          />
        }
      />
      {tab === 'fijos' ? <FixedCostsPanel /> : <VariableCostsPanel />}
    </div>
  )
}

function FixedCostsPanel() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const occurredOn = startOfMonthISO(`${month}-01`)
  const categoriesQuery = useCostCategories('fijo_mes')
  const createCategory = useCreateCostCategory('fijo_mes')
  const deleteCategory = useDeleteCostCategory()

  const query = useQuery({
    queryKey: ['cost_entries', 'fijo_mes', occurredOn],
    queryFn: async () => {
      const { entries, copiedFrom } = await ensureMonthFixedCosts(occurredOn)
      if (copiedFrom) {
        await queryClient.invalidateQueries({ queryKey: ['cost_categories'] })
      }
      return entries
    },
  })
  const savedEntries = query.data ?? []

  const [draft, setDraft] = useState<Record<string, { name: string; amount: string; notes: string }>>({})

  const catalog = categoriesQuery.data ?? []
  const catalogNames = new Set(catalog.map((item) => item.name))
  const orphanEntries = savedEntries.filter((entry) => !catalogNames.has(entry.category))

  const rows = useMemo(() => {
    const fromCatalog = catalog.map((category) => {
      const saved = savedEntries.find((item) => item.category === category.name)
      const local = draft[category.id]
      return {
        key: category.id,
        categoryId: category.id,
        savedName: category.name,
        name: local?.name ?? category.name,
        id: saved?.id,
        amount: local?.amount ?? (saved ? String(Number(saved.amount)) : ''),
        notes: local?.notes ?? saved?.notes ?? '',
      }
    })
    const orphans = orphanEntries.map((entry) => {
      const key = `orphan:${entry.id}`
      const local = draft[key]
      return {
        key,
        categoryId: null as string | null,
        savedName: entry.category,
        name: local?.name ?? entry.category,
        id: entry.id,
        amount: local?.amount ?? String(Number(entry.amount)),
        notes: local?.notes ?? entry.notes ?? '',
      }
    })
    return [...fromCatalog, ...orphans]
  }, [catalog, draft, orphanEntries, savedEntries])

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  const save = useMutation({
    mutationFn: async () => {
      const used = new Set<string>()
      for (const row of rows) {
        const name = row.name.trim()
        if (!name) throw new Error('Todas las categorías necesitan un nombre.')
        const key = name.toLocaleLowerCase()
        if (used.has(key)) throw new Error(`La categoría "${name}" está repetida.`)
        used.add(key)
      }

      for (const row of rows) {
        const name = row.name.trim()
        if (row.categoryId && name !== row.savedName) {
          const { error } = await supabase.from('cost_categories').update({ name }).eq('id', row.categoryId)
          if (error) {
            if (error.code === '23505') throw new Error(`La categoría "${name}" ya existe.`)
            throw error
          }
          const { error: entriesError } = await supabase
            .from('cost_entries')
            .update({ category: name })
            .eq('entry_type', 'fijo_mes')
            .eq('category', row.savedName)
          if (entriesError) throw entriesError
        }

        if (!row.categoryId && name !== row.savedName) {
          const { error } = await supabase.from('cost_categories').insert({
            entry_type: 'fijo_mes',
            name,
            sort_order: Date.now() % 100000,
          })
          if (error && error.code !== '23505') throw error
          if (row.id) {
            const { error: renameError } = await supabase
              .from('cost_entries')
              .update({ category: name })
              .eq('id', row.id)
            if (renameError) throw renameError
          }
        }

        const amount = Number(row.amount) || 0
        if (row.id) {
          if (amount <= 0 && !row.notes.trim()) {
            const { error } = await supabase.from('cost_entries').delete().eq('id', row.id)
            if (error) throw error
            continue
          }
          const { error } = await supabase
            .from('cost_entries')
            .update({ category: name, amount, notes: row.notes.trim() || null })
            .eq('id', row.id)
          if (error) throw error
          continue
        }
        if (amount <= 0 && !row.notes.trim()) continue
        const { error } = await supabase.from('cost_entries').insert({
          entry_type: 'fijo_mes',
          occurred_on: occurredOn,
          category: name,
          amount,
          notes: row.notes.trim() || null,
        })
        if (error) throw error
      }
    },
    onSuccess: async () => {
      setDraft({})
      await queryClient.invalidateQueries({ queryKey: ['cost_entries'] })
      await queryClient.invalidateQueries({ queryKey: ['cost_categories'] })
    },
  })

  function updateDraft(key: string, patch: Partial<{ name: string; amount: string; notes: string }>, current: {
    name: string
    amount: string
    notes: string
  }) {
    setDraft((prev) => ({
      ...prev,
      [key]: {
        name: patch.name ?? current.name,
        amount: patch.amount ?? current.amount,
        notes: patch.notes ?? current.notes,
      },
    }))
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Field label="Mes">
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value)
              setDraft({})
            }}
            className="w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            type="button"
            onClick={() => {
              const name = unusedCategoryName(
                catalog.map((item) => item.name),
                'Nuevo fijo',
              )
              createCategory.mutate(name)
            }}
            disabled={createCategory.isPending}
          >
            <Plus className="h-4 w-4" />
            Agregar categoría
          </SecondaryButton>
          <PrimaryButton type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar fijos'}
          </PrimaryButton>
        </div>
      </div>

      <p className="mb-3 text-sm text-zinc-500">
        {formatMonthLong(occurredOn)}. Total fijos:{' '}
        <span className="font-medium text-zinc-800">{formatMoney(total)}</span>
        {categoriesQuery.isLoading || query.isFetching ? ' Cargando…' : ''}
      </p>
      <p className="mb-3 text-sm text-zinc-500">
        Cada mes nuevo arranca con los fijos del mes anterior. Edita y guarda solo si algo cambió.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Valor del mes</th>
              <th className="px-4 py-3 font-medium">Nota</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-400">
                  Agrega las categorías fijas de esta empresa.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-t border-zinc-100">
                  <td className="px-4 py-2.5">
                    <TextInput
                      value={row.name}
                      onChange={(event) => updateDraft(row.key, { name: event.target.value }, row)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <TextInput
                      type="number"
                      min={0}
                      step="1000"
                      value={row.amount}
                      onChange={(event) => updateDraft(row.key, { amount: event.target.value }, row)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <TextInput
                      value={row.notes}
                      onChange={(event) => updateDraft(row.key, { notes: event.target.value }, row)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.categoryId ? (
                      <button
                        type="button"
                        className="text-rose-500 hover:text-rose-700"
                        title="Quitar categoría"
                        onClick={() => {
                          if (
                            confirm(
                              `¿Quitar "${row.savedName}" de la lista? Se borra el valor de este mes. Los meses anteriores quedan en el historial.`,
                            )
                          ) {
                            deleteCategory.mutate({
                              id: row.categoryId!,
                              entryType: 'fijo_mes',
                              name: row.savedName,
                              monthStart: occurredOn,
                            })
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {save.error ? (
        <p className="mt-3 text-sm text-rose-600">
          {(save.error as Error).message || 'No se pudieron guardar los fijos.'}
        </p>
      ) : null}
      {query.error ? (
        <p className="mt-3 text-sm text-rose-600">
          {(query.error as Error).message || 'No se pudieron cargar los fijos.'}
        </p>
      ) : null}
      {createCategory.error ? (
        <p className="mt-3 text-sm text-rose-600">
          {(createCategory.error as Error).message || 'No se pudo agregar la categoría.'}
        </p>
      ) : null}
    </div>
  )
}

function VariableCostsPanel() {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [orderId, setOrderId] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const categoriesQuery = useCostCategories('variable_dia')
  const createCategory = useCreateCostCategory('variable_dia')
  const renameCategory = useRenameCostCategory()
  const deleteCategory = useDeleteCostCategory()
  const categories = categoriesQuery.data ?? []

  useEffect(() => {
    if (!category && categories[0]) setCategory(categories[0].name)
    if (category && categories.length > 0 && !categories.some((item) => item.name === category)) {
      setCategory(categories[0].name)
    }
  }, [categories, category])

  const query = useQuery({
    queryKey: ['cost_entries', 'variable_dia', date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_entries')
        .select('*')
        .eq('entry_type', 'variable_dia')
        .eq('occurred_on', date)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as CostEntry[]
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

  const save = useMutation({
    mutationFn: async () => {
      const value = Number(amount)
      if (!category) throw new Error('Elige o crea una categoría.')
      if (!Number.isFinite(value) || value <= 0) throw new Error('Escribe un valor mayor a 0.')
      const { error } = await supabase.from('cost_entries').insert({
        entry_type: 'variable_dia',
        occurred_on: date,
        category,
        amount: value,
        notes: notes.trim() || null,
        production_order_id: orderId || null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setAmount('')
      setNotes('')
      setOrderId('')
      await queryClient.invalidateQueries({ queryKey: ['cost_entries'] })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cost_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cost_entries'] })
    },
  })

  const total = sumAmounts(query.data ?? [])

  return (
    <div>
      <form
        className="mb-5 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Fecha">
          <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="Categoría">
          <SelectInput value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.length === 0 ? <option value="">Crea una categoría</option> : null}
            {categories.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Valor">
          <TextInput
            type="number"
            min={0}
            step="1000"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Lote (opcional)">
          <SelectInput value={orderId} onChange={(event) => setOrderId(event.target.value)}>
            <option value="">Ninguno</option>
            {ordersQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.order_number}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Nota">
            <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
        <div className="flex items-end">
          <PrimaryButton disabled={save.isPending}>
            <Plus className="h-4 w-4" />
            {save.isPending ? 'Guardando…' : 'Agregar gasto'}
          </PrimaryButton>
        </div>
        {save.error ? (
          <p className="text-sm text-rose-600 sm:col-span-2 lg:col-span-3">
            {(save.error as Error).message || 'No se pudo guardar.'}
          </p>
        ) : null}
      </form>

      <CategoryManager
        categories={categories}
        newName={newCategory}
        onNewNameChange={setNewCategory}
        editingId={editingId}
        editingName={editingName}
        onEditingIdChange={setEditingId}
        onEditingNameChange={setEditingName}
        onAdd={() => {
          createCategory.mutate(newCategory, {
            onSuccess: (created) => {
              setNewCategory('')
              setCategory(created.name)
            },
          })
        }}
        onRename={(item) => {
          renameCategory.mutate(
            {
              id: item.id,
              entryType: 'variable_dia',
              previousName: item.name,
              nextName: editingName,
            },
            {
              onSuccess: () => {
                if (category === item.name) setCategory(editingName.trim())
                setEditingId(null)
              },
            },
          )
        }}
        onDelete={(item) => {
          if (
            confirm(
              `¿Quitar "${item.name}" de la lista? Los gastos ya cargados quedan en el historial.`,
            )
          ) {
            deleteCategory.mutate({
              id: item.id,
              entryType: 'variable_dia',
              name: item.name,
            })
          }
        }}
        addPending={createCategory.isPending}
        error={
          (createCategory.error as Error | null)?.message ||
          (renameCategory.error as Error | null)?.message ||
          (deleteCategory.error as Error | null)?.message
        }
      />

      <p className="mb-3 text-sm text-zinc-500">
        Gastos de este día: <span className="font-medium text-zinc-800">{formatMoney(total)}</span>
      </p>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {(query.data?.length ?? 0) === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-400">Sin gastos variables en esta fecha.</p>
        ) : (
          <ul>
            {query.data?.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-800">{item.category}</p>
                  <p className="truncate text-sm text-zinc-500">{item.notes || 'Sin nota'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-sm font-medium text-zinc-800">{formatMoney(item.amount)}</span>
                  <button
                    type="button"
                    className="text-rose-500 hover:text-rose-700"
                    onClick={() => {
                      if (confirm('¿Eliminar este gasto?')) void remove.mutate(item.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CategoryManager({
  categories,
  newName,
  onNewNameChange,
  editingId,
  editingName,
  onEditingIdChange,
  onEditingNameChange,
  onAdd,
  onRename,
  onDelete,
  addPending,
  error,
}: {
  categories: CostCategory[]
  newName: string
  onNewNameChange: (value: string) => void
  editingId: string | null
  editingName: string
  onEditingIdChange: (id: string | null) => void
  onEditingNameChange: (value: string) => void
  onAdd: () => void
  onRename: (item: CostCategory) => void
  onDelete: (item: CostCategory) => void
  addPending: boolean
  error?: string
}) {
  return (
    <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-zinc-800">Categorías de esta empresa</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <TextInput
          placeholder="Nueva categoría"
          value={newName}
          onChange={(event) => onNewNameChange(event.target.value)}
          className="max-w-xs"
        />
        <SecondaryButton type="button" onClick={onAdd} disabled={addPending || !newName.trim()}>
          <Plus className="h-4 w-4" />
          Agregar
        </SecondaryButton>
      </div>
      <ul className="divide-y divide-zinc-100">
        {categories.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            {editingId === item.id ? (
              <TextInput value={editingName} onChange={(event) => onEditingNameChange(event.target.value)} />
            ) : (
              <span className="text-sm text-zinc-800">{item.name}</span>
            )}
            <div className="flex shrink-0 gap-2">
              {editingId === item.id ? (
                <>
                  <SecondaryButton type="button" onClick={() => onRename(item)}>
                    Guardar
                  </SecondaryButton>
                  <SecondaryButton type="button" onClick={() => onEditingIdChange(null)}>
                    Cancelar
                  </SecondaryButton>
                </>
              ) : (
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    onEditingIdChange(item.id)
                    onEditingNameChange(item.name)
                  }}
                >
                  Renombrar
                </SecondaryButton>
              )}
              <button
                type="button"
                className="text-rose-500 hover:text-rose-700"
                title="Quitar categoría"
                onClick={() => onDelete(item)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </div>
  )
}
