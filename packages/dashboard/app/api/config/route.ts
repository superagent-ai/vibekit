/**
 * Configuration management API endpoints
 * 
 * Provides REST API for:
 * - Getting configuration values
 * - Setting configuration values
 * - Getting configuration schemas
 * - Validating configuration values
 * - Exporting/importing configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { Config, ConfigCategory, ConfigSchema } from '@/lib/config-manager';
import { ErrorResponse, VibeKitValidationError } from '@/lib/error-handler';
import { logUtils } from '@/lib/structured-logger';

/**
 * GET /api/config - Get configuration values
 * 
 * Retrieves configuration values with optional filtering and schema information.
 * Supports getting all configurations, category-specific configs, or individual values.
 * 
 * @param request - The incoming HTTP request
 * @returns JSON response with configuration data
 * 
 * @example
 * Query parameters:
 * - `category`: Filter by configuration category (e.g., 'system', 'resources')
 * - `key`: Get specific configuration key within a category
 * - `schema`: Include schema information ('true' to include)
 * 
 * Examples:
 * - `/api/config` - Get all configurations
 * - `/api/config?category=system` - Get all system configurations
 * - `/api/config?category=system&key=port` - Get specific system port configuration
 * - `/api/config?category=system&schema=true` - Get system configs with schemas
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const timer = logUtils.requestStart('GET', '/api/config', requestId);

  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category') as ConfigCategory;
    const key = searchParams.get('key');
    const includeSchema = searchParams.get('schema') === 'true';

    // Initialize config manager if needed
    await Config.initialize();

    let result: any;

    if (category && key) {
      // Get specific configuration value
      const value = Config.get(category, key);
      result = {
        category,
        key,
        value,
        ...(includeSchema && {
          schema: Config.getSchemas().get(`${category}.${key}`)?.schema
        })
      };
    } else if (category) {
      // Get all configurations for category
      const configs = Config.getCategory(category);
      result = {
        category,
        configs,
        ...(includeSchema && {
          schemas: Object.fromEntries(
            Array.from(Config.getSchemas().entries())
              .filter(([k]) => k.startsWith(`${category}.`))
              .map(([k, v]) => [k.substring(category.length + 1), v.schema])
          )
        })
      };
    } else {
      // Get all configurations
      result = {
        configs: Config.exportConfiguration(),
        stats: Config.getStats(),
        ...(includeSchema && {
          schemas: Object.fromEntries(
            Array.from(Config.getSchemas().entries())
              .map(([k, v]) => [k, v.schema])
          )
        })
      };
    }

    logUtils.requestComplete(timer, 200, requestId);

    return NextResponse.json({
      success: true,
      data: result,
      requestId
    });

  } catch (error) {
    logUtils.requestComplete(timer, 500, requestId);
    return ErrorResponse.create(error, requestId);
  }
}

/**
 * PUT /api/config - Set configuration value
 * 
 * Updates a configuration value with validation and optional persistence.
 * The value is validated against the registered schema before being set.
 * 
 * @param request - The incoming HTTP request with JSON body
 * @returns JSON response indicating success or validation errors
 * 
 * @example
 * Request body:
 * ```json
 * {
 *   "category": "system",
 *   "key": "port",
 *   "value": 8080,
 *   "persist": true
 * }
 * ```
 * 
 * Required fields:
 * - `category`: Configuration category (must be valid ConfigCategory)
 * - `key`: Configuration key within the category
 * - `value`: New configuration value (will be validated)
 * 
 * Optional fields:
 * - `persist`: Whether to save to configuration file (default: false)
 */
export async function PUT(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const timer = logUtils.requestStart('PUT', '/api/config', requestId);

  try {
    const body = await request.json();
    const { category, key, value, persist = false } = body;

    // Validate required fields
    if (!category || !key) {
      throw new VibeKitValidationError('Category and key are required');
    }

    // Validate category
    if (!Object.values(ConfigCategory).includes(category)) {
      throw new VibeKitValidationError(`Invalid category: ${category}`);
    }

    // Initialize config manager if needed
    await Config.initialize();

    // Set the configuration value
    await Config.set(category as ConfigCategory, key, value, persist);

    logUtils.requestComplete(timer, 200, requestId);

    return NextResponse.json({
      success: true,
      message: 'Configuration updated successfully',
      data: {
        category,
        key,
        value,
        persisted: persist
      },
      requestId
    });

  } catch (error) {
    logUtils.requestComplete(timer, 400, requestId);
    return ErrorResponse.create(error, requestId);
  }
}

/**
 * POST /api/config/validate - Validate configuration value
 * 
 * Validates a configuration value against its schema without actually
 * setting the value. Useful for form validation and pre-checking values.
 * 
 * @param request - The incoming HTTP request with JSON body
 * @returns JSON response with validation results
 * 
 * @example
 * Request body:
 * ```json
 * {
 *   "category": "resources",
 *   "key": "max_concurrent_executions",
 *   "value": 25
 * }
 * ```
 * 
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "valid": false,
 *     "errors": ["Value must be at most 20"],
 *     "warnings": [],
 *     "category": "resources",
 *     "key": "max_concurrent_executions",
 *     "value": 25
 *   }
 * }
 * ```
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const timer = logUtils.requestStart('POST', '/api/config/validate', requestId);

  try {
    const body = await request.json();
    const { category, key, value } = body;

    // Validate required fields
    if (!category || !key) {
      throw new VibeKitValidationError('Category and key are required');
    }

    // Initialize config manager if needed
    await Config.initialize();

    // Validate the configuration value
    const configKey = `${category}.${key}`;
    const validation = Config.validateValue(configKey, value);

    logUtils.requestComplete(timer, 200, requestId);

    return NextResponse.json({
      success: true,
      data: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        category,
        key,
        value
      },
      requestId
    });

  } catch (error) {
    logUtils.requestComplete(timer, 400, requestId);
    return ErrorResponse.create(error, requestId);
  }
}