import { z } from 'zod';

export const ToolParameterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  type: z.string(),
  required: z.boolean().optional(),
  schema: z.any().optional(),
});

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.any().optional(),
  parameters: z.array(ToolParameterSchema).optional(),
});

export const ResourceSchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

export const PromptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    required: z.boolean().optional(),
  })).optional(),
});

export type Tool = z.infer<typeof ToolSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type ToolParameter = z.infer<typeof ToolParameterSchema>;

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface ServerCapabilities {
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
}