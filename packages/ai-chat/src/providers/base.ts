export interface AuthStatus {
  method: 'oauth' | 'apikey' | string | null;
  authenticated: boolean;
  isAuthenticated?: boolean; // For backward compatibility
}

export abstract class BaseProvider {
  abstract initialize(): Promise<void>;
  abstract getClient(): Promise<any>;
  abstract getAuthStatus(): AuthStatus;
}