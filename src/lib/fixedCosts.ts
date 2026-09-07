import { shiftMonthISO } from './efficiency'
import { supabase } from './supabase'
import type { CostEntry } from '../types/database'

const LOOKBACK_MONTHS = 12

async function loadFixedMonth(occurredOn: string): Promise<CostEntry[]> {
  const { data, error } = await supabase
    .from('cost_entries')
    .select('*')
    .eq('entry_type', 'fijo_mes')
    .eq('occurred_on', occurredOn)
  if (error) throw error
  return (data ?? []) as CostEntry[]
}

async function ensureFixedCategories(names: string[]) {
  if (names.length === 0) return
  const { data, error } = await supabase.from('cost_categories').select('name').eq('entry_type', 'fijo_mes')
  if (error) throw error
  const existing = new Set((data ?? []).map((item) => String(item.name).toLocaleLowerCase()))
  for (const name of names) {
    const key = name.toLocaleLowerCase()
    if (existing.has(key)) continue
    const { error: insertError } = await supabase.from('cost_categories').insert({
      entry_type: 'fijo_mes',
      name,
      sort_order: Date.now() % 100000,
    })
    if (insertError && insertError.code !== '23505') throw insertError
    existing.add(key)
  }
}

export async function findLastFixedMonth(beforeMonthStart: string): Promise<{
  occurredOn: string
  entries: CostEntry[]
} | null> {
  let cursor = shiftMonthISO(beforeMonthStart, -1)
  for (let step = 0; step < LOOKBACK_MONTHS; step += 1) {
    const entries = await loadFixedMonth(cursor)
    if (entries.length > 0) return { occurredOn: cursor, entries }
    cursor = shiftMonthISO(cursor, -1)
  }
  return null
}

export async function ensureMonthFixedCosts(monthStart: string): Promise<{
  entries: CostEntry[]
  copiedFrom: string | null
}> {
  const current = await loadFixedMonth(monthStart)
  if (current.length > 0) return { entries: current, copiedFrom: null }

  const source = await findLastFixedMonth(monthStart)
  if (!source) return { entries: [], copiedFrom: null }

  await ensureFixedCategories(source.entries.map((item) => item.category))

  for (const item of source.entries) {
    const { error } = await supabase.from('cost_entries').insert({
      entry_type: 'fijo_mes',
      occurred_on: monthStart,
      category: item.category,
      amount: item.amount,
      notes: item.notes,
    })
    if (error && error.code !== '23505') throw error
  }

  return { entries: await loadFixedMonth(monthStart), copiedFrom: source.occurredOn }
}
