import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Query Inngest directly
    const response = await fetch('http://localhost:8288/v0/runs', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: `Inngest returned ${response.status}`,
        inngestRunning: false 
      });
    }
    
    const data = await response.json();
    const runs = data.data || [];
    
    // Group by function ID
    const functionGroups = {};
    runs.forEach(run => {
      const fnId = run.function_id || 'unknown';
      functionGroups[fnId] = (functionGroups[fnId] || 0) + 1;
    });
    
    return NextResponse.json({
      inngestRunning: true,
      totalRuns: runs.length,
      functionGroups,
      runs: runs.slice(0, 5).map(run => ({
        id: run.id,
        function_id: run.function_id,
        status: run.status,
        started_at: run.started_at,
        event_name: run.event?.name,
        task_id: run.event?.data?.task?.id,
        task_title: run.event?.data?.task?.title || run.event?.data?.prompt
      }))
    });
  } catch (error) {
    return NextResponse.json({ 
      error: error.message,
      inngestRunning: false,
      hint: "Make sure Inngest dev server is running: npx inngest-cli@latest dev"
    });
  }
}