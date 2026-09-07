import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { colombiaHolidays } from '../lib/colombiaHolidays'
import { supabase } from '../lib/supabase'
import type { WorkshopCalendarEntry, WorkshopCalendarKind } from '../types/database'

export async function ensureColombiaHolidays(year: number) {
  const rows = [year - 1, year, year + 1].flatMap((item) =>
    colombiaHolidays(item).map((holiday) => ({
      occurred_on: holiday.date,
      kind: 'festivo' as const,
      name: holiday.name,
      source: 'oficial' as const,
    })),
  )

  const { error } = await supabase.from('workshop_calendar').upsert(rows, {
    onConflict: 'occurred_on,kind',
    ignoreDuplicates: true,
  })
  if (error) throw error
}

export function useWorkshopCalendar(from: string, to: string) {
  const year = Number(from.slice(0, 4))

  return useQuery({
    queryKey: ['workshop_calendar', from, to],
    queryFn: async () => {
      await ensureColombiaHolidays(year)
      const { data, error } = await supabase
        .from('workshop_calendar')
        .select('*')
        .gte('occurred_on', from)
        .lte('occurred_on', to)
        .order('occurred_on', { ascending: true })
      if (error) throw error
      return data as WorkshopCalendarEntry[]
    },
  })
}

export function useAddWorkshopDay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: { occurred_on: string; kind: WorkshopCalendarKind; name: string }) => {
      const name = values.name.trim()
      if (!name) throw new Error('Escribe un nombre para el día.')
      const { error } = await supabase.from('workshop_calendar').insert({
        occurred_on: values.occurred_on,
        kind: values.kind,
        name,
        source: 'manual',
      })
      if (error) {
        if (error.code === '23505') throw new Error('Ese día ya está marcado así.')
        throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workshop_calendar'] })
    },
  })
}

export function useDeleteWorkshopDay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workshop_calendar')
        .delete()
        .eq('id', id)
        .eq('source', 'manual')
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workshop_calendar'] })
    },
  })
}
