let Sentry: typeof import("@sentry/nextjs") | undefined;

const loadSentry = async () => {
  try {
    Sentry = await import("@sentry/nextjs");
  } catch {
    console.log("Sentry not installed, error tracking disabled");
  }
};

export async function initErrorTracking() {
  await loadSentry();
  
  if (!Sentry) {
    return;
  }

  const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
  
  if (!SENTRY_DSN) {
    console.log("Sentry DSN not configured, error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Set sample rates
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    
    // Set environments
    environment: process.env.NODE_ENV,
    
    // Integrations
    integrations: [
      new Sentry.BrowserTracing(),
    ],
    
    // Filter out certain errors
    beforeSend(event, hint) {
      // Filter out network errors for certain domains
      if (event.exception) {
        const error = hint.originalException;
        
        // Ignore certain errors
        if (error && error.message) {
          const ignoredMessages = [
            "ResizeObserver loop limit exceeded",
            "ResizeObserver loop completed with undelivered notifications",
            "Non-Error promise rejection captured",
          ];
          
          if (ignoredMessages.some(msg => error.message.includes(msg))) {
            return null;
          }
        }
      }
      
      return event;
    },
  });
}

export function captureError(error: Error, context?: Record<string, any>) {
  console.error("Error captured:", error);
  
  if (typeof window !== "undefined" && Sentry && Sentry.captureException) {
    Sentry.captureException(error, {
      extra: context,
    });
  }
}

export function captureMessage(message: string, level: string = "info") {
  if (typeof window !== "undefined" && Sentry && Sentry.captureMessage) {
    Sentry.captureMessage(message, level);
  }
}

export function setUserContext(user: { id?: string; email?: string; username?: string }) {
  if (typeof window !== "undefined" && Sentry && Sentry.setUser) {
    Sentry.setUser(user);
  }
}

export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: string;
  data?: Record<string, any>;
}) {
  if (typeof window !== "undefined" && Sentry && Sentry.addBreadcrumb) {
    Sentry.addBreadcrumb(breadcrumb);
  }
}