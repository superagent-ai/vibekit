"use client";

import React from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Dot, CheckCircle, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSignUp, useClerk } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const signUpSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

type SignUpValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const router = useRouter();
  const { setActive } = useClerk();
  const { isLoaded, signUp } = useSignUp();
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [hasVerified] = React.useState(false);
  const token = useSearchParams().get("__clerk_ticket");
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: "",
    },
  });

  const acceptForm = useForm();

  async function onConfirm() {
    if (!isLoaded || !token) {
      return;
    }

    const signUpAttempt = await signUp.create({
      strategy: "ticket",
      ticket: token,
    });

    if (signUpAttempt.status === "complete") {
      // Set up interval to refresh every second
      const refreshInterval = setInterval(() => {
        router.push("/sign-in");
      }, 1000);

      // Clean up interval when component unmounts
      return () => clearInterval(refreshInterval);
    } else {
      toast.error("Something went wrong, please try again.");
    }
  }

  async function onSubmit(data: SignUpValues) {
    if (!isLoaded) {
      return;
    }

    try {
      await signUp.create({
        emailAddress: data.email,
      });

      //posthog.identify(data.email);

      await signUp.prepareEmailAddressVerification();

      setIsVerifying(true);
    } catch (err: unknown) {
      if (isClerkAPIResponseError(err)) {
        toast.error(err.errors[0].message);
      } else {
        toast.error("Something went wrong, please contact support");
      }

      form.reset();
    }
  }

  async function handleVerification(code: string) {
    if (!isLoaded) {
      return;
    }

    const signUpAttempt = await signUp.attemptEmailAddressVerification({
      code,
    });

    if (signUpAttempt.status === "complete") {
      await setActive({ session: signUpAttempt.createdSessionId });
      // Set up interval to refresh every second
      const refreshInterval = setInterval(() => {
        router.refresh();
      }, 1000);

      // Clean up interval when component unmounts
      return () => clearInterval(refreshInterval);
    } else {
      console.log(signUpAttempt);
      toast.error("Something went wrong, please try again.");
    }
  }

  const signUpWithGoogle = () => {
    if (!isLoaded) return;

    return signUp.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: siteConfig.clerkOauthUrl,
      redirectUrlComplete: "/",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center max-w-lg mx-auto">
      <div className="flex flex-col items-center justify-center w-full">
        <div className="flex items-center space-x-4 mb-10">
          <Image
            src="/mark.png"
            alt="VibeKit Onboard Logo"
            width={80}
            height={14}
          />
        </div>
        {isVerifying ? (
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold">Verify email</h1>
              <p className="text-sm">Enter the code sent to your email below</p>
            </div>
            <div className="flex justify-center">
              <InputOTP
                autoFocus
                maxLength={6}
                name="code"
                onChangeCapture={async (event) => {
                  const code = (event.target as HTMLInputElement).value;
                  if (code.length === 6) {
                    await handleVerification(code);
                  }
                }}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="bg-background" />
                  <InputOTPSlot index={1} className="bg-background" />
                  <InputOTPSlot index={2} className="bg-background" />
                  <InputOTPSlot index={3} className="bg-background" />
                  <InputOTPSlot index={4} className="bg-background" />
                  <InputOTPSlot index={5} className="bg-background" />
                </InputOTPGroup>
              </InputOTP>
            </div>
            {hasVerified ? (
              <div className="flex space-x-2 items-center justify-center">
                <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                <p className="text-muted-foreground">Verification successful</p>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">
                  Waiting for verification...
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col space-y-10 w-full">
            {token ? (
              <div className="w-full max-w-sm mx-auto space-y-8">
                <div className="space-y-2 text-center">
                  <h1 className="text-2xl font-bold">Accept invitation</h1>
                  <p>Click the button below to accept the invitation</p>
                </div>
                <Form {...acceptForm}>
                  <form
                    onSubmit={acceptForm.handleSubmit(onConfirm)}
                    className="space-y-4"
                  >
                    <Button
                      disabled={acceptForm.formState.isSubmitting}
                      type="submit"
                      className="w-full"
                    >
                      {acceptForm.formState.isSubmitting && (
                        <Loader2 className="animate-spin" />
                      )}
                      {acceptForm.formState.isSubmitting
                        ? "Creating account..."
                        : "Accept invitiation"}
                    </Button>
                  </form>
                </Form>
              </div>
            ) : (
              <div className="w-full max-w-sm mx-auto space-y-8">
                <div className="space-y-2 text-center">
                  <h1 className="text-2xl font-bold">Create an account</h1>
                  <p>
                    Already have an account?{" "}
                    <Link passHref href="/sign-in" className="underline">
                      Sign in
                    </Link>
                  </p>
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
                      disabled={form.formState.isSubmitting}
                      type="submit"
                      className="w-full"
                    >
                      {form.formState.isSubmitting && (
                        <Loader2 className="animate-spin" />
                      )}
                      {form.formState.isSubmitting
                        ? "Creating account..."
                        : "Create an account"}
                    </Button>
                  </form>
                </Form>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="px-2 bg-sidebar text-muted-foreground rounded-full border">
                      OR
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full border border-muted-foreground/20"
                  onClick={() => {
                    signUpWithGoogle();
                  }}
                >
                  <Image
                    src="./google.svg"
                    width="20"
                    height="20"
                    alt="Sign up with google"
                  />
                  Sign up with Google
                </Button>
              </div>
            )}
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
