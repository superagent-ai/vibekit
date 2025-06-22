import { NextRequest, NextResponse } from "next/server";
import { getDesktopSandboxService } from "@/lib/services/desktop-sandbox";

export async function POST(request: NextRequest) {
  try {
    const { sandboxId } = await request.json();

    if (!sandboxId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const desktopService = getDesktopSandboxService();
    const screenshot = await desktopService.captureScreenshot(sandboxId);

    return NextResponse.json({ success: true, screenshot });
  } catch (error) {
    console.error("[/api/desktop/screenshot] Error:", error);
    return NextResponse.json(
      { error: "Failed to capture screenshot", details: error.message },
      { status: 500 }
    );
  }
}