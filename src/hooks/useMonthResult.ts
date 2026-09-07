import { useQuery } from '@tanstack/react-query'
import { endOfMonthISO, startOfMonthISO } from '../lib/efficiency'
import { buildMonthResult } from '../lib/result'
import { supabase } from '../lib/supabase'
import type { CostEntry, DailyProductionRevenue } from '../types/database'

export function useMonthResult(monthIso: string) {
  const from = startOfMonthISO(monthIso)
  const to = endOfMonthISO(monthIso)

  const revenueQuery = useQuery({
    queryKey: ['daily_production_revenue', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_production_revenue')
        .select('*')
        .gte('production_date', from)
        .lte('production_date', to)
      if (error) throw error
      return data as DailyProductionRevenue[]
    },
  })

  const fixedQuery = useQuery({
    queryKey: ['cost_entries', 'fijo_mes', from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_entries')
        .select('*')
        .eq('entry_type', 'fijo_mes')
        .eq('occurred_on', from)
      if (error) throw error
      return data as CostEntry[]
    },
  })

  const variableQuery = useQuery({
    queryKey: ['cost_entries', 'variable_dia', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_entries')
        .select('*')
        .eq('entry_type', 'variable_dia')
        .gte('occurred_on', from)
        .lte('occurred_on', to)
      if (error) throw error
      return data as CostEntry[]
    },
  })

  const result = buildMonthResult(from, revenueQuery.data ?? [], fixedQuery.data ?? [], variableQuery.data ?? [])
  const loading = revenueQuery.isLoading || fixedQuery.isLoading || variableQuery.isLoading
  const error = revenueQuery.error || fixedQuery.error || variableQuery.error

  return { result, loading, error }
}
