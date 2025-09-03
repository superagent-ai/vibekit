import { randomUUID } from 'crypto'

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  metadata?: Record<string, any>
}

export class TaskLogger {
  private projectId: string
  private taskId: string

  constructor(projectId: string, taskId: string) {
    this.projectId = projectId
    this.taskId = taskId
  }

  private async sendLog(level: LogEntry['level'], message: string, metadata?: Record<string, any>): Promise<void> {
    const logEntry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata
    }

    try {
      // Send to our API endpoint which will handle both streaming and file storage
      const response = await fetch(`/api/projects/${this.projectId}/tasks/${this.taskId}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logEntry)
      })

      if (!response.ok) {
        console.error('Failed to send log to task logger:', response.statusText)
      }
    } catch (error) {
      console.error('Failed to send log to task logger:', error)
    }
  }

  async info(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.sendLog('info', message, metadata)
  }

  async warn(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.sendLog('warn', message, metadata)
  }

  async error(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.sendLog('error', message, metadata)
  }

  async debug(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.sendLog('debug', message, metadata)
  }

  // Convenience method for command execution logs
  async commandStart(command: string, metadata?: Record<string, any>): Promise<void> {
    await this.info(`Starting command: ${command}`, { ...metadata, type: 'command_start', command })
  }

  async commandOutput(output: string, isStderr: boolean = false, metadata?: Record<string, any>): Promise<void> {
    const level = isStderr ? 'warn' : 'info'
    await this.sendLog(level, output, { ...metadata, type: 'command_output', stderr: isStderr })
  }

  async commandEnd(command: string, exitCode: number, metadata?: Record<string, any>): Promise<void> {
    const level = exitCode === 0 ? 'info' : 'error'
    await this.sendLog(level, `Command completed: ${command} (exit code: ${exitCode})`, {
      ...metadata,
      type: 'command_end',
      command,
      exitCode
    })
  }

  // Method to create a child logger for subtasks
  static forSubtask(projectId: string, taskId: string, subtaskId: string): TaskLogger {
    return new TaskLogger(projectId, `${taskId}-${subtaskId}`)
  }
}

// Utility function to create a task logger
export function createTaskLogger(projectId: string, taskId: string): TaskLogger {
  return new TaskLogger(projectId, taskId)
}
