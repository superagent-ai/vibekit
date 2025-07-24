import { useEffect, useRef, useState } from 'react'
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

// Global socket instance - created once and reused
let globalSocket: Socket | null = null
let isInitialized = false
const connectionCallbacks: ((connected: boolean) => void)[] = []

// Initialize socket once and reuse it
export function initializeSocket() {
  if (isInitialized || globalSocket) {
    return globalSocket
  }
  
  console.log('🔌 Creating persistent Socket.IO connection')
  isInitialized = true
  
  globalSocket = io(import.meta.env.VITE_TELEMETRY_API_URL || 'http://localhost:3000', {
    transports: ['websocket', 'polling'],
    timeout: 10000,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    forceNew: false,
    autoConnect: true,
  })
  
  globalSocket.on('connect', () => {
    console.log('🔌 Persistent socket connected to telemetry server')
    connectionCallbacks.forEach(callback => {
      try {
        callback(true)
      } catch (error) {
        console.warn('Connection callback error:', error)
      }
    })
    
    // Subscribe to all channels
    console.log('📡 Subscribing to channels: health, metrics, events')
    globalSocket!.emit('subscribe', 'health')
    globalSocket!.emit('subscribe', 'metrics') 
    globalSocket!.emit('subscribe', 'events')
  })
  
  globalSocket.on('disconnect', (reason) => {
    console.log('🔌 Persistent socket disconnected:', reason)
    connectionCallbacks.forEach(callback => {
      try {
        callback(false)
      } catch (error) {
        console.warn('Disconnect callback error:', error)
      }
    })
  })
  
  globalSocket.on('connect_error', (error) => {
    console.warn('⚠️ Persistent socket connection error:', error)
    connectionCallbacks.forEach(callback => {
      try {
        callback(false)
      } catch (error) {
        console.warn('Error callback error:', error)
      }
    })
  })
  
  // Set up global event listeners once
  globalSocket.on('update:health', (data: any) => {
    console.log('📡 Health update received:', data)
    // We'll handle this through invalidation instead of direct cache updates
  })

  globalSocket.on('update:metrics', (data: any) => {
    console.log('📡 Metrics update received:', data)
    // We'll handle this through invalidation instead of direct cache updates
  })

  globalSocket.on('update:event', (eventData: any) => {
    console.log('📡 Event update received:', eventData)
    // Trigger invalidation for all dependent queries
    window.dispatchEvent(new CustomEvent('telemetry-event-update', { detail: eventData }))
  })

  // New database change events from Chokidar file watcher
  globalSocket.on('update:analytics', (data: any) => {
    console.log('📊 Analytics update received:', data)
    // Trigger analytics-specific invalidation
    window.dispatchEvent(new CustomEvent('telemetry-analytics-update', { detail: data }))
  })

  globalSocket.on('update:sessions', (data: any) => {
    console.log('👥 Sessions update received:', data)
    // Trigger sessions-specific invalidation
    window.dispatchEvent(new CustomEvent('telemetry-sessions-update', { detail: data }))
  })

  globalSocket.on('database_change', (data: any) => {
    console.log('💾 Database change detected:', data)
    // Trigger comprehensive invalidation for database changes
    window.dispatchEvent(new CustomEvent('telemetry-db-change', { detail: data }))
  })
  
  return globalSocket
}

// Hook to get connection status
export function useConnectionStatus() {
  const [isConnected, setIsConnected] = useState(false)
  
  useEffect(() => {
    // Initialize socket if not already done
    const socket = initializeSocket()
    
    const callback = (connected: boolean) => {
      setIsConnected(connected)
    }
    
    connectionCallbacks.push(callback)
    
    // Set initial status
    if (socket) {
      setIsConnected(socket.connected)
    }
    
    return () => {
      const index = connectionCallbacks.indexOf(callback)
      if (index > -1) {
        connectionCallbacks.splice(index, 1)
      }
    }
  }, [])
  
  return isConnected
}

// Hook to invalidate queries on socket events
function useSocketEventInvalidation() {
  const queryClient = useQueryClient()
  
  useEffect(() => {
    const handleEventUpdate = (event: CustomEvent) => {
      console.log('📡 Invalidating queries due to socket event')
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.events })
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'sessions'] })
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'analytics'] })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.metrics })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.health })
    }

    const handleAnalyticsUpdate = (event: CustomEvent) => {
      console.log('📊 Invalidating analytics queries due to database change')
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'analytics'] })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.events })
    }

    const handleSessionsUpdate = (event: CustomEvent) => {
      console.log('👥 Invalidating sessions queries due to database change')
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'sessions'] })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.metrics })
    }

    const handleDatabaseChange = (event: CustomEvent) => {
      console.log('💾 Comprehensive invalidation due to database change')
      // Invalidate everything for database changes
      queryClient.invalidateQueries({ queryKey: ['telemetry'] })
    }
    
    window.addEventListener('telemetry-event-update', handleEventUpdate as EventListener)
    window.addEventListener('telemetry-analytics-update', handleAnalyticsUpdate as EventListener)
    window.addEventListener('telemetry-sessions-update', handleSessionsUpdate as EventListener)
    window.addEventListener('telemetry-db-change', handleDatabaseChange as EventListener)
    
    return () => {
      window.removeEventListener('telemetry-event-update', handleEventUpdate as EventListener)
      window.removeEventListener('telemetry-analytics-update', handleAnalyticsUpdate as EventListener)
      window.removeEventListener('telemetry-sessions-update', handleSessionsUpdate as EventListener)
      window.removeEventListener('telemetry-db-change', handleDatabaseChange as EventListener)
    }
  }, [queryClient])
}

// Health status hook with real-time updates
export function useHealthStatus() {
  useSocketEventInvalidation()
  initializeSocket() // Ensure socket is initialized
  
  return useQuery({
    queryKey: QUERY_KEYS.health,
    queryFn: () => telemetryAPI.getHealth(),
    refetchInterval: 30000, // Fallback polling every 30 seconds
    staleTime: 15000,
  })
}

// Real-time metrics hook with WebSocket updates
export function useMetrics() {
  useSocketEventInvalidation()
  initializeSocket() // Ensure socket is initialized
  
  return useQuery({
    queryKey: QUERY_KEYS.metrics,
    queryFn: () => telemetryAPI.getMetrics(),
    refetchInterval: 15000, // Fallback polling every 15 seconds
    staleTime: 10000,
  })
}

// Analytics dashboard hook with real-time updates  
export function useAnalytics(window: 'hour' | 'day' | 'week' = 'day') {
  useSocketEventInvalidation()
  initializeSocket() // Ensure socket is initialized
  
  return useQuery({
    queryKey: QUERY_KEYS.analytics(window),
    queryFn: () => telemetryAPI.getAnalytics(window),
    refetchInterval: 60000, // Fallback polling every minute
    staleTime: 30000,
  })
}

// Sessions query hook with real-time updates
export function useSessions(filters: FilterOptions = {}) {
  useSocketEventInvalidation()
  initializeSocket() // Ensure socket is initialized
  
  return useQuery({
    queryKey: QUERY_KEYS.sessions(filters),
    queryFn: () => telemetryAPI.querySessions(filters),
    refetchInterval: 30000, // Fallback polling every 30 seconds
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

// Events hook with improved real-time handling
export function useTelemetryEvents(onEvent?: (event: any) => void) {
  useSocketEventInvalidation()
  const socket = initializeSocket() // Ensure socket is initialized
  
  const eventsQuery = useQuery({
    queryKey: QUERY_KEYS.events,
    queryFn: () => telemetryAPI.getEvents(),
    refetchInterval: 10000, // Fallback polling every 10 seconds
    staleTime: 5000,
  })

  // Set up custom event handler if provided
  useEffect(() => {
    if (onEvent) {
      const handleCustomEvent = (event: CustomEvent) => {
        console.log('📡 Custom event handler called:', event.detail)
        onEvent(event.detail)
      }
      
      window.addEventListener('telemetry-event-update', handleCustomEvent as EventListener)
      
      return () => {
        window.removeEventListener('telemetry-event-update', handleCustomEvent as EventListener)
      }
    }
  }, [onEvent])

  return eventsQuery
}

// Custom hook for manual refresh
export function useRefreshData() {
  const queryClient = useQueryClient()

  const refreshAll = () => {
    console.log('🔄 Manual refresh: Invalidating all telemetry queries')
    queryClient.invalidateQueries({ queryKey: ['telemetry'] })
  }

  const refreshHealth = () => {
    console.log('🔄 Manual refresh: Health')
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.health })
  }

  const refreshMetrics = () => {
    console.log('🔄 Manual refresh: Metrics')
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.metrics })
  }

  const refreshAnalytics = (window?: string) => {
    console.log('🔄 Manual refresh: Analytics', window)
    if (window) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.analytics(window) })
    } else {
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'analytics'] })
    }
  }

  const refreshSessions = (filters?: FilterOptions) => {
    console.log('🔄 Manual refresh: Sessions', filters)
    if (filters) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(filters) })
    } else {
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'sessions'] })
    }
  }

  const refreshEvents = () => {
    console.log('🔄 Manual refresh: Events')
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