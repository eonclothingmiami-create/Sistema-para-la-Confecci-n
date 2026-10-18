import { useQuery } from '@tanstack/react-query'
import { isSubscriptionReadOnly, type SubscriptionState } from '../lib/subscription'
import { supabase } from '../lib/supabase'

function parseSubscriptionState(data: unknown): SubscriptionState {
  const raw = (data ?? {}) as Record<string, unknown>
  return {
    status: (raw.status as SubscriptionState['status']) ?? 'active',
    stored_status: (raw.stored_status as string | null | undefined) ?? null,
    plan: (raw.plan as string | null | undefined) ?? null,
    current_period_end: (raw.current_period_end as string | null | undefined) ?? null,
    days_left: Number(raw.days_left ?? 999),
    grace_days: Number(raw.grace_days ?? 0),
    grace_days_left: Number(raw.grace_days_left ?? 0),
    enforcement_enabled: Boolean(raw.enforcement_enabled),
  }
}

/** Fail-open: si el RPC falla o no existe, la app sigue sin avisos. */
async function fetchSubscriptionState(): Promise<SubscriptionState | null> {
  try {
    const { data, error } = await supabase.rpc('subscription_state')
    if (error) return null
    return parseSubscriptionState(data)
  } catch {
    return null
  }
}

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription_state'],
    queryFn: fetchSubscriptionState,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

export function useIsVendorAdmin() {
  return useQuery({
    queryKey: ['is_vendor_admin'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('is_vendor_admin')
        if (error) return false
        return Boolean(data)
      } catch {
        return false
      }
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

/** true cuando enforcement está activo y la suscripción está expired. */
export function useSubscriptionReadOnly(): boolean {
  const { data } = useSubscription()
  return isSubscriptionReadOnly(data)
}
