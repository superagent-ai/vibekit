import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export type MCPTransport = StdioClientTransport | SSEClientTransport | Transport;
export type MCPClient = Client;

export interface ClientEvents {
  'connected': () => void;
  'disconnected': (reason?: string) => void;
  'error': (error: Error) => void;
  'tool:discovered': (tools: any[]) => void;
  'resource:discovered': (resources: any[]) => void;
}