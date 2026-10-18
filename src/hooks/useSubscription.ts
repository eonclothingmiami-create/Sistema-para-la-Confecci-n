import { useQuery } from '@tanstack/react-query'
import {
  isSubscriptionReadOnly,
  resolveEffectiveStatus,
  type SubscriptionEffectiveStatus,
  type SubscriptionState,
} from '../lib/subscription'
import { supabase } from '../lib/supabase'

const SUBSCRIPTION_REFETCH_MS = 10 * 60_000

function parseSubscriptionState(data: unknown): SubscriptionState {
  const raw = (data ?? {}) as Record<string, unknown>
  const status = (raw.effective_status as SubscriptionEffectiveStatus | undefined)
    ?? (raw.status as SubscriptionEffectiveStatus | undefined)
    ?? 'active'

  const parsed: SubscriptionState = {
    status,
    effective_status: (raw.effective_status as SubscriptionEffectiveStatus | undefined) ?? status,
    stored_status: (raw.stored_status as string | null | undefined) ?? null,
    plan: (raw.plan as string | null | undefined) ?? null,
    current_period_end: (raw.current_period_end as string | null | undefined) ?? null,
    days_left: Number(raw.days_left ?? 999),
    grace_days: Number(raw.grace_days ?? 0),
    grace_days_left: Number(raw.grace_days_left ?? raw.days_left_in_grace ?? 0),
    grace_until: (raw.grace_until as string | null | undefined) ?? null,
    days_left_in_grace: Number(raw.days_left_in_grace ?? raw.grace_days_left ?? 0),
    message: (raw.message as string | null | undefined) ?? null,
    enforcement_enabled: Boolean(raw.enforcement_enabled),
    source: (raw.source as string | null | undefined) ?? 'local',
    last_synced_at: (raw.last_synced_at as string | null | undefined) ?? null,
    tenant_id: (raw.tenant_id as string | null | undefined) ?? null,
    panel_version: Number(raw.panel_version ?? 0),
  }

  const effective = resolveEffectiveStatus(parsed)
  if (effective) {
    parsed.status = effective
    parsed.effective_status = effective
  }
  return parsed
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
    staleTime: SUBSCRIPTION_REFETCH_MS,
    refetchInterval: SUBSCRIPTION_REFETCH_MS,
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
    staleTime: SUBSCRIPTION_REFETCH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

/** true cuando enforcement está activo y el estado es suspended/expired. */
export function useSubscriptionReadOnly(): boolean {
  const { data } = useSubscription()
  return isSubscriptionReadOnly(data)
}
