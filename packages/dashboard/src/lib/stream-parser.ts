interface ParsedStreamData {
  type: string
  icon: string
  summary: string
  details: Record<string, any>
  rawData: any
}

interface StreamOperation {
  operation: string
  target?: string
  details?: string
  metadata?: Record<string, any>
}

/**
 * Parse stream data from telemetry events into structured, human-readable format
 */
export function parseStreamData(streamData: string | null): ParsedStreamData | null {
  if (!streamData) return null

  try {
    const data = JSON.parse(streamData)
    
    // Handle different stream data patterns
    if (data.type) {
      return parseByType(data)
    }
    
    if (data.sandbox_id) {
      return parseSandboxOperation(data)
    }
    
    if (data.file_operation || data.files) {
      return parseFileOperation(data)
    }
    
    if (data.code_block || data.code) {
      return parseCodeOperation(data)
    }
    
    if (data.command || data.cmd) {
      return parseCommandOperation(data)
    }
    
    // Default parsing for unknown formats
    return parseGenericData(data)
    
  } catch (error) {
    // If JSON parsing fails, treat as plain text
    return {
      type: 'text',
      icon: '📝',
      summary: streamData.slice(0, 100) + (streamData.length > 100 ? '...' : ''),
      details: {},
      rawData: streamData
    }
  }
}

function parseByType(data: any): ParsedStreamData {
  const typeMapping: Record<string, { icon: string; summary: (d: any) => string }> = {
    'start': {
      icon: '🚀',
      summary: (d) => `Starting ${d.operation || 'operation'}`
    },
    'file_create': {
      icon: '📁',
      summary: (d) => `Created file: ${d.filename || d.file || 'unknown'}`
    },
    'file_edit': {
      icon: '✏️',
      summary: (d) => `Edited file: ${d.filename || d.file || 'unknown'}`
    },
    'code_execution': {
      icon: '💻',
      summary: (d) => `Executed code in ${d.language || 'unknown language'}`
    },
    'sandbox_operation': {
      icon: '📦',
      summary: (d) => `Sandbox operation: ${d.operation || 'unknown'}`
    },
    'error': {
      icon: '❌',
      summary: (d) => `Error: ${d.message || d.error || 'Unknown error'}`
    },
    'completion': {
      icon: '✅',
      summary: (d) => `Completed: ${d.operation || d.task || 'operation'}`
    }
  }

  const config = typeMapping[data.type] || {
    icon: '📝',
    summary: () => `${data.type}: ${JSON.stringify(data).slice(0, 50)}...`
  }

  return {
    type: data.type,
    icon: config.icon,
    summary: config.summary(data),
    details: extractDetails(data),
    rawData: data
  }
}

function parseSandboxOperation(data: any): ParsedStreamData {
  return {
    type: 'sandbox',
    icon: '📦',
    summary: `Sandbox: ${data.sandbox_id}`,
    details: {
      sandboxId: data.sandbox_id,
      operation: data.operation,
      status: data.status,
      ...extractDetails(data)
    },
    rawData: data
  }
}

function parseFileOperation(data: any): ParsedStreamData {
  const operation = data.file_operation || data
  const files = data.files || (operation.file ? [operation.file] : [])
  
  let summary = 'File operation'
  if (files.length === 1) {
    summary = `File: ${files[0]}`
  } else if (files.length > 1) {
    summary = `Files: ${files.slice(0, 2).join(', ')}${files.length > 2 ? ` +${files.length - 2} more` : ''}`
  }

  return {
    type: 'file',
    icon: '📁',
    summary,
    details: {
      files,
      operation: operation.operation || operation.type,
      changes: operation.changes,
      linesAdded: operation.lines_added,
      linesRemoved: operation.lines_removed,
      ...extractDetails(data)
    },
    rawData: data
  }
}

function parseCodeOperation(data: any): ParsedStreamData {
  const codeBlock = data.code_block || data.code || data
  const language = codeBlock.language || data.language || 'unknown'
  const functionName = extractFunctionName(codeBlock.content || codeBlock)
  
  let summary = `Code: ${language}`
  if (functionName) {
    summary = `Function: ${functionName}`
  }

  return {
    type: 'code',
    icon: '💻',
    summary,
    details: {
      language,
      functionName,
      lines: codeBlock.content ? codeBlock.content.split('\n').length : 0,
      content: codeBlock.content || codeBlock,
      ...extractDetails(data)
    },
    rawData: data
  }
}

function parseCommandOperation(data: any): ParsedStreamData {
  const command = data.command || data.cmd
  const commandName = command.split(' ')[0]
  
  return {
    type: 'command',
    icon: '⚡',
    summary: `Command: ${commandName}`,
    details: {
      command,
      args: command.split(' ').slice(1),
      directory: data.cwd || data.directory,
      exitCode: data.exit_code,
      output: data.output,
      ...extractDetails(data)
    },
    rawData: data
  }
}

function parseGenericData(data: any): ParsedStreamData {
  // Try to infer content from common keys
  const keys = Object.keys(data)
  let summary = 'Data update'
  let icon = '📝'
  
  if (keys.includes('success') || keys.includes('completed')) {
    icon = '✅'
    summary = 'Operation completed'
  } else if (keys.includes('error') || keys.includes('failed')) {
    icon = '❌'
    summary = 'Operation failed'
  } else if (keys.includes('progress') || keys.includes('status')) {
    icon = '⏳'
    summary = 'Progress update'
  }

  return {
    type: 'generic',
    icon,
    summary,
    details: extractDetails(data),
    rawData: data
  }
}

function extractDetails(data: any): Record<string, any> {
  const details: Record<string, any> = {}
  
  // Extract meaningful details, excluding raw content
  const importantKeys = [
    'filename', 'file', 'files', 'operation', 'status', 'message', 'error',
    'language', 'function_name', 'lines_added', 'lines_removed', 'changes',
    'sandbox_id', 'command', 'exit_code', 'directory', 'timestamp', 'duration'
  ]
  
  for (const key of importantKeys) {
    if (data[key] !== undefined) {
      details[key] = data[key]
    }
  }
  
  return details
}

function extractFunctionName(code: string): string | null {
  if (typeof code !== 'string') return null
  
  // Try to extract function names from common patterns
  const patterns = [
    /function\s+(\w+)\s*\(/,
    /const\s+(\w+)\s*=\s*\(/,
    /def\s+(\w+)\s*\(/,
    /(\w+)\s*:\s*function/,
    /export\s+function\s+(\w+)/
  ]
  
  for (const pattern of patterns) {
    const match = code.match(pattern)
    if (match) return match[1]
  }
  
  return null
}

/**
 * Group events by prompt, creating logical event groups
 */
export interface EventGroup {
  prompt: string
  startEvent: any
  streamEvents: any[]
  endEvent?: any
  duration?: number
  summary: {
    operations: StreamOperation[]
    filesAffected: string[]
    totalStreams: number
  }
}

export function groupEventsByPrompt(events: any[]): EventGroup[] {
  const groups: EventGroup[] = []
  const eventsByPrompt = new Map<string, any[]>()
  
  // Group events by prompt
  events.forEach(event => {
    const prompt = event.prompt || 'Unknown operation'
    if (!eventsByPrompt.has(prompt)) {
      eventsByPrompt.set(prompt, [])
    }
    eventsByPrompt.get(prompt)!.push(event)
  })
  
  // Create event groups
  eventsByPrompt.forEach((groupEvents, prompt) => {
    // Sort events by timestamp
    groupEvents.sort((a, b) => a.timestamp - b.timestamp)
    
    const startEvent = groupEvents.find(e => e.eventType === 'start')
    const endEvent = groupEvents.find(e => e.eventType === 'end')
    const streamEvents = groupEvents.filter(e => e.eventType === 'stream')
    
    // Parse stream events to extract operations
    const operations: StreamOperation[] = []
    const filesAffected = new Set<string>()
    
    streamEvents.forEach(event => {
      const parsed = parseStreamData(event.streamData)
      if (parsed) {
        operations.push({
          operation: parsed.summary,
          target: parsed.details.filename || parsed.details.file,
          details: parsed.type,
          metadata: parsed.details
        })
        
        // Collect affected files
        if (parsed.details.files) {
          parsed.details.files.forEach((file: string) => filesAffected.add(file))
        } else if (parsed.details.filename || parsed.details.file) {
          filesAffected.add(parsed.details.filename || parsed.details.file)
        }
      }
    })
    
    const duration = startEvent && endEvent 
      ? endEvent.timestamp - startEvent.timestamp 
      : undefined
    
    groups.push({
      prompt,
      startEvent,
      streamEvents,
      endEvent,
      duration,
      summary: {
        operations,
        filesAffected: Array.from(filesAffected),
        totalStreams: streamEvents.length
      }
    })
  })
  
  return groups.sort((a, b) => (a.startEvent?.timestamp || 0) - (b.startEvent?.timestamp || 0))
} 