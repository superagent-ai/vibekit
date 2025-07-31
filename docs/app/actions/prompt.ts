"use server";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export async function generatePromptFromUrl(url: string): Promise<string> {
  console.log("Generating prompt for URL:", url);
  const data = await generateText({
    model: openai.responses("gpt-4.1"),
    prompt:
      `# GOAL\nYour goal is to create a prompt for an AI Agent to implement the following service: ${url}\n` +
      "Include step by step instructions for the agent to follow.\n" +
      "Always use web search to get the latest information based on the URL provided.\n" +
      "Include code examples and other valuable instructions.",
    tools: {
      web_search_preview: openai.tools.webSearchPreview(),
    },
    toolChoice: "required",
    experimental_output: Output.object({
      schema: z.object({
        markdown: z.string(),
      }),
    }),
  });

  return data.experimental_output.markdown;
}
