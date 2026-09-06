import type { Session, User } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error

  if (data) return data as Profile

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: userId, role: 'supervisor' })
    .select('*')
    .single()

  if (insertError) return null
  return created as Profile
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
    queryFn: () => fetchProfile(user!.id),
    enabled: Boolean(user?.id),
  })

  return {
    session,
    user,
    profile: profileQuery.data ?? null,
    initializing,
    loadingProfile: profileQuery.isLoading,
  }
}
