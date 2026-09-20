import type { Session, User } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Operator, Profile } from '../types/database'

async function fetchProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('ensure_own_profile')

  if (error) throw error
  return (data as Profile | null) ?? null
}

async function fetchLinkedOperator(userId: string): Promise<Operator | null> {
  const { data, error } = await supabase.from('operators').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return (data as Operator | null) ?? null
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setInitializing(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const user: User | null = session?.user ?? null

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfile(),
    enabled: Boolean(user?.id),
  })

  const linkedOperatorQuery = useQuery({
    queryKey: ['linked-operator', user?.id],
    queryFn: () => fetchLinkedOperator(user!.id),
    enabled: Boolean(user?.id),
  })

  return {
    session,
    user,
    profile: profileQuery.data ?? null,
    linkedOperator: linkedOperatorQuery.data ?? null,
    initializing,
    loadingProfile: profileQuery.isLoading,
    loadingLinkedOperator: linkedOperatorQuery.isLoading,
  }
}
