"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Dot, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { siteConfig } from "@/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { addToWaitlistAction } from "@/app/actions/waitlist";
const waitlistSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

type WaitlistValues = z.infer<typeof waitlistSchema>;

export default function WaitlistPage() {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isAddedToWaitlist, setIsAddedToWaitlist] = React.useState(false);
  const form = useForm<WaitlistValues>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(data: WaitlistValues) {
    setIsSubmitting(true);
    try {
      await addToWaitlistAction(data.email);
      setIsAddedToWaitlist(true);
      form.reset();
    } catch {
      toast.error("Something went wrong. Please try again.");
      setIsSubmitting(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center max-w-md mx-auto">
      <div className="flex flex-col items-center justify-center w-full">
        <div className="flex items-center space-x-4 mb-10">
          <Image
            src="/mark.png"
            alt="VibeKit Onboard Logo"
            width={80}
            height={14}
          />
        </div>
        {isAddedToWaitlist ? (
          <div className="w-full max-w-lg space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold">You&apos;ve been added!</h1>
              <p>
                You will receive an invite to {siteConfig.appName} when
                it&apos;s your turn.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold">Join the waitlist</h1>
              <p>Be among the first to experience {siteConfig.appName}.</p>
            </div>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          className="bg-background"
                          type="email"
                          placeholder="name@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  disabled={isSubmitting}
                  type="submit"
                  className="w-full"
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isSubmitting ? "Joining waitlist..." : "Join the waitlist"}
                </Button>
              </form>
            </Form>
          </div>
        )}
        <div className="max-w-sm flex flex-col space-y-0 items-center mt-12 text-sm">
          <div className="flex items-center space-x-0">
            <Link passHref href={siteConfig.termsOfServiceUrl}>
              <p className="hover:text-muted-foreground">Terms</p>
            </Link>
            <Dot className="text-muted-foreground" />
            <Link passHref href={siteConfig.privacyPolicyUrl}>
              <p className="hover:text-muted-foreground">Privacy</p>
            </Link>
            <Dot className="text-muted-foreground" />
            <Link passHref href={siteConfig.cookiePolicyUrl}>
              <p className="hover:text-muted-foreground">Cookies</p>
            </Link>
            <Dot className="text-muted-foreground" />
            <Link passHref href={siteConfig.supportUrl}>
              <p className="hover:text-muted-foreground">Support</p>
            </Link>
          </div>
          <p className="text-muted-foreground">{siteConfig.copyrightText}</p>
        </div>
      </div>
    </div>
  );
}
