"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useTaskStore } from "@/stores/tasks";
import { runClaudeTaskAction } from "@/app/actions/vibekit";

const DOCKER_IMAGES = [
  { value: "superagentai/vibekit-claude:1.0", label: "VibeKit Claude Sandbox" },
  { value: "custom", label: "Custom Docker Image" },
];

export default function TaskForm() {
  const [description, setDescription] = useState("");
  const [dockerImage, setDockerImage] = useState("superagentai/vibekit-claude:1.0");
  const [customDockerImage, setCustomDockerImage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addTask, updateTask } = useTaskStore();

  const isCustomSelected = dockerImage === "custom";
  const finalDockerImage = isCustomSelected ? customDockerImage : dockerImage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    if (isCustomSelected && !customDockerImage.trim()) return;

    setIsSubmitting(true);

    try {
      // Create a new task
      const task = addTask({
        title: description.slice(0, 50) + (description.length > 50 ? "..." : ""),
        description,
        messages: [],
        status: "IN_PROGRESS",
        sessionId: crypto.randomUUID(),
        statusMessage: "Starting Claude with Docker...",
        mode: "code",
        hasChanges: false,
        dockerImage: finalDockerImage,
      });

      // Run the task
      const result = await runClaudeTaskAction({ task, dockerImage: finalDockerImage });

      if (result.success) {
        updateTask(task.id, {
          status: "DONE",
          statusMessage: "Task completed successfully",
          sessionId: (result as { sessionId?: string }).sessionId || task.sessionId,
          sandboxId: ((result.result as { sandboxId?: string })?.sandboxId) || undefined,
          messages: [
            {
              role: "user",
              type: "message",
              data: { text: description },
            },
            {
              role: "assistant", 
              type: "result",
              data: (result.result as Record<string, unknown>) || {},
            },
          ],
        });
      } else {
        updateTask(task.id, {
          status: "FAILED",
          statusMessage: result.error || "Task failed",
        });
      }

      // Clear form
      setDescription("");
      setCustomDockerImage("");
    } catch (error) {
      console.error("Failed to submit task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-card">
      <h2 className="text-lg font-semibold mb-4">Create New Task</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-2">
            Task Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you want Claude to do... (e.g., 'Create a Python script that prints hello world')"
            className="w-full p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            rows={4}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="docker-image" className="block text-sm font-medium mb-2">
            Docker Environment
          </label>
          <Select value={dockerImage} onValueChange={setDockerImage} disabled={isSubmitting}>
            <SelectTrigger>
              <SelectValue placeholder="Select Docker image" />
            </SelectTrigger>
            <SelectContent>
              {DOCKER_IMAGES.map((image) => (
                <SelectItem key={image.value} value={image.value}>
                  {image.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCustomSelected && (
          <div>
            <label htmlFor="custom-docker-image" className="block text-sm font-medium mb-2">
              Custom Docker Image
            </label>
            <input
              id="custom-docker-image"
              type="text"
              value={customDockerImage}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomDockerImage(e.target.value)}
              placeholder="e.g., ubuntu:22.04, node:18-alpine"
              disabled={isSubmitting}
              className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        <Button 
          type="submit" 
          disabled={!description.trim() || (isCustomSelected && !customDockerImage.trim()) || isSubmitting}
          className="w-full"
        >
          {isSubmitting ? "Running..." : "Run Task with Claude"}
        </Button>
      </form>
    </div>
  );
}