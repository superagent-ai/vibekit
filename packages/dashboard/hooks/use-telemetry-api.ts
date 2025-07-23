'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { telemetryAPI } from '@/lib/telemetry-api'
import type { FilterOptions } from '@/lib/types'

// Query keys for caching
export const QUERY_KEYS = {
  health: ['telemetry', 'health'] as const,
  metrics: ['telemetry', 'metrics'] as const,
  analytics: (window: string) => ['telemetry', 'analytics', window] as const,
  sessions: (filters: FilterOptions) => ['telemetry', 'sessions', filters] as const,
  apiInfo: ['telemetry', 'info'] as const,
}

// Health status hook
export function useHealthStatus(refreshInterval = 30000) {
  return useQuery({
    queryKey: QUERY_KEYS.health,
    queryFn: () => telemetryAPI.getHealth(),
    refetchInterval: refreshInterval,
    staleTime: 15000, // Consider data stale after 15 seconds
  })
}

// Real-time metrics hook
export function useMetrics(refreshInterval = 5000) {
  return useQuery({
    queryKey: QUERY_KEYS.metrics,
    queryFn: () => telemetryAPI.getMetrics(),
    refetchInterval: refreshInterval,
    staleTime: 2000, // Very fresh data needed
  })
}

// Analytics dashboard hook
export function useAnalytics(window: 'hour' | 'day' | 'week' = 'day', refreshInterval = 30000) {
  return useQuery({
    queryKey: QUERY_KEYS.analytics(window),
    queryFn: () => telemetryAPI.getAnalytics(window),
    refetchInterval: refreshInterval,
    staleTime: 15000,
  })
}

// Sessions query hook
export function useSessions(filters: FilterOptions = {}, refreshInterval = 10000) {
  return useQuery({
    queryKey: QUERY_KEYS.sessions(filters),
    queryFn: () => telemetryAPI.querySessions(filters),
    refetchInterval: refreshInterval,
    staleTime: 5000,
  })
}

// API info hook (static data, rarely changes)
export function useApiInfo() {
  return useQuery({
    queryKey: QUERY_KEYS.apiInfo,
    queryFn: () => telemetryAPI.getApiInfo(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: false, // Don't auto-refresh
  })
}

// Custom hook for manual refresh
export function useRefreshData() {
  const queryClient = useQueryClient()

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['telemetry'] })
  }

  const refreshHealth = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.health })
  }

  const refreshMetrics = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.metrics })
  }

  const refreshAnalytics = (window?: string) => {
    if (window) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.analytics(window) })
    } else {
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'analytics'] })
    }
  }

  const refreshSessions = (filters?: FilterOptions) => {
    if (filters) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(filters) })
    } else {
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'sessions'] })
    }
  }

  return {
    refreshAll,
    refreshHealth,
    refreshMetrics,
    refreshAnalytics,
    refreshSessions,
  }
} 