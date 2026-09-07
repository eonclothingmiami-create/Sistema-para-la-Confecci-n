import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { CostCategory, CostEntryType } from '../types/database'

export function unusedCategoryName(existing: string[], base: string) {
  const names = new Set(existing.map((name) => name.trim().toLocaleLowerCase()))
  if (!names.has(base.toLocaleLowerCase())) return base
  let index = 2
  while (names.has(`${base} ${index}`.toLocaleLowerCase())) index += 1
  return `${base} ${index}`
}

export function useCostCategories(entryType: CostEntryType) {
  return useQuery({
    queryKey: ['cost_categories', entryType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_categories')
        .select('*')
        .eq('entry_type', entryType)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return data as CostCategory[]
    },
  })
}

export function useCreateCostCategory(entryType: CostEntryType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Escribe un nombre para la categoría.')
      const { data, error } = await supabase
        .from('cost_categories')
        .insert({
          entry_type: entryType,
          name: trimmed,
          sort_order: Date.now() % 100000,
        })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') throw new Error('Esa categoría ya existe.')
        throw error
      }
      return data as CostCategory
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cost_categories'] })
    },
  })
}

export function useRenameCostCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      entryType,
      previousName,
      nextName,
    }: {
      id: string
      entryType: CostEntryType
      previousName: string
      nextName: string
    }) => {
      const trimmed = nextName.trim()
      if (!trimmed) throw new Error('El nombre no puede quedar vacío.')
      if (trimmed === previousName) return
      const { error } = await supabase.from('cost_categories').update({ name: trimmed }).eq('id', id)
      if (error) {
        if (error.code === '23505') throw new Error('Esa categoría ya existe.')
        throw error
      }
      const { error: entriesError } = await supabase
        .from('cost_entries')
        .update({ category: trimmed })
        .eq('entry_type', entryType)
        .eq('category', previousName)
      if (entriesError) throw entriesError
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cost_categories'] })
      await queryClient.invalidateQueries({ queryKey: ['cost_entries'] })
    },
  })
}

export function useDeleteCostCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      entryType,
      name,
      monthStart,
    }: {
      id: string
      entryType: CostEntryType
      name: string
      monthStart?: string
    }) => {
      if (entryType === 'fijo_mes' && monthStart) {
        const { error } = await supabase
          .from('cost_entries')
          .delete()
          .eq('entry_type', 'fijo_mes')
          .eq('occurred_on', monthStart)
          .eq('category', name)
        if (error) throw error
      }
      const { error } = await supabase.from('cost_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cost_categories'] })
      await queryClient.invalidateQueries({ queryKey: ['cost_entries'] })
    },
  })
}
