import { NextRequest, NextResponse } from "next/server";
import { getDesktopSandboxService } from "@/lib/services/desktop-sandbox";

export async function POST(request: NextRequest) {
  try {
    const { sandboxId, text } = await request.json();

    if (!sandboxId || !text) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const desktopService = getDesktopSandboxService();
    await desktopService.sendKeyboardInput(sandboxId, text);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/desktop/type] Error:", error);
    return NextResponse.json(
      { error: "Failed to send keyboard input", details: error.message },
      { status: 500 }
    );
  }
}