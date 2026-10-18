import { QueryClient } from '@tanstack/react-query'
import {
  isSubscriptionWriteDenied,
  SUBSCRIPTION_WRITE_DENIED_MESSAGE,
  type SubscriptionState,
} from './subscription'
import { showToast } from './toast'

function notifySubscriptionWriteDenied(error: unknown) {
  if (!isSubscriptionWriteDenied(error)) return
  const state = queryClient.getQueryData<SubscriptionState | null>(['subscription_state'])
  const locked =
    state?.enforcement_enabled === true &&
    (state.status === 'expired' ||
      state.status === 'suspended' ||
      state.effective_status === 'expired' ||
      state.effective_status === 'suspended')
  if (locked) {
    showToast(SUBSCRIPTION_WRITE_DENIED_MESSAGE)
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        notifySubscriptionWriteDenied(error)
      },
    },
  },
})

/** Para mutaciones con onError propio (no usan el default global). */
export function notifySubscriptionMutationError(error: unknown) {
  notifySubscriptionWriteDenied(error)
}
