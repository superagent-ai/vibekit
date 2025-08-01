import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// Query parameter schemas
export const queryFilterSchema = z.object({
  sessionId: z.string().uuid().optional(),
  category: z.string().max(100).optional(),
  action: z.string().max(100).optional(),
  eventType: z.enum(['start', 'stream', 'end', 'error', 'custom']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  start: z.coerce.number().int().min(0).optional(),
  end: z.coerce.number().int().min(0).optional(),
});

export const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'otlp', 'parquet']),
  category: z.string().max(100).optional(),
  session: z.string().uuid().optional(),
  start: z.coerce.number().int().min(0).optional(),
  end: z.coerce.number().int().min(0).optional(),
});

export const insightQuerySchema = z.object({
  start: z.coerce.number().int().min(0).optional(),
  end: z.coerce.number().int().min(0).optional(),
  categories: z.string().max(500).optional(), // comma-separated
  window: z.string().max(50).optional(),
});

// Session events query schema
export const sessionEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

// Path parameter schemas
export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\-_]+$/, 'Invalid session ID format'),
});

// Export body schema
export const exportBodySchema = z.object({
  format: z.enum(['json', 'csv', 'otlp', 'parquet']),
  filter: z.object({
    sessionId: z.string().optional(),
    category: z.string().optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
  }).optional(),
});

// Validation middleware factory
export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid query parameters',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        next(error);
      }
    }
  };
}

// Validate request body
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        next(error);
      }
    }
  };
}

// Validate path parameters
export function validateParams(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid path parameters',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        next(error);
      }
    }
  };
}