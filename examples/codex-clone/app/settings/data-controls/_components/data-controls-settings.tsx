"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useGitHubAuth } from "@/hooks/use-github-auth";
import { Github, Check, ExternalLink, AlertCircle, RefreshCw, Activity } from "lucide-react";

interface RateLimitData {
  resources: {
    core: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
      resource: string;
    };
    graphql: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
      resource: string;
    };
    integration_manifest: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
      resource: string;
    };
    search: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
      resource: string;
    };
  };
  rate: {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
    resource: string;
  };
}

export default function DataControlsSettings() {
  const { isAuthenticated, user, signOut } = useGitHubAuth();
  const [rateLimitData, setRateLimitData] = useState<RateLimitData | null>(null);
  const [isLoadingRateLimit, setIsLoadingRateLimit] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  const fetchRateLimit = async () => {
    if (!isAuthenticated) return;
    
    setIsLoadingRateLimit(true);
    setRateLimitError(null);
    
    try {
      const response = await fetch('/api/auth/github/rate-limit');
      if (!response.ok) {
        throw new Error(`Failed to fetch rate limit: ${response.statusText}`);
      }
      const data = await response.json();
      setRateLimitData(data);
    } catch (error) {
      setRateLimitError(error instanceof Error ? error.message : 'Failed to fetch rate limit');
    } finally {
      setIsLoadingRateLimit(false);
    }
  };

  const formatResetTime = (resetTimestamp: number) => {
    const resetDate = new Date(resetTimestamp * 1000);
    const now = new Date();
    const diffMinutes = Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60));
    
    if (diffMinutes <= 0) {
      return 'Now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
  };

  // Fetch rate limit data on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchRateLimit();
    }
  }, [isAuthenticated]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Data controls</h2>
        <p className="text-muted-foreground">
          Manage your external data connections and integrations.
        </p>
      </div>

      {/* GitHub Integration */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium mb-2">GitHub Integration</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your GitHub account to access repositories and create pull requests.
          </p>
        </div>
        
        <div className="border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Github className="h-6 w-6" />
              </div>
              <div>
                <div className="font-medium flex items-center gap-2">
                  GitHub
                  {isAuthenticated && (
                    <div className="flex items-center gap-1 text-green-600">
                      <Check className="h-4 w-4" />
                      <span className="text-sm">Connected</span>
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {isAuthenticated 
                    ? `Connected as ${user?.login || 'GitHub User'}`
                    : 'Access your repositories and create pull requests'
                  }
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <a 
                      href={`https://github.com/${user?.login}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Profile
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={signOut}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button asChild>
                  <a href="/api/auth/github/url">
                    Connect GitHub
                  </a>
                </Button>
              )}
            </div>
          </div>
          
          {isAuthenticated && (
            <div className="mt-6 pt-6 border-t">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Account Type</div>
                  <div className="font-medium">{user?.type || 'User'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Public Repositories</div>
                  <div className="font-medium">{user?.public_repos || 0}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GitHub Rate Limits */}
      {isAuthenticated && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium mb-2">GitHub API Rate Limits</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Monitor your GitHub API usage and rate limit status.
            </p>
          </div>
          
          <div className="border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                <span className="font-medium">API Usage Status</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchRateLimit}
                disabled={isLoadingRateLimit}
              >
                {isLoadingRateLimit ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
            
            {rateLimitError && (
              <div className="text-sm text-red-600 mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                {rateLimitError}
              </div>
            )}
            
            {rateLimitData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {/* Core API */}
                  <div className="border rounded-md p-4">
                    <div className="font-medium mb-2">Core API</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Used:</span>
                        <span>{rateLimitData.resources.core.used} / {rateLimitData.resources.core.limit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remaining:</span>
                        <span className={rateLimitData.resources.core.remaining < 10 ? 'text-red-600' : 'text-green-600'}>
                          {rateLimitData.resources.core.remaining}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Resets in:</span>
                        <span>{formatResetTime(rateLimitData.resources.core.reset)}</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            rateLimitData.resources.core.remaining < 10 ? 'bg-red-500' :
                            rateLimitData.resources.core.remaining < 30 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ 
                            width: `${(rateLimitData.resources.core.remaining / rateLimitData.resources.core.limit) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Search API */}
                  <div className="border rounded-md p-4">
                    <div className="font-medium mb-2">Search API</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Used:</span>
                        <span>{rateLimitData.resources.search.used} / {rateLimitData.resources.search.limit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remaining:</span>
                        <span className={rateLimitData.resources.search.remaining < 2 ? 'text-red-600' : 'text-green-600'}>
                          {rateLimitData.resources.search.remaining}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Resets in:</span>
                        <span>{formatResetTime(rateLimitData.resources.search.reset)}</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            rateLimitData.resources.search.remaining < 2 ? 'bg-red-500' :
                            rateLimitData.resources.search.remaining < 5 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ 
                            width: `${(rateLimitData.resources.search.remaining / rateLimitData.resources.search.limit) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* GraphQL API */}
                  <div className="border rounded-md p-4">
                    <div className="font-medium mb-2">GraphQL API</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Used:</span>
                        <span>{rateLimitData.resources.graphql.used} / {rateLimitData.resources.graphql.limit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remaining:</span>
                        <span className={rateLimitData.resources.graphql.remaining < 10 ? 'text-red-600' : 'text-green-600'}>
                          {rateLimitData.resources.graphql.remaining}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Resets in:</span>
                        <span>{formatResetTime(rateLimitData.resources.graphql.reset)}</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            rateLimitData.resources.graphql.remaining < 10 ? 'bg-red-500' :
                            rateLimitData.resources.graphql.remaining < 30 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ 
                            width: `${(rateLimitData.resources.graphql.remaining / rateLimitData.resources.graphql.limit) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                {(rateLimitData.resources.core.remaining < 10 || rateLimitData.resources.search.remaining < 2) && (
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-yellow-800 dark:text-yellow-200">Rate Limit Warning</div>
                      <div className="text-yellow-700 dark:text-yellow-300">
                        You&apos;re approaching your GitHub API rate limits. Some features may be temporarily unavailable.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <div>Click &quot;Refresh&quot; to check your current rate limit status</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Usage */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium mb-2">Data Usage</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Monitor how your data is being used and processed.
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Repository Access</div>
                <div className="text-sm text-muted-foreground">
                  Read access to your public and private repositories
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {isAuthenticated ? 'Active' : 'Not connected'}
              </div>
            </div>
          </div>
          
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Code Analysis</div>
                <div className="text-sm text-muted-foreground">
                  Analyze code structure and dependencies
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {isAuthenticated ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>
          
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Pull Request Creation</div>
                <div className="text-sm text-muted-foreground">
                  Create pull requests with generated changes
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {isAuthenticated ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="border rounded-lg p-4 bg-muted/50">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="text-sm">
            <div className="font-medium mb-1">Privacy Notice</div>
            <div className="text-muted-foreground">
              Your code and repository data is processed securely and is never stored permanently. 
              All operations are performed with your explicit consent and can be revoked at any time.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}