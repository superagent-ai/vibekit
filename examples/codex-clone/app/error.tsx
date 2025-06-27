'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
 
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
    
    // In production, you would send this to Sentry or another service
    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
      // Example: window.Sentry?.captureException(error)
    }
  }, [error])
 
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
      <h2 className="text-2xl font-bold">Something went wrong!</h2>
      <p className="text-muted-foreground">
        {process.env.NODE_ENV === 'production' 
          ? 'An unexpected error occurred. Please try again.'
          : error.message}
      </p>
      <Button
        onClick={() => reset()}
        variant="outline"
      >
        Try again
      </Button>
    </div>
  )
}