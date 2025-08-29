'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#fafafa',
          padding: '20px'
        }}>
          <div style={{
            textAlign: 'center',
            maxWidth: '400px'
          }}>
            <h1 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '16px',
              color: '#171717'
            }}>
              Critical Error
            </h1>
            
            <p style={{
              fontSize: '14px',
              color: '#737373',
              marginBottom: '24px'
            }}>
              A critical error occurred in the application. Please refresh the page to continue.
            </p>
            
            <button
              onClick={() => reset()}
              style={{
                backgroundColor: '#171717',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                marginRight: '8px'
              }}
            >
              Try again
            </button>
            
            <button
              onClick={() => window.location.href = '/'}
              style={{
                backgroundColor: 'white',
                color: '#171717',
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #e5e5e5',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Go to Dashboard
            </button>
            
            {process.env.NODE_ENV === 'development' && (
              <div style={{
                marginTop: '32px',
                padding: '12px',
                backgroundColor: '#fef2f2',
                borderRadius: '6px',
                fontSize: '12px',
                textAlign: 'left',
                color: '#991b1b'
              }}>
                <strong>Development Info:</strong>
                <pre style={{ 
                  marginTop: '8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {error.message}
                </pre>
                {error.digest && (
                  <div style={{ marginTop: '8px' }}>
                    Error ID: {error.digest}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}