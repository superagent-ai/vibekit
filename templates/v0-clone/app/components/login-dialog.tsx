"use client";
import Image from "next/image";
import { LucideGithub } from "lucide-react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function LoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px]">
        <div className="mb-2 flex flex-col items-center gap-10">
          <Image
            src="logo.svg"
            alt="logo"
            width={100}
            height={100}
            className="mt-6"
          />
          <DialogHeader>
            <DialogTitle className="sm:text-center">
              Sign in to vibe0
            </DialogTitle>
            <DialogDescription className="sm:text-center">
              Sign in to your account to continue.
            </DialogDescription>
          </DialogHeader>
        </div>
        <Button
          type="button"
          className="w-full"
          onClick={() => signIn("github")}
        >
          <LucideGithub />
          Login with Github
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          This will open Github OAuth login page.
        </p>
      </DialogContent>
    </Dialog>
  );
}
