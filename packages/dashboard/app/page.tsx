"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AnalyticsSession, AnalyticsSummary } from "@/lib/types";

// Define proper types for Recharts tooltip
interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}
import { Loader } from "lucide-react";

// Custom tooltip component that respects theme
const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  const getAgentDisplayName = (agentKey: string) => {
    const displayNames: Record<string, string> = {
      claude: "claude-code",
      gemini: "gemini-cli",
    };
    return displayNames[agentKey.toLowerCase()] || agentKey;
  };

  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-md p-3 shadow-lg">
        <p className="text-foreground font-medium mb-2">{label}</p>
        {payload.map((entry: TooltipPayload, index: number) => (
          <p key={index} className="text-xs text-foreground flex items-center gap-2">
            <span 
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs font-medium">{getAgentDisplayName(entry.dataKey)}:</span>{' '}
            <span className="text-xs font-medium">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Utility functions moved here to avoid Node.js dependencies in client
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export default function Dashboard() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentSessions, setRecentSessions] = useState<AnalyticsSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // Fetch summary data
        const summaryResponse = await fetch("/api/analytics/summary?days=7");
        if (!summaryResponse.ok) throw new Error("Failed to fetch summary");
        const summaryData = await summaryResponse.json();
        setSummary(summaryData);

        // Fetch recent sessions
        const sessionsResponse = await fetch("/api/analytics?days=7");
        if (!sessionsResponse.ok) throw new Error("Failed to fetch sessions");
        const sessionsData = await sessionsResponse.json();
        setRecentSessions(sessionsData.slice(0, 10)); // Last 10 sessions
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
    // Set up auto-refresh every 20 seconds
    const interval = setInterval(fetchData, 20000);
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center flex items-center gap-2 justify-center">
          <Loader className="animate-spin size-4 text-primary" />
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-destructive mb-2">Error</h2>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">No Data Available</h2>
          <p className="text-muted-foreground">
            No analytics data found. Run some Vibekit sessions first!
          </p>
        </div>
      </div>
    );
  }

  // Generate time series data from recent sessions
  const generateTimeSeriesData = () => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    type DayData = { date: string; [key: string]: string | number };
    const last7Days: DayData[] = [];

    // Create data structure for last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayName = days[date.getDay()];

      last7Days.push({
        date: dayName,
        claude: 0,
        gemini: 0,
        codex: 0,
        grok: 0,
        opencode: 0,
        ...Object.keys(summary.agentBreakdown).reduce((acc, agent) => {
          acc[agent.toLowerCase()] = 0;
          return acc;
        }, {} as Record<string, number>),
      });
    }

    // Populate with actual session data
    recentSessions.forEach((session) => {
      const sessionDate = new Date(session.startTime);
      const daysDiff = Math.floor(
        (today.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff >= 0 && daysDiff < 7) {
        const dayIndex = 6 - daysDiff;
        const agentKey = session.agentName.toLowerCase();
        if (
          last7Days[dayIndex] &&
          last7Days[dayIndex].hasOwnProperty(agentKey)
        ) {
          const currentValue = last7Days[dayIndex][agentKey];
          last7Days[dayIndex][agentKey] =
            (typeof currentValue === "number" ? currentValue : 0) + 1;
        }
      }
    });

    return last7Days;
  };

  const timeSeriesData = generateTimeSeriesData();

  return (
    <div className="px-6 space-y-6">
      <div className="-mx-6 px-4 border-b flex h-12 items-center">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <h1 className="text-lg font-bold">Usage</h1>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase">
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary.activeSessions}</div>
            <p className="text-xs text-muted-foreground">
              Currently running
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase">
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalSessions}</div>
            <p className="text-xs text-muted-foreground">
              Coding agent sessions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.successRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Sessions completed successfully
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase">
              Average Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(summary.averageDuration)}
            </div>
            <p className="text-xs text-muted-foreground">Per session</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium uppercase">Sessions Over Time</CardTitle>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-muted-foreground">
                {summary.activeSessions} active
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={timeSeriesData}>
              <defs>
                {Object.keys(summary.agentBreakdown).map((agent, index) => {
                  const getAgentColor = (agentName: string, fallbackIndex: number) => {
                    const agentColors: Record<string, string> = {
                      claude: "#ff6b35", // Orange color for Claude
                      gemini: "#4285f4", // Google blue for Gemini
                    };
                    if (agentColors[agentName.toLowerCase()]) {
                      return agentColors[agentName.toLowerCase()];
                    }
                    const fallbackColors = [
                      "#8884d8",
                      "#82ca9d", 
                      "#ffc658",
                      "#ff7c7c",
                      "#8dd1e1",
                      "#d084d0",
                    ];
                    return fallbackColors[fallbackIndex % fallbackColors.length];
                  };
                  const color = getAgentColor(agent, index);
                  return (
                    <linearGradient
                      key={agent}
                      id={`color${agent}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={1} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {Object.keys(summary.agentBreakdown).map((agent, index) => {
                const getAgentColor = (agentName: string, fallbackIndex: number) => {
                  const agentColors: Record<string, string> = {
                    claude: "#ff6b35", // Orange color for Claude
                    gemini: "#4285f4", // Google blue for Gemini
                  };
                  if (agentColors[agentName.toLowerCase()]) {
                    return agentColors[agentName.toLowerCase()];
                  }
                  const fallbackColors = [
                    "#8884d8",
                    "#82ca9d", 
                    "#ffc658",
                    "#ff7c7c",
                    "#8dd1e1",
                    "#d084d0",
                  ];
                  return fallbackColors[fallbackIndex % fallbackColors.length];
                };
                const color = getAgentColor(agent, index);
                return (
                  <Area
                    key={agent}
                    type="monotone"
                    dataKey={agent.toLowerCase()}
                    stackId="1"
                    stroke={color}
                    fill={`url(#color${agent})`}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-sm font-medium uppercase">Agent</TableHead>
                <TableHead className="text-sm font-medium uppercase">Status</TableHead>
                <TableHead className="text-sm font-medium uppercase">Mode</TableHead>
                <TableHead className="text-sm font-medium uppercase">Duration</TableHead>
                <TableHead className="text-sm font-medium uppercase">Files Changed</TableHead>
                <TableHead className="text-sm font-medium uppercase">Project</TableHead>
                <TableHead className="text-sm font-medium uppercase">Git</TableHead>
                <TableHead className="text-sm font-medium uppercase">Hostname</TableHead>
                <TableHead className="text-sm font-medium uppercase">Start Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSessions.map((session, index) => (
                <TableRow key={`${session.sessionId}-${session.startTime}-${index}`}>
                  <TableCell>
                    <Badge variant="outline" className="flex items-center gap-1.5">
                      {session.agentName.toLowerCase() === 'claude' && (
                        <img
                          src="/claude-color.png"
                          alt="Claude"
                          className="w-3 h-3"
                        />
                      )}
                      {session.agentName.toLowerCase() === 'gemini' && (
                        <img
                          src="/gemini-color.png"
                          alt="Gemini"
                          className="w-3 h-3"
                        />
                      )}
                      <span className="text-sm font-medium">
                        {(() => {
                          const displayNames: Record<string, string> = {
                            claude: "claude-code",
                            gemini: "gemini-cli",
                          };
                          return displayNames[session.agentName.toLowerCase()] || session.agentName;
                        })()}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={session.status === 'active' ? 'default' : 'secondary'}
                      className={`text-sm ${session.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' : ''}`}
                    >
                      {session.status || 'terminated'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={session.executionMode === 'sandbox' ? 'default' : 'outline'}
                      className={`text-sm ${session.executionMode === 'sandbox' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}`}
                    >
                      {session.executionMode || 'local'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDuration(session.duration || 0)}</TableCell>
                  <TableCell>{session.filesChanged.length}</TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {session.systemInfo?.projectName || 'Unknown'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">
                      {session.systemInfo?.gitBranch || 'No git'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">
                      {session.systemInfo?.hostname || 'Unknown'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(session.startTime).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
