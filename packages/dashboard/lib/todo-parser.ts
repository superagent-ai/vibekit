// TodoWrite types for parsing
export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

export interface TodoWriteContent {
  type: 'tool_use';
  id: string;
  name: 'TodoWrite';
  input: {
    todos: Todo[];
  };
}

export interface MessageContent {
  type: string;
  id?: string;
  name?: string;
  input?: any;
}

export interface AssistantMessage {
  type: 'assistant';
  message: {
    id?: string;
    type?: string;
    role?: string;
    model?: string;
    content: MessageContent[];
    stop_reason?: any;
    stop_sequence?: any;
    usage?: any;
  };
  parent_tool_use_id?: string | null;
  session_id?: string;
}

/**
 * Parse TodoWrite content from a log message string
 * @param message - The log message to parse
 * @returns Array of todos if found, null otherwise
 */
export function parseTodoWriteFromMessage(message: string): Todo[] | null {
  try {
    const parsed = JSON.parse(message) as AssistantMessage;
    
    if (parsed.type === 'assistant' && parsed.message?.content) {
      const todoWriteContent = parsed.message.content.find(
        (content): content is TodoWriteContent => 
          content.type === 'tool_use' && content.name === 'TodoWrite'
      );
      
      if (todoWriteContent && todoWriteContent.input?.todos) {
        return todoWriteContent.input.todos;
      }
    }
  } catch (error) {
    // Not JSON or doesn't match expected structure
  }
  return null;
}