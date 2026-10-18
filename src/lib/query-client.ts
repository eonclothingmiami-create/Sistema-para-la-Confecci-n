import { QueryClient } from '@tanstack/react-query'
import {
  isSubscriptionWriteDenied,
  SUBSCRIPTION_WRITE_DENIED_MESSAGE,
  type SubscriptionState,
} from './subscription'
import { showToast } from './toast'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
})

queryClient.setDefaultOptions({
  mutations: {
    onError: (error) => {
      if (!isSubscriptionWriteDenied(error)) return
      const state = queryClient.getQueryData<SubscriptionState | null>(['subscription_state'])
      // Solo toast de suscripción si el candado está activo y vencido.
      // Evita engañar a operarios con un 42501 de rol normal.
      if (state?.enforcement_enabled === true && state.status === 'expired') {
        showToast(SUBSCRIPTION_WRITE_DENIED_MESSAGE)
      }
    },
  },
})
