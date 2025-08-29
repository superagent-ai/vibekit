import { z } from 'zod';

export const TransportTypeSchema = z.enum(['stdio', 'sse', 'http']);
export type TransportType = z.infer<typeof TransportTypeSchema>;

export const ServerStatusSchema = z.enum(['active', 'inactive', 'error', 'connecting', 'disconnected']);
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

export const StdioConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

export const HttpConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().optional(),
});

export const ServerConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    transport: z.literal('stdio'),
    config: StdioConfigSchema,
  }),
  z.object({
    transport: z.literal('sse'),
    config: HttpConfigSchema,
  }),
  z.object({
    transport: z.literal('http'),
    config: HttpConfigSchema,
  }),
]);

export const MCPServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  transport: TransportTypeSchema,
  config: z.union([StdioConfigSchema, HttpConfigSchema]),
  status: ServerStatusSchema.default('inactive'),
  toolCount: z.number().optional(),
  resourceCount: z.number().optional(),
  promptCount: z.number().optional(),
  lastConnected: z.date().optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MCPServer = z.infer<typeof MCPServerSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type StdioConfig = z.infer<typeof StdioConfigSchema>;
export type HttpConfig = z.infer<typeof HttpConfigSchema>;

export interface ServerCreateInput {
  name: string;
  description?: string;
  transport: TransportType;
  config: StdioConfig | HttpConfig;
}

export interface ServerUpdateInput {
  name?: string;
  description?: string;
  config?: StdioConfig | HttpConfig;
}