"use client";

import {
  Plus,
  ChevronDown,
  Monitor,
  Settings,
  CreditCard,
  LogOut,
  Lock,
  GitPullRequest,
  Loader,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSession, signOut, signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { createSessionAction } from "@/app/actions/vibekit";
import { Avatar, AvatarImage, AvatarFallback } from "@radix-ui/react-avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createPullRequestAction } from "@/app/actions/vibekit";
import { templates } from "@/config";

export default function Navbar() {
  const { data: authSession } = useSession();
  const [isCreatingPullRequest, setIsCreatingPullRequest] =
    useState<boolean>(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isSession = pathname.includes("/session") && pathname !== "/sessions";
  const router = useRouter();

  const createSession = useMutation(api.sessions.create);
  const [mounted, setMounted] = useState(false);
  const sessionId = isSession ? pathname.split("/session/")[1] : null;
  const [isEditing, setIsEditing] = useState(false);
  const editRef = useRef<HTMLSpanElement>(null);
  const originalValue = useRef<string>("");

  const session = useQuery(
    api.sessions.getById,
    sessionId ? { id: sessionId as Id<"sessions"> } : "skip"
  );

  const updateSession = useMutation(api.sessions.update);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(editRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (session) {
      originalValue.current = session.name;
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (sessionId && editRef.current && session) {
      const newValue = editRef.current.textContent?.trim() || "";
      if (newValue && newValue !== originalValue.current) {
        await updateSession({
          id: sessionId as Id<"sessions">,
          name: newValue,
        });
      } else if (!newValue) {
        // Restore original value if empty
        editRef.current.textContent = originalValue.current;
      }
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (editRef.current) {
        editRef.current.textContent = originalValue.current;
      }
      setIsEditing(false);
    }
  };

  const handleNewSession = useCallback(async () => {
    const template = templates.find((t) => t.id === "nextjs");

    if (!template) return;

    const sessionId = await createSession({
      name: "Untitled session",
      status: "IN_PROGRESS",
      templateId: template.id,
    });

    await createSessionAction({
      sessionId,
      template,
    });

    router.push(`/session/${sessionId}`);
  }, [createSession, router]);

  const handleCreatePullRequest = useCallback(async () => {
    setIsCreatingPullRequest(true);
    const pr = await createPullRequestAction({
      id: sessionId as Id<"sessions">,
      sessionId: session?.sessionId as string,
      repository: session?.repository as string,
    });

    console.log(pr);
    setIsCreatingPullRequest(false);
  }, [session, sessionId]);

  return (
    <div
      className="flex justify-between items-center pt-2"
      style={{ width: "100%" }}
    >
      <div className="flex items-center gap-x-2">
        <Link
          passHref
          href="/"
          className="hover:opacity-30 transition-all duration-300"
        >
          <div className="flex items-center gap-x-1 text-muted-foreground">
            <Image src="/mark.png" alt="Superagent" width={20} height={20} />
            <p className="font-semibold">vibe0</p>
          </div>
        </Link>
        {mounted && authSession && (
          <span className="ml-1 text-muted-foreground/40">/</span>
        )}
        {mounted && authSession && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-x-1 px-1 py-1 rounded-md hover:bg-muted transition-colors cursor-pointer group">
                <Avatar className="h-6 w-6 mr-1">
                  <AvatarImage
                    className="rounded-md"
                    src={authSession.user?.image || undefined}
                    alt={authSession.user?.name || "User"}
                  />
                  <AvatarFallback className="text-xs">
                    {authSession.user?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {authSession.user?.name}
                </span>
                <ChevronDown className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                <DropdownMenuItem
                  className="font-medium"
                  onClick={handleNewSession}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New session
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="font-medium"
                  onClick={() => router.push("/sessions")}
                >
                  <Monitor className="mr-2 h-4 w-4" />
                  Sessions
                </DropdownMenuItem>
                <DropdownMenuItem className="font-medium">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem className="font-medium">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ThemeToggle />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="font-medium"
                  onClick={() => {
                    signOut();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isSession && <span className="text-muted-foreground/40">/</span>}
          </>
        )}
        {mounted && isSession && session && (
          <div className="flex items-center gap-x-2">
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-x-1 px-1 py-1.5 rounded-md hover:bg-muted transition-colors group cursor-pointer"
            >
              <span
                ref={editRef}
                contentEditable={isEditing}
                suppressContentEditableWarning={true}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className={`text-sm font-medium outline-none ${
                  isEditing ? "bg-muted rounded" : ""
                }`}
              >
                {session.name}
              </span>
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-x-2">
        {session && session.pullRequest && !isHome && (
          <Link href={session.pullRequest.html_url} target="_blank">
            <Button variant="outline" className="h-8">
              <GitPullRequest />
              View Pull Request
            </Button>
          </Link>
        )}{" "}
        {session && !session.pullRequest && !isHome && (
          <Button
            variant="outline"
            className="h-8"
            onClick={handleCreatePullRequest}
            disabled={isCreatingPullRequest || session?.status !== "RUNNING"}
          >
            {isCreatingPullRequest ? (
              <Loader className="animate-spin" />
            ) : (
              <GitPullRequest />
            )}
            Create Pull Request
          </Button>
        )}
        {isHome && authSession && (
          <Button className="h-8" onClick={handleNewSession}>
            <Plus /> New session
          </Button>
        )}
        {mounted && !authSession && (
          <Button className="h-8" onClick={() => signIn("github")}>
            <Lock />
            Sign in with Github
          </Button>
        )}
        {authSession && isSession && (
          <Button
            className="h-8"
            disabled={isCreatingPullRequest || session?.status !== "RUNNING"}
          >
            Publish
          </Button>
        )}
      </div>
    </div>
  );
}
