import { QueryClient } from '@tanstack/react-query'
import {
  isSubscriptionWriteDenied,
  SUBSCRIPTION_WRITE_DENIED_MESSAGE,
} from './subscription'
import { showToast } from './toast'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        if (isSubscriptionWriteDenied(error)) {
          showToast(SUBSCRIPTION_WRITE_DENIED_MESSAGE)
        }
      },
    },
  },
})
