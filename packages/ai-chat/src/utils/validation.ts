import { z } from 'zod';

// Message validation schemas
export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(10000),
  timestamp: z.string().datetime().optional(),
  toolCalls: z.array(z.any()).optional(),
  toolResults: z.array(z.any()).optional(),
});

export const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  messages: z.array(ChatMessageSchema).min(1).max(100),
});

export const CreateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  projectId: z.string().uuid().optional(),
});

// Sanitization functions
export function sanitizeInput(input: string): string {
  // Remove control characters except newlines and tabs
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit consecutive whitespace
  sanitized = sanitized.replace(/\s{3,}/g, '  ');
  
  // Trim to max length
  const maxLength = 10000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized.trim();
}

export function sanitizeHtml(input: string): string {
  // Basic HTML entity encoding for display
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export function validateSessionId(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export function validateMessageContent(content: string): { 
  valid: boolean; 
  error?: string;
  sanitized?: string;
} {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Message content cannot be empty' };
  }
  
  if (content.length > 10000) {
    return { valid: false, error: 'Message content exceeds maximum length' };
  }
  
  const sanitized = sanitizeInput(content);
  
  // Check for potential injection patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers
    /data:text\/html/i,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      return { valid: false, error: 'Message contains potentially unsafe content' };
    }
  }
  
  return { valid: true, sanitized };
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}