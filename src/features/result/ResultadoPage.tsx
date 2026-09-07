import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Field, PrimaryButton, SecondaryButton, SelectInput, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedTabs } from '../../components/ui/SegmentedTabs'
import { formatMoney } from '../../lib/money'
import { formatMonthLong, shiftMonthISO, startOfMonthISO, todayISO } from '../../lib/efficiency'
import { FIXED_CATEGORIES, VARIABLE_CATEGORIES, sumAmounts } from '../../lib/result'
import { supabase } from '../../lib/supabase'
import type { CostEntry, ProductionOrder } from '../../types/database'

type CaptureTab = 'fijos' | 'variables'

export function ResultadoPage() {
  const [tab, setTab] = useState<CaptureTab>('fijos')

  return (
    <div>
      <PageHeader
        title="Resultado"
        description="Los fijos se cargan una vez al mes. Los gastos del día, el día que ocurren."
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
  const previousOn = startOfMonthISO(shiftMonthISO(occurredOn, -1))

  const query = useQuery({
    queryKey: ['cost_entries', 'fijo_mes', occurredOn],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_entries')
        .select('*')
        .eq('entry_type', 'fijo_mes')
        .eq('occurred_on', occurredOn)
      if (error) throw error
      return data as CostEntry[]
    },
  })

  const previousQuery = useQuery({
    queryKey: ['cost_entries', 'fijo_mes', previousOn],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_entries')
        .select('*')
        .eq('entry_type', 'fijo_mes')
        .eq('occurred_on', previousOn)
      if (error) throw error
      return data as CostEntry[]
    },
  })

  const [draft, setDraft] = useState<Record<string, { amount: string; notes: string }>>({})

  const rows = useMemo(() => {
    return FIXED_CATEGORIES.map((category) => {
      const saved = query.data?.find((item) => item.category === category)
      const local = draft[category]
      return {
        category,
        id: saved?.id,
        amount: local?.amount ?? (saved ? String(Number(saved.amount)) : ''),
        notes: local?.notes ?? saved?.notes ?? '',
      }
    })
  }, [draft, query.data])

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  const save = useMutation({
    mutationFn: async () => {
      for (const row of rows) {
        const amount = Number(row.amount) || 0
        if (row.id) {
          if (amount <= 0 && !row.notes.trim()) {
            const { error } = await supabase.from('cost_entries').delete().eq('id', row.id)
            if (error) throw error
            continue
          }
          const { error } = await supabase
            .from('cost_entries')
            .update({ amount, notes: row.notes.trim() || null })
            .eq('id', row.id)
          if (error) throw error
          continue
        }
        if (amount <= 0 && !row.notes.trim()) continue
        const { error } = await supabase.from('cost_entries').insert({
          entry_type: 'fijo_mes',
          occurred_on: occurredOn,
          category: row.category,
          amount,
          notes: row.notes.trim() || null,
        })
        if (error) throw error
      }
    },
    onSuccess: async () => {
      setDraft({})
      await queryClient.invalidateQueries({ queryKey: ['cost_entries'] })
    },
  })

  const copyPrevious = useMutation({
    mutationFn: async () => {
      const previous = previousQuery.data ?? []
      if (previous.length === 0) throw new Error('El mes anterior no tiene fijos.')
      for (const item of previous) {
        const { error } = await supabase.from('cost_entries').upsert(
          {
            entry_type: 'fijo_mes',
            occurred_on: occurredOn,
            category: item.category,
            amount: item.amount,
            notes: item.notes,
          },
          { onConflict: 'occurred_on,category' },
        )
        if (error) {
          const existing = query.data?.find((row) => row.category === item.category)
          if (existing) {
            const { error: updateError } = await supabase
              .from('cost_entries')
              .update({ amount: item.amount, notes: item.notes })
              .eq('id', existing.id)
            if (updateError) throw updateError
            continue
          }
          const { error: insertError } = await supabase.from('cost_entries').insert({
            entry_type: 'fijo_mes',
            occurred_on: occurredOn,
            category: item.category,
            amount: item.amount,
            notes: item.notes,
          })
          if (insertError) throw insertError
        }
      }
    },
    onSuccess: async () => {
      setDraft({})
      await queryClient.invalidateQueries({ queryKey: ['cost_entries'] })
    },
  })

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
            onClick={() => copyPrevious.mutate()}
            disabled={copyPrevious.isPending || (previousQuery.data?.length ?? 0) === 0}
          >
            Copiar mes anterior
          </SecondaryButton>
          <PrimaryButton type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar fijos'}
          </PrimaryButton>
        </div>
      </div>

      <p className="mb-3 text-sm text-zinc-500">
        {formatMonthLong(occurredOn)}. Total fijos: <span className="font-medium text-zinc-800">{formatMoney(total)}</span>
      </p>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Valor del mes</th>
              <th className="px-4 py-3 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category} className="border-t border-zinc-100">
                <td className="px-4 py-2.5 font-medium text-zinc-800">{row.category}</td>
                <td className="px-4 py-2.5">
                  <TextInput
                    type="number"
                    min={0}
                    step="1000"
                    value={row.amount}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [row.category]: { amount: event.target.value, notes: row.notes },
                      }))
                    }
                  />
                </td>
                <td className="px-4 py-2.5">
                  <TextInput
                    value={row.notes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [row.category]: { amount: row.amount, notes: event.target.value },
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {save.error ? <p className="mt-3 text-sm text-rose-600">No se pudieron guardar los fijos.</p> : null}
      {copyPrevious.error ? (
        <p className="mt-3 text-sm text-rose-600">
          {(copyPrevious.error as Error).message || 'No se pudo copiar el mes anterior.'}
        </p>
      ) : null}
    </div>
  )
}

function VariableCostsPanel() {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState<string>(VARIABLE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [orderId, setOrderId] = useState('')

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
            {VARIABLE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
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
