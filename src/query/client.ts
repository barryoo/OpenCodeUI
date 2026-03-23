import { QueryClient } from '@tanstack/react-query'

export const SESSION_QUERY_STALE_TIME = 1000
const DEFAULT_GC_TIME = 5 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: SESSION_QUERY_STALE_TIME,
      gcTime: DEFAULT_GC_TIME,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
