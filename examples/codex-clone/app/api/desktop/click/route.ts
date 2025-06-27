import { NextRequest, NextResponse } from "next/server";
import { getDesktopSandboxService } from "@/lib/services/desktop-sandbox";

export async function POST(request: NextRequest) {
  try {
    const { sandboxId, x, y, button } = await request.json();

    if (!sandboxId || x === undefined || y === undefined) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const desktopService = getDesktopSandboxService();
    await desktopService.sendMouseClick(sandboxId, x, y, button);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/desktop/click] Error:", error);
    return NextResponse.json(
      { error: "Failed to send click", details: error.message },
      { status: 500 }
    );
  }
}