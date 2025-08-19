"use client";

import { useEffect, useState } from "react";
import { 
  BarChart3, 
  Clock, 
  User, 
  Calendar,
  TrendingUp,
  Activity,
  Loader
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import type { AnalyticsSession, AnalyticsSummary } from "@/lib/types";

interface ProjectAnalyticsProps {
  projectId: string;
  projectName: string;
}

export function ProjectAnalytics({ projectId, projectName }: ProjectAnalyticsProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentSessions, setRecentSessions] = useState<AnalyticsSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDays, setFilterDays] = useState(7);

  // Fetch analytics data for this specific project
  const fetchAnalytics = async (days: number) => {
    try {
      setLoading(true);
      
      // Fetch summary data filtered by project
      const summaryResponse = await fetch(
        `/api/analytics/summary?days=${days}&projectId=${encodeURIComponent(projectId)}`
      );
      if (!summaryResponse.ok) throw new Error("Failed to fetch summary");
      const summaryData = await summaryResponse.json();

      // Fetch sessions filtered by project
      const sessionsResponse = await fetch(
        `/api/analytics?days=${days}&projectId=${encodeURIComponent(projectId)}`
      );
      if (!sessionsResponse.ok) throw new Error("Failed to fetch sessions");
      const sessionsData = await sessionsResponse.json();

      setSummary(summaryData);
      setRecentSessions(sessionsData);
    } catch (error) {
      console.error("Failed to fetch project analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(filterDays);
  }, [filterDays, projectId]);

  // Helper function to get agent color
  const getAgentColor = (agent: string) => {
    const colors = {
      claude: "#8B5CF6",
      openai: "#10B981", 
      codex: "#10B981",
      gemini: "#F59E0B",
      grok: "#3B82F6",
      opencode: "#EF4444"
    };
    return colors[agent.toLowerCase() as keyof typeof colors] || "#6B7280";
  };

  // Prepare chart data for session trends
  const getChartData = () => {
    if (!recentSessions?.length) return [];

    const today = new Date();
    const timeSeriesDays: any[] = [];

    // Create array of days
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

    // Get all unique agents
    const allAgents = new Set<string>();
    sessionsByDate.forEach((dayData) => {
      Object.keys(dayData).forEach((agent) => allAgents.add(agent));
    });

    // Merge data
    timeSeriesDays.forEach((dayData) => {
      const sessionsForDay = sessionsByDate.get(dayData.date) || {};
      
      allAgents.forEach((agent) => {
        dayData[agent] = 0;
      });

      Object.assign(dayData, sessionsForDay);
    });

    return timeSeriesDays;
  };

  const chartData = getChartData();
  const uniqueAgents = Array.from(new Set(recentSessions?.map(s => s.agentName.toLowerCase()) || []));

  // Get agent usage statistics
  const getAgentStats = () => {
    if (!recentSessions?.length) return [];

    const agentCounts = recentSessions.reduce((acc, session) => {
      const agent = session.agentName.toLowerCase();
      acc[agent] = (acc[agent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(agentCounts)
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count);
  };

  const agentStats = getAgentStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center flex items-center gap-2 justify-center">
          <Loader className="animate-spin size-4 text-primary" />
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!summary || !recentSessions?.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Project Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Usage analytics for {projectName}
            </p>
          </div>
          <Select value={filterDays.toString()} onValueChange={(value) => setFilterDays(parseInt(value))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Analytics Data</h3>
            <p className="text-muted-foreground text-center max-w-md">
              No agent sessions found for this project in the last {filterDays} days. 
              Run some coding sessions to see analytics here!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Project Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Usage analytics for {projectName} - Last {filterDays} days
          </p>
        </div>
        <Select value={filterDays.toString()} onValueChange={(value) => setFilterDays(parseInt(value))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalSessions}</div>
            <p className="text-xs text-muted-foreground">
              {summary.totalDuration ? `${Math.round(summary.totalDuration / 60)} min total` : "No execution time"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Session Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.averageDuration ? `${Math.round(summary.averageDuration / 60)}m` : "0m"}
            </div>
            <p className="text-xs text-muted-foreground">
              Per session average
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Used Agent</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {agentStats[0]?.agent || "None"}
            </div>
            <p className="text-xs text-muted-foreground">
              {agentStats[0]?.count || 0} sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.successRate ? `${Math.round(summary.successRate * 100)}%` : "0%"}
            </div>
            <p className="text-xs text-muted-foreground">
              Successful executions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Session Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Session Activity</CardTitle>
            <CardDescription>Daily session count by agent</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                {uniqueAgents.map((agent) => (
                  <Area
                    key={agent}
                    type="monotone"
                    dataKey={agent}
                    stackId="1"
                    stroke={getAgentColor(agent)}
                    fill={getAgentColor(agent)}
                    fillOpacity={0.6}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Agent Usage Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Agent Usage</CardTitle>
            <CardDescription>Sessions by agent type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agentStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="agent" />
                <YAxis />
                <Tooltip />
                <Bar 
                  dataKey="count" 
                  fill="#8B5CF6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
          <CardDescription>
            Latest {Math.min(10, recentSessions.length)} sessions for this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSessions.slice(0, 10).map((session) => (
                  <TableRow key={session.sessionId}>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        style={{ 
                          borderColor: getAgentColor(session.agentName),
                          color: getAgentColor(session.agentName)
                        }}
                      >
                        {session.agentName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(session.startTime).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {session.duration ? `${Math.round(session.duration / 60)}m` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={session.exitCode === 0 ? "default" : "destructive"}
                      >
                        {session.exitCode === 0 ? "Success" : "Failed"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}