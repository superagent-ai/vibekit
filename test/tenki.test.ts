import { describe, it, expect, vi, beforeEach } from "vitest";

// Module-level hooks the mock delegates to, so each test can shape behavior.
const hooks = {
  whoAmI: vi.fn(),
  create: vi.fn(),
};

vi.mock("@tenkicloud/sandbox", () => {
  class TenkiSandbox {
    constructor(_options?: unknown) {}
    whoAmI() {
      return hooks.whoAmI();
    }
    create(options: unknown) {
      return hooks.create(options);
    }
    get() {
      return hooks.create({});
    }
  }
  return {
    TenkiSandbox,
    isSuccess: (status: string) => status === "SUCCEEDED",
    stdoutText: () => "",
    stderrText: () => "",
  };
});

// Import from dist to exercise the built package (as the other tests do).
import { createTenkiProvider } from "../packages/tenki/dist/index.js";

const identity = {
  ownerType: "user",
  ownerId: "u1",
  workspaces: [{ id: "ws9", name: "ws", projects: [{ id: "proj9", name: "p" }] }],
};

describe("Tenki provider — lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.whoAmI.mockResolvedValue(identity);
  });

  it("tears down the sandbox when setup fails after create (no leak)", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    hooks.create.mockResolvedValue({
      id: "sb1",
      state: "RUNNING",
      exec: vi.fn().mockRejectedValue(new Error("install blew up")),
      close,
    });

    const provider = createTenkiProvider({ apiKey: "tk_x", installAgent: true });

    await expect(provider.create({}, "claude")).rejects.toThrow(/torn down/i);
    // The created VM must be closed rather than leaked.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("propagates teardown failures from kill() instead of reporting success", async () => {
    const close = vi.fn().mockRejectedValue(new Error("terminate failed"));
    hooks.create.mockResolvedValue({
      id: "sb1",
      state: "RUNNING",
      exec: vi.fn(),
      close,
    });

    const provider = createTenkiProvider({ apiKey: "tk_x", installAgent: false });
    const sandbox = await provider.create();

    await expect(sandbox.kill()).rejects.toThrow(/terminate failed/);
  });

  it("auto-resolves workspace/project from whoAmI when not configured", async () => {
    hooks.create.mockResolvedValue({
      id: "sb1",
      state: "RUNNING",
      exec: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    });

    const provider = createTenkiProvider({ apiKey: "tk_x", installAgent: false });
    await provider.create();

    expect(hooks.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws9", projectId: "proj9" })
    );
  });
});
