import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  metadata?: Record<string, any>
}

// In-memory store for active streams
const activeStreams = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>()
const logBuffers = new Map<string, LogEntry[]>()

// Helper to get log file path
function getLogFilePath(projectId: string, taskId: string): string {
  return join(homedir(), '.vibekit', 'projects', projectId, 'tasks', taskId, 'logs.json')
}

// Helper to get task key
function getTaskKey(projectId: string, taskId: string): string {
  return `${projectId}:${taskId}`
}

// Helper to ensure directory exists
async function ensureLogDir(filePath: string): Promise<void> {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'))
  try {
    await mkdir(dir, { recursive: true })
  } catch (error) {
    // Directory might already exist, ignore error
  }
}

// Helper to read existing logs
async function readExistingLogs(filePath: string): Promise<LogEntry[]> {
  try {
    if (existsSync(filePath)) {
      const content = await readFile(filePath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    console.warn('Failed to read existing logs:', error)
  }
  return []
}

// Helper to append log to file
async function appendLogToFile(filePath: string, logEntry: LogEntry): Promise<void> {
  try {
    await ensureLogDir(filePath)
    const existingLogs = await readExistingLogs(filePath)
    
    // Check if log already exists (avoid duplicates)
    if (!existingLogs.some(log => log.id === logEntry.id)) {
      existingLogs.push(logEntry)
      await writeFile(filePath, JSON.stringify(existingLogs, null, 2))
    }
  } catch (error) {
    console.error('Failed to append log to file:', error)
  }
}

// Helper to send SSE message
function sendSSEMessage(controller: ReadableStreamDefaultController<Uint8Array>, data: any, eventId?: string): void {
  const message = `data: ${JSON.stringify(data)}\n${eventId ? `id: ${eventId}\n` : ''}\n`
  controller.enqueue(new TextEncoder().encode(message))
}

// Add log entry to all active streams for a task
export function addLogEntry(projectId: string, taskId: string, logEntry: LogEntry): void {
  const taskKey = getTaskKey(projectId, taskId)
  const controllers = activeStreams.get(taskKey)
  
  if (controllers) {
    // Send to all active streams
    controllers.forEach(controller => {
      try {
        sendSSEMessage(controller, logEntry, logEntry.id)
      } catch (error) {
        console.warn('Failed to send log to stream:', error)
      }
    })
  }
  
  // Add to buffer for new connections
  if (!logBuffers.has(taskKey)) {
    logBuffers.set(taskKey, [])
  }
  logBuffers.get(taskKey)!.push(logEntry)
  
  // Keep only last 100 entries in buffer to prevent memory leaks
  const buffer = logBuffers.get(taskKey)!
  if (buffer.length > 100) {
    buffer.splice(0, buffer.length - 100)
  }
  
  // Persist to file
  const logFilePath = getLogFilePath(projectId, taskId)
  appendLogToFile(logFilePath, logEntry)
}

// Register a stream controller
export function registerStreamController(
  projectId: string, 
  taskId: string, 
  controller: ReadableStreamDefaultController<Uint8Array>
): () => void {
  const taskKey = getTaskKey(projectId, taskId)
  
  if (!activeStreams.has(taskKey)) {
    activeStreams.set(taskKey, new Set())
  }
  activeStreams.get(taskKey)!.add(controller)
  
  // Send initial connection message
  sendSSEMessage(controller, { type: 'connected', timestamp: new Date().toISOString() })
  
  // Send buffered logs
  const buffer = logBuffers.get(taskKey) || []
  buffer.forEach(log => {
    sendSSEMessage(controller, log, log.id)
  })
  
  // Return cleanup function
  return () => {
    const controllers = activeStreams.get(taskKey)
    if (controllers) {
      controllers.delete(controller)
      if (controllers.size === 0) {
        activeStreams.delete(taskKey)
        // Clean up log buffer after some time
        setTimeout(() => {
          logBuffers.delete(taskKey)
        }, 60000) // Keep buffer for 1 minute after last connection
      }
    }
  }
}

// Send buffered logs from a specific lastEventId
export function sendBufferedLogs(
  projectId: string,
  taskId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  lastEventId?: string
): void {
  const taskKey = getTaskKey(projectId, taskId)
  const buffer = logBuffers.get(taskKey) || []
  let sendFromIndex = 0
  
  if (lastEventId) {
    const lastIndex = buffer.findIndex(log => log.id === lastEventId)
    sendFromIndex = lastIndex >= 0 ? lastIndex + 1 : 0
  }
  
  // Send buffered logs
  for (let i = sendFromIndex; i < buffer.length; i++) {
    sendSSEMessage(controller, buffer[i], buffer[i].id)
  }
}

export type { LogEntry }