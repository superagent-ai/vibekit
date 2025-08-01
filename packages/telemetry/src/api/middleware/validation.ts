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