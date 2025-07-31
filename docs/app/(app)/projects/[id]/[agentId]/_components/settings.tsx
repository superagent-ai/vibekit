"use client";
import { useForm } from "react-hook-form";
import { InfoIcon, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCopyToClipboard } from "usehooks-ts";

import { Doc } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { siteConfig } from "@/config";

interface Props {
  agent: Doc<"agent">;
  project: Doc<"project">;
  onChange: ({ key, value }: { key: string; value: string | boolean }) => void;
}

interface SettingsFormValues {
  githubClientId?: string;
  githubClientSecret?: string;
  githubCallback?: string;
  privacyPolicy?: string;
  termsOfService?: string;
}

export default function Settings({ agent, project, onChange }: Props) {
  const [copied, setCopied] = useState(false);
  const [, copy] = useCopyToClipboard();

  const form = useForm<SettingsFormValues>({
    defaultValues: {
      githubClientId: project.githubClientId,
      githubClientSecret: project.githubClientSecret,
      githubCallback: siteConfig.githubCallbackUrl,
      privacyPolicy: agent.privacyPolicy || siteConfig.privacyPolicyUrl,
      termsOfService: agent.termsOfService || siteConfig.termsOfServiceUrl,
    },
  });

  // Pass changes up via onChange
  const handleFieldChange = (key: keyof SettingsFormValues, value: string) => {
    form.setValue(key, value);
    onChange({
      key,
      value: String(value),
    });
  };

  const copyToClipboard = async () => {
    const success = await copy(siteConfig.githubCallbackUrl);
    if (success) {
      setCopied(true);
      toast.success("Callback URL copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy callback URL");
    }
  };

  return (
    <Form {...form}>
      <div className="bg-muted border rounded-lg p-4 flex-shrink-0 mt-4">
        <div className="flex items-start space-x-3">
          <InfoIcon className="size-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm">
              Setting up an Github OAuth app is optional, if no credentials are
              provided, the default VibeKit Github App will be used.
            </p>
          </div>
        </div>
      </div>
      <form className="mt-5 flex flex-col gap-6 w-full">
        <FormField
          control={form.control}
          name="githubClientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client ID</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter GitHub Client ID..."
                  {...field}
                  onChange={(e) =>
                    handleFieldChange("githubClientId", e.target.value)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="githubClientSecret"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client Secret</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Enter GitHub Client Secret..."
                  {...field}
                  onChange={(e) =>
                    handleFieldChange("githubClientSecret", e.target.value)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="githubCallback"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Callback URL</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input disabled {...field} className="flex-1" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyToClipboard}
                  >
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="privacyPolicy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Privacy Policy URL</FormLabel>
              <FormControl>
                <Input
                  className="w-full"
                  placeholder="https://example.com/privacy"
                  {...field}
                  onChange={(e) =>
                    handleFieldChange("privacyPolicy", e.target.value)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="termsOfService"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Terms of Service URL</FormLabel>
              <FormControl>
                <Input
                  className="w-full"
                  placeholder="https://example.com/terms"
                  {...field}
                  onChange={(e) =>
                    handleFieldChange("termsOfService", e.target.value)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
