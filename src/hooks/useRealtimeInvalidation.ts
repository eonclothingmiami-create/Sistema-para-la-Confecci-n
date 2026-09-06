import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TABLES = [
  'daily_production_headers',
  'daily_production_entries',
  'operators',
  'clients',
  'production_orders',
] as const

export function useRealtimeInvalidation() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase.channel('production-live')

    for (const table of TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          void queryClient.invalidateQueries()
        },
      )
    }

    channel.subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}
