"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
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
import type { AnalyticsSession, AnalyticsSummary, Project } from "@/lib/types";
import { useRouter } from "next/navigation";

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
      cursor: "cursor",
      opencode: "opencode",
    };
    return displayNames[agentKey.toLowerCase()] || agentKey;
  };

  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-md p-3 shadow-lg">
        <p className="text-foreground font-medium mb-2">{label}</p>
        {payload.map((entry: TooltipPayload, index: number) => (
          <p
            key={index}
            className="text-xs text-foreground flex items-center gap-2"
          >
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs font-medium">
              {getAgentDisplayName(entry.dataKey)}:
            </span>{" "}
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
  const router = useRouter();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentSessions, setRecentSessions] = useState<AnalyticsSession[]>([]);
  const [allSessions, setAllSessions] = useState<AnalyticsSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>("7d");
  const [checkingRedirect, setCheckingRedirect] = useState(true);
  const sessionsPerPage = 10;

  const timeFilters = [
    { label: "Today", value: "1d", days: 1 },
    { label: "7 Days", value: "7d", days: 7 },
    { label: "2 Weeks", value: "14d", days: 14 },
    { label: "1 Month", value: "30d", days: 30 },
    { label: "3 Months", value: "90d", days: 90 },
  ];

  // Check for redirect on initial load
  useEffect(() => {
    async function checkRedirect() {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const settings = await response.json();
          const defaultPage = settings.dashboard?.defaultPage || 'analytics';
          
          // If default page is not analytics, redirect
          if (defaultPage !== 'analytics') {
            const routeMap: Record<string, string> = {
              'projects-cards': '/projects',
              'projects-table': '/projects?view=table',
              'chat': '/chat',
              'monitoring': '/monitoring'
            };
            
            const targetRoute = routeMap[defaultPage];
            if (targetRoute) {
              router.replace(targetRoute);
              return; // Don't continue with loading
            }
          }
        }
      } catch (error) {
        console.error("Failed to check default page setting:", error);
      }
      setCheckingRedirect(false);
    }

    checkRedirect();
  }, [router]);

  useEffect(() => {
    // Only fetch data if we're not redirecting
    if (checkingRedirect) return;

    async function fetchData() {
      try {
        setLoading(true);

        const selectedFilterData = timeFilters.find(
          (f) => f.value === selectedFilter
        );
        const days = selectedFilterData?.days || 7;

        // Fetch projects data
        const projectsResponse = await fetch("/api/projects");
        if (projectsResponse.ok) {
          const projectsData = await projectsResponse.json();
          setProjects(projectsData.data || []);
        }

        // Fetch summary data
        const summaryResponse = await fetch(
          `/api/analytics/summary?days=${days}`
        );
        if (!summaryResponse.ok) throw new Error("Failed to fetch summary");
        const summaryData = await summaryResponse.json();
        setSummary(summaryData);

        // Fetch all sessions
        const sessionsResponse = await fetch(`/api/analytics?days=${days}`);
        if (!sessionsResponse.ok) throw new Error("Failed to fetch sessions");
        const sessionsData = await sessionsResponse.json();
        setAllSessions(sessionsData);
        setRecentSessions(sessionsData);
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
  }, [selectedFilter, checkingRedirect]);

  if (checkingRedirect || loading) {
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
    const today = new Date();
    type DayData = { date: string; [key: string]: string | number };
    const selectedFilterData = timeFilters.find(
      (f) => f.value === selectedFilter
    );
    const filterDays = selectedFilterData?.days || 7;
    const timeSeriesDays: DayData[] = [];

    // Create data structure for selected time period with actual dates
    for (let i = filterDays - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

      timeSeriesDays.push({
        date: dateStr,
      });
    }

    // Group sessions by date
    const sessionsByDate = new Map<string, Record<string, number>>();

    recentSessions.forEach((session) => {
      const sessionDate = new Date(session.startTime);
      const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}`;

      // Check if this date is within our selected time window
      const daysDiff = Math.floor(
        (today.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff >= 0 && daysDiff < filterDays) {
        if (!sessionsByDate.has(dateStr)) {
          sessionsByDate.set(dateStr, {});
        }

        const agentKey = session.agentName.toLowerCase();
        const dayData = sessionsByDate.get(dateStr)!;
        dayData[agentKey] = (dayData[agentKey] || 0) + 1;
      }
    });

    // Get all unique agents across all days
    const allAgents = new Set<string>();
    sessionsByDate.forEach((dayData) => {
      Object.keys(dayData).forEach((agent) => allAgents.add(agent));
    });

    // Merge the session data with our date structure, ensuring all agents have values for all days
    timeSeriesDays.forEach((dayData) => {
      const sessionsForDay = sessionsByDate.get(dayData.date) || {};

      // Initialize all agents to 0 for this day
      allAgents.forEach((agent) => {
        dayData[agent] = 0;
      });

      // Override with actual session counts
      Object.assign(dayData, sessionsForDay);
    });

    return timeSeriesDays;
  };

  const timeSeriesData = generateTimeSeriesData();

  // Get all unique agents from the chart data (not just summary breakdown)
  const allAgentsInData = new Set<string>();
  timeSeriesData.forEach((dayData) => {
    Object.keys(dayData).forEach((key) => {
      if (key !== "date" && typeof dayData[key] === "number") {
        allAgentsInData.add(key);
      }
    });
  });
  const agentsToRender = Array.from(allAgentsInData);

  // Helper function to get project name and id
  const getProjectInfo = (session: AnalyticsSession) => {
    // First try to find project by projectId
    if (session.projectId) {
      const project = projects.find(p => p.id === session.projectId);
      if (project) {
        return { id: project.id, name: project.name };
      }
    }
    
    // Fallback to session.projectName or systemInfo.projectName
    const projectName = session.projectName || session.systemInfo?.projectName;
    if (projectName) {
      // Try to find project by name
      const project = projects.find(p => p.name === projectName);
      if (project) {
        return { id: project.id, name: project.name };
      }
      // Return name without id if project not found in projects list
      return { id: null, name: projectName };
    }
    
    return { id: null, name: "Unknown" };
  };

  return (
    <div className="px-6 space-y-6">
      <div className="-mx-6 px-4 border-b flex h-12 items-center">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <h1 className="text-lg font-bold">Usage</h1>
        </div>
      </div>

      {/* Time Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {timeFilters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setSelectedFilter(filter.value)}
            className={`px-2 py-1 text-sm font-medium rounded-md border transition-colors ${
              selectedFilter === filter.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}
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
            <div className="text-2xl font-bold text-green-600">
              {summary.activeSessions}
            </div>
            <p className="text-xs text-muted-foreground">Currently running</p>
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
            <CardTitle className="text-sm font-medium uppercase">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(summary.successRate * 100)}%
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
            <CardTitle className="text-sm font-medium uppercase">
              Sessions Over Time
            </CardTitle>
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
            <LineChart data={timeSeriesData}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-muted"
                opacity={1}
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                interval={(() => {
                  const selectedFilterData = timeFilters.find(
                    (f) => f.value === selectedFilter
                  );
                  const filterDays = selectedFilterData?.days || 7;
                  // Show fewer ticks for longer time periods
                  if (filterDays <= 7) return 0; // Show all ticks for 7 days or less
                  if (filterDays <= 14) return 1; // Show every other tick for 2 weeks
                  if (filterDays <= 30) return 4; // Show every 5th tick for 1 month
                  return 6; // Show every 7th tick for 3 months
                })()}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {agentsToRender.map((agent, index) => {
                const getAgentColor = (
                  agentName: string,
                  fallbackIndex: number
                ) => {
                  const agentColors: Record<string, string> = {
                    claude: "#ff6b35", // Orange color for Claude
                    gemini: "#4285f4", // Google blue for Gemini
                    codex: "#6b7280", // Grey color for Codex (works in light/dark)
                    cursor: "#374151", // Dark grey/black-ish color for Cursor (works in light/dark)
                    opencode: "#333333", // Dark black color for OpenCode
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
                  <Line
                    key={agent}
                    type="monotone"
                    dataKey={agent.toLowerCase()}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sessions Table with Pagination */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium uppercase">
              All Sessions
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              Total: {allSessions.length} sessions
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-sm font-medium uppercase">
                  Agent
                </TableHead>
                <TableHead className="text-sm font-medium uppercase">
                  Status
                </TableHead>
                <TableHead className="text-sm font-medium uppercase">
                  Mode
                </TableHead>
                <TableHead className="text-sm font-medium uppercase">
                  Duration
                </TableHead>
                <TableHead className="text-sm font-medium uppercase">
                  Files Changed
                </TableHead>
                <TableHead className="text-sm font-medium uppercase">
                  Project
                </TableHead>
                <TableHead className="text-sm font-medium uppercase">
                  Git
                </TableHead>
                <TableHead className="text-sm font-medium uppercase">
                  Hostname
                </TableHead>
                <TableHead className="text-sm font-medium uppercase">
                  Start Time
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const indexOfLastSession = currentPage * sessionsPerPage;
                const indexOfFirstSession =
                  indexOfLastSession - sessionsPerPage;
                const currentSessions = allSessions.slice(
                  indexOfFirstSession,
                  indexOfLastSession
                );

                return currentSessions.map((session, index) => (
                  <TableRow
                    key={`${session.sessionId}-${session.startTime}-${index}`}
                  >
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1.5"
                      >
                        {session.agentName.toLowerCase() === "claude" && (
                          <Image
                            src="/claude-color.png"
                            alt="Claude"
                            width={12}
                            height={12}
                            className="w-3 h-3"
                          />
                        )}
                        {session.agentName.toLowerCase() === "gemini" && (
                          <Image
                            src="/gemini-color.png"
                            alt="Gemini"
                            width={12}
                            height={12}
                            className="w-3 h-3"
                          />
                        )}
                        {session.agentName.toLowerCase() === "codex" && (
                          <Image
                            src="/codex.svg"
                            alt="Codex"
                            width={12}
                            height={12}
                            className="w-3 h-3 dark:invert"
                          />
                        )}
                        {session.agentName.toLowerCase() === "cursor" && (
                          <Image
                            src="/cursor.svg"
                            alt="Cursor"
                            width={12}
                            height={12}
                            className="w-3 h-3"
                          />
                        )}
                        {session.agentName.toLowerCase() === "opencode" && (
                          <Image
                            src="/opencode.webp"
                            alt="OpenCode"
                            width={12}
                            height={12}
                            className="w-3 h-3"
                          />
                        )}
                        <span className="text-sm font-medium">
                          {(() => {
                            const displayNames: Record<string, string> = {
                              claude: "claude-code",
                              gemini: "gemini-cli",
                              codex: "codex",
                              cursor: "cursor",
                              opencode: "opencode",
                            };
                            return (
                              displayNames[session.agentName.toLowerCase()] ||
                              session.agentName
                            );
                          })()}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          session.status === "active" ? "default" : "secondary"
                        }
                        className={`text-sm ${
                          session.status === "active"
                            ? "bg-green-100 text-green-800 border-green-200"
                            : ""
                        }`}
                      >
                        {session.status || "terminated"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          session.executionMode === "sandbox"
                            ? "default"
                            : "outline"
                        }
                        className={`text-sm ${
                          session.executionMode === "sandbox"
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : ""
                        }`}
                      >
                        {session.executionMode || "local"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDuration(session.duration || 0)}
                    </TableCell>
                    <TableCell>{session.filesChanged.length}</TableCell>
                    <TableCell>
                      {(() => {
                        const projectInfo = getProjectInfo(session);
                        if (projectInfo.id) {
                          return (
                            <Link 
                              href={`/projects/${projectInfo.id}`}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              {projectInfo.name}
                            </Link>
                          );
                        }
                        return (
                          <span className="text-sm font-medium text-muted-foreground">
                            {projectInfo.name}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">
                        {session.systemInfo?.gitBranch || "No git"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">
                        {session.systemInfo?.hostname || "Unknown"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(session.startTime).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ));
              })()}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between space-x-2 py-4">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * sessionsPerPage + 1} to{" "}
              {Math.min(currentPage * sessionsPerPage, allSessions.length)} of{" "}
              {allSessions.length} sessions
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm font-medium rounded-md border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              {/* Page numbers */}
              <div className="flex space-x-1">
                {Array.from(
                  { length: Math.ceil(allSessions.length / sessionsPerPage) },
                  (_, i) => i + 1
                )
                  .filter((page) => {
                    // Show first page, last page, current page, and pages around current
                    const totalPages = Math.ceil(
                      allSessions.length / sessionsPerPage
                    );
                    if (page === 1 || page === totalPages) return true;
                    if (Math.abs(page - currentPage) <= 1) return true;
                    return false;
                  })
                  .map((page, index, array) => (
                    <React.Fragment key={page}>
                      {index > 0 && array[index - 1] < page - 1 && (
                        <span className="px-2 py-1 text-sm">...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1 text-sm font-medium rounded-md border ${
                          currentPage === page
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-accent"
                        }`}
                      >
                        {page}
                      </button>
                    </React.Fragment>
                  ))}
              </div>

              <button
                onClick={() =>
                  setCurrentPage((prev) =>
                    Math.min(
                      prev + 1,
                      Math.ceil(allSessions.length / sessionsPerPage)
                    )
                  )
                }
                disabled={
                  currentPage ===
                  Math.ceil(allSessions.length / sessionsPerPage)
                }
                className="px-3 py-1 text-sm font-medium rounded-md border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}