import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSprite: vi.fn(),
  getSprite: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
  deleteSprite: vi.fn(),
}));

vi.mock("@fly/sprites", () => {
  class MockExecError extends Error {
    constructor(
      message: string,
      public readonly result: {
        exitCode: number;
        stdout: string | Buffer;
        stderr: string | Buffer;
      }
    ) {
      super(message);
    }

    get exitCode() {
      return this.result.exitCode;
    }
    get stdout() {
      return this.result.stdout;
    }
    get stderr() {
      return this.result.stderr;
    }
  }

  class MockSpritesClient {
    createSprite = mocks.createSprite;
    getSprite = mocks.getSprite;
  }

  return {
    ExecError: MockExecError,
    Sprite: class {},
    SpriteCommand: class {},
    SpritesClient: MockSpritesClient,
  };
});

import { ExecError } from "@fly/sprites";
import {
  createFlyIOProvider,
  FlyIOSandboxProvider,
} from "../packages/flyio/dist/index.js";

function mockSprite(name = "vibekit-codex-test") {
  return {
    name,
    url: `https://${name}.sprites.app`,
    execFile: mocks.execFile,
    spawn: mocks.spawn,
    delete: mocks.deleteSprite,
  };
}

function mockBackgroundCommand() {
  const command = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
  };
  command.stdout = new PassThrough();
  command.stderr = new PassThrough();
  queueMicrotask(() => command.emit("spawn"));
  return command;
}

describe("Fly.io Sprites sandbox provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execFile.mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" });
    mocks.spawn.mockImplementation(mockBackgroundCommand);
    mocks.deleteSprite.mockResolvedValue(undefined);
    mocks.createSprite.mockResolvedValue(mockSprite());
    mocks.getSprite.mockImplementation(async (name: string) => mockSprite(name));
  });

  it("creates an agent-ready Sprite with authenticated URL access", async () => {
    const provider = createFlyIOProvider({ token: "test-token" });
    expect(provider).toBeInstanceOf(FlyIOSandboxProvider);

    const sandbox = await provider.create(
      { OPENAI_API_KEY: "test-key" },
      "codex",
      "/home/sprite/project"
    );

    expect(mocks.createSprite).toHaveBeenCalledWith(
      expect.stringMatching(/^vibekit-codex-/),
      expect.objectContaining({
        environment: { OPENAI_API_KEY: "test-key" },
        labels: ["vibekit"],
        runtime: "dev",
        urlSettings: { auth: "sprite" },
      })
    );
    expect(mocks.execFile).toHaveBeenCalledWith("mkdir", [
      "-p",
      "/home/sprite/project",
    ]);
    expect(sandbox.sandboxId).toBe("vibekit-codex-test");
  });

  it("runs shell commands and forwards output callbacks", async () => {
    const sandbox = await createFlyIOProvider({ token: "test-token" }).create();
    const onStdout = vi.fn();
    const onStderr = vi.fn();

    const result = await sandbox.commands.run("printf hello", {
      timeoutMs: 5000,
      onStdout,
      onStderr,
    });

    expect(mocks.execFile).toHaveBeenCalledWith(
      "bash",
      ["-lc", "printf hello"],
      { cwd: undefined, timeout: 5000 }
    );
    expect(result).toEqual({ exitCode: 0, stdout: "ok", stderr: "" });
    expect(onStdout).toHaveBeenCalledWith("ok");
    expect(onStderr).not.toHaveBeenCalled();
  });

  it("returns non-zero command results instead of throwing", async () => {
    mocks.execFile.mockRejectedValueOnce(
      new ExecError("failed", {
        exitCode: 42,
        stdout: Buffer.from("partial"),
        stderr: Buffer.from("failure"),
      })
    );
    const sandbox = await createFlyIOProvider({ token: "test-token" }).create();

    await expect(sandbox.commands.run("exit 42")).resolves.toEqual({
      exitCode: 42,
      stdout: "partial",
      stderr: "failure",
    });
  });

  it("starts background commands as detachable sessions", async () => {
    const sandbox = await createFlyIOProvider({ token: "test-token" }).create();

    await expect(
      sandbox.commands.run("node server.js", { background: true })
    ).resolves.toEqual({
      exitCode: 0,
      stdout: "Background command started successfully",
      stderr: "",
    });
    expect(mocks.spawn).toHaveBeenCalledWith(
      "bash",
      ["-lc", "node server.js"],
      { cwd: undefined, detachable: true }
    );
  });

  it("resumes and deletes Sprites by name", async () => {
    const provider = createFlyIOProvider({ token: "test-token" });
    const sandbox = await provider.resume("existing-sprite");

    expect(mocks.getSprite).toHaveBeenCalledWith("existing-sprite");
    expect(sandbox.sandboxId).toBe("existing-sprite");
    await sandbox.kill();
    expect(mocks.deleteSprite).toHaveBeenCalledOnce();
  });

  it("returns the Sprite URL for port 8080 and rejects misleading ports", async () => {
    const sandbox = await createFlyIOProvider({ token: "test-token" }).create();

    await expect(sandbox.getHost(8080)).resolves.toContain("sprites.app");
    await expect(sandbox.getHost(3000)).rejects.toThrow(
      "routed to port 8080 by default"
    );
    await expect(sandbox.getHost(0)).rejects.toThrow(
      "between 1 and 65535"
    );
  });

  it("deletes a partially created Sprite when setup fails", async () => {
    mocks.execFile.mockRejectedValueOnce(new Error("mkdir failed"));
    const provider = createFlyIOProvider({ token: "test-token" });

    await expect(
      provider.create({}, "claude", "/home/sprite/project")
    ).rejects.toThrow("mkdir failed");
    expect(mocks.deleteSprite).toHaveBeenCalledOnce();
  });
});
