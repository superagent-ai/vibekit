export interface AuthStatus {
  method: 'oauth' | 'apikey' | null;
  isAuthenticated: boolean;
}

export abstract class BaseProvider {
  abstract initialize(): Promise<void>;
  abstract getClient(): Promise<any>;
  abstract getAuthStatus(): AuthStatus;
}