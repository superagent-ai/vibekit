"use client";
import { Doc } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { FileUpload } from "@/components/ui/file-upload";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { siteConfig } from "@/config";
import { Switch } from "@/components/ui/switch";

interface Props {
  agent: Doc<"agent">;
  project: Doc<"project">;
  onChange: ({ key, value }: { key: string; value: string | boolean }) => void;
}

interface AppearanceFormValues {
  logo?: string;
  buttonText?: string;
  headlineText?: string;
  primaryColor?: string;
  buttonColor?: string;
  descriptionText?: string;
  showButtonLogo?: boolean;
}

export default function Appearance({ agent, project, onChange }: Props) {
  const form = useForm<AppearanceFormValues>({
    defaultValues: {
      logo: agent.logo || project.logo || "",
      buttonText: agent.buttonText || siteConfig.defaultWidgetValues.buttonText,
      headlineText:
        agent.headlineText || siteConfig.defaultWidgetValues.headlineText,
      primaryColor: agent.primaryColor || project.primaryColor,

      buttonColor: agent.buttonColor || "#3b82f6",
      descriptionText:
        agent.descriptionText || siteConfig.defaultWidgetValues.descriptionText,
      showButtonLogo: agent.showButtonLogo ?? true,
    },
  });

  // Pass changes up via onChange
  const handleFieldChange = (
    key: keyof AppearanceFormValues,
    value: string | boolean
  ) => {
    form.setValue(key, value);
    onChange({
      key,
      value: typeof value === "boolean" ? value : String(value),
    });
  };

  const description = form.watch("descriptionText") || "";

  return (
    <Form {...form}>
      <form className="mt-5 flex flex-col gap-6 w-full">
        <FormField
          control={form.control}
          name="logo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Logo</FormLabel>
              <FormControl>
                <FileUpload
                  value={field.value}
                  onChange={(val) => handleFieldChange("logo", val || "")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="headlineText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Headline Text</FormLabel>
              <FormControl>
                <Input
                  className="w-1/2"
                  placeholder="Enter headline..."
                  {...field}
                  onChange={(e) =>
                    handleFieldChange("headlineText", e.target.value)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="buttonText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Button Text</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter button text..."
                  {...field}
                  className="w-1/2 placeholder:text-md"
                  onChange={(e) =>
                    handleFieldChange("buttonText", e.target.value)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="showButtonLogo"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="flex items-center gap-2">
                  <FormLabel>Button Logo</FormLabel>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(checked: boolean) =>
                      handleFieldChange("showButtonLogo", checked)
                    }
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="buttonColor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Button Color</FormLabel>
              <FormControl>
                <ColorPicker
                  value={field.value}
                  onChange={(val) => handleFieldChange("buttonColor", val)}
                  placeholder="#3b82f6"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="primaryColor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Background Color</FormLabel>
              <FormControl>
                <ColorPicker
                  value={field.value}
                  onChange={(val) => handleFieldChange("primaryColor", val)}
                  placeholder="#3b82f6"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="descriptionText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  maxLength={200}
                  className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
                  placeholder="Enter a description (max 200 characters)"
                  value={field.value}
                  onChange={(e) => {
                    handleFieldChange("descriptionText", e.target.value);
                    field.onChange(e);
                  }}
                />
              </FormControl>
              <div className="flex justify-end mt-1">
                <span className="text-xs text-muted-foreground">
                  {description.length}/200
                </span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
