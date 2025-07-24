import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io, Socket } from 'socket.io-client'
import { telemetryAPI } from '@/lib/telemetry-api'
import type { FilterOptions } from '@/lib/types'

// Query keys for caching
export const QUERY_KEYS = {
  health: ['telemetry', 'health'] as const,
  metrics: ['telemetry', 'metrics'] as const,
  analytics: (window: string) => ['telemetry', 'analytics', window] as const,
  sessions: (filters: FilterOptions) => ['telemetry', 'sessions', filters] as const,
  events: ['telemetry', 'events'] as const,
  apiInfo: ['telemetry', 'info'] as const,
}

// Real-time WebSocket subscription hook
export function useRealTimeSubscription<T>(
  channel: string, 
  queryKey: readonly unknown[], 
  onUpdate?: (data: T) => void
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Connect to Socket.IO server
    const socket: Socket = io(import.meta.env.VITE_TELEMETRY_API_URL || 'http://localhost:3000')
    
    socket.on('connect', () => {
      console.log(`🔌 Connected to telemetry server, subscribing to channel: ${channel}`)
      socket.emit('subscribe', channel)
    })
    
    socket.on(`update:${channel}`, (data: T) => {
      console.log(`📡 Received real-time update for ${channel}:`, data)
      
      // Call custom update handler if provided
      if (onUpdate) {
        onUpdate(data)
      }
      
      // Update React Query cache with new data
      queryClient.setQueryData(queryKey, data)
    })
    
    socket.on('disconnect', () => {
      console.log(`🔌 Disconnected from telemetry server`)
    })
    
    socket.on('connect_error', (error) => {
      console.warn(`⚠️ WebSocket connection error:`, error)
    })
    
    // Cleanup on unmount
    return () => {
      console.log(`🔌 Cleaning up WebSocket connection for channel: ${channel}`)
      socket.disconnect()
    }
  }, [channel, queryKey, onUpdate, queryClient])
}

// Health status hook with real-time updates
export function useHealthStatus() {
  // Set up real-time subscription
  useRealTimeSubscription('health', QUERY_KEYS.health)
  
  return useQuery({
    queryKey: QUERY_KEYS.health,
    queryFn: () => telemetryAPI.getHealth(),
    refetchInterval: 30000, // Fallback polling every 30 seconds
    staleTime: 15000,
  })
}

// Real-time metrics hook with WebSocket updates
export function useMetrics() {
  // Set up real-time subscription
  useRealTimeSubscription('metrics', QUERY_KEYS.metrics)
  
  return useQuery({
    queryKey: QUERY_KEYS.metrics,
    queryFn: () => telemetryAPI.getMetrics(),
    refetchInterval: 15000, // Fallback polling every 15 seconds
    staleTime: 10000,
  })
}

// Analytics dashboard hook with real-time updates  
export function useAnalytics(window: 'hour' | 'day' | 'week' = 'day') {
  return useQuery({
    queryKey: QUERY_KEYS.analytics(window),
    queryFn: () => telemetryAPI.getAnalytics(window),
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  })
}

// Sessions query hook - now using the correct query endpoint
export function useSessions(filters: FilterOptions = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.sessions(filters),
    queryFn: () => telemetryAPI.querySessions(filters),
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
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

// Events hook - now creates synthetic events from available data
export function useTelemetryEvents(onEvent?: (event: any) => void) {
  const eventsQuery = useQuery({
    queryKey: QUERY_KEYS.events,
    queryFn: () => telemetryAPI.getEvents(),
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 5000,
  })

  // Set up real-time event listening
  useEffect(() => {
    const socket: Socket = io(import.meta.env.VITE_TELEMETRY_API_URL || 'http://localhost:3000')
    
    socket.on('connect', () => {
      console.log('🔌 Connected for telemetry events, subscribing to events channel')
      socket.emit('subscribe', 'events')
    })
    
    socket.on('update:event', (eventData: any) => {
      console.log(`📡 Received telemetry event:`, eventData)
      
      if (onEvent) {
        onEvent(eventData)
      }
    })
    
    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from telemetry events')
    })
    
    return () => {
      socket.disconnect()
    }
  }, [onEvent])

  return eventsQuery
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

  const refreshEvents = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.events })
  }

  return {
    refreshAll,
    refreshHealth,
    refreshMetrics,
    refreshAnalytics,
    refreshSessions,
    refreshEvents,
  }
} 