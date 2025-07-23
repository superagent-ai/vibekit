'use client'

import React from 'react'
import { useHealthStatus, useMetrics } from '@/hooks/use-telemetry-api'
import { formatBytes, formatDuration, formatNumber, getStatusColor } from '@/lib/utils'

export default function DashboardPage() {
  const { data: health, isLoading: healthLoading, error: healthError } = useHealthStatus()
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useMetrics()

  if (healthLoading || metricsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (healthError || metricsError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Connection Error</h1>
          <p className="text-muted-foreground mb-4">
            Failed to connect to telemetry server
          </p>
          <p className="text-sm text-muted-foreground">
            Make sure the telemetry server is running on port 8080
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold">VibeKit Telemetry Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Real-time monitoring and analytics for your telemetry data
        </p>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">System Status</h3>
            <div className={`h-3 w-3 rounded-full ${
              health?.status === 'healthy' ? 'bg-green-500' :
              health?.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
            }`}></div>
          </div>
          <div className="mt-2">
            <p className={`text-2xl font-bold ${getStatusColor(health?.status || 'unknown')}`}>
              {health?.status || 'Unknown'}
            </p>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-medium">Total Events</h3>
          <div className="mt-2">
            <p className="text-2xl font-bold">
              {formatNumber(metrics?.events.total || 0)}
            </p>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-medium">Error Rate</h3>
          <div className="mt-2">
            <p className="text-2xl font-bold">
              {metrics?.events.total ? 
                ((metrics.events.error / metrics.events.total) * 100).toFixed(1) : '0.0'
              }%
            </p>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-medium">Uptime</h3>
          <div className="mt-2">
            <p className="text-2xl font-bold">
              {health?.uptime ? formatDuration(health.uptime * 1000) : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Real-time Metrics */}
      {health?.metrics && (
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Real-time Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {health.metrics.map((metric, index) => (
              <div key={index} className="bg-muted rounded-lg p-4">
                <h3 className="font-medium text-sm text-muted-foreground">{metric.metric}</h3>
                <p className="text-xl font-bold mt-2">{formatNumber(metric.value)}</p>
                <span className="text-xs text-muted-foreground capitalize">{metric.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memory Usage */}
      {health?.memory && (
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Memory Usage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-muted rounded-lg p-4">
              <h3 className="font-medium text-sm text-muted-foreground">RSS</h3>
              <p className="text-xl font-bold mt-2">{formatBytes(health.memory.rss)}</p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <h3 className="font-medium text-sm text-muted-foreground">Heap Used</h3>
              <p className="text-xl font-bold mt-2">{formatBytes(health.memory.heapUsed)}</p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <h3 className="font-medium text-sm text-muted-foreground">Heap Total</h3>
              <p className="text-xl font-bold mt-2">{formatBytes(health.memory.heapTotal)}</p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <h3 className="font-medium text-sm text-muted-foreground">External</h3>
              <p className="text-xl font-bold mt-2">{formatBytes(health.memory.external)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Database Status */}
      {health?.database && (
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Database Status</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">Status:</span>
              <span className={getStatusColor(health.database.status)}>
                {health.database.status}
              </span>
            </div>
            {health.database.latency && (
              <div className="flex justify-between">
                <span className="font-medium">Latency:</span>
                <span>{health.database.latency}ms</span>
              </div>
            )}
            {health.database.activeConnections && (
              <div className="flex justify-between">
                <span className="font-medium">Active Connections:</span>
                <span>{health.database.activeConnections}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 