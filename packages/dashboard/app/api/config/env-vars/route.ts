import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/config/env-vars
 * Check if specific environment variables exist (returns boolean, not values for security)
 */
export async function POST(request: NextRequest) {
  try {
    const { keys } = await request.json();
    
    if (!Array.isArray(keys)) {
      return NextResponse.json(
        { success: false, error: 'Keys must be an array' },
        { status: 400 }
      );
    }

    // Check which environment variables exist (but don't return their values)
    const existing: Record<string, boolean> = {};
    
    keys.forEach((key: string) => {
      // Only check for reasonable-looking environment variable names
      if (typeof key === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(key)) {
        existing[key] = Boolean(process.env[key] && process.env[key].trim().length > 0);
      }
    });

    return NextResponse.json({
      success: true,
      existing
    });
  } catch (error) {
    console.error('Failed to check environment variables:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check environment variables' },
      { status: 500 }
    );
  }
}