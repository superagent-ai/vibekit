import { NextRequest, NextResponse } from "next/server";
import { getDesktopSandboxService } from "@/lib/services/desktop-sandbox";

export async function POST(request: NextRequest) {
  try {
    const { sandboxId, key } = await request.json();

    if (!sandboxId || !key) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const desktopService = getDesktopSandboxService();
    await desktopService.sendKeyPress(sandboxId, key);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/desktop/key] Error:", error);
    return NextResponse.json(
      { error: "Failed to send key press", details: error.message },
      { status: 500 }
    );
  }
}