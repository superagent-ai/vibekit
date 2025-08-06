import ChatForm from "./chat-form";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import Message from "./message";
import { TextShimmer } from "../ui/text-shimmer";
import { ListTodo } from "lucide-react";
import { useState } from "react";
import { runAgentAction } from "@/app/actions/vibekit";
import { useSession } from "next-auth/react";

interface Todo {
  id: string;
  content: string;
  status: string;
  priority: string;
}

// Helper function to extract the latest todos from assistant messages
function extractLatestTodos(messages: Doc<"messages">[]): Todo[] {
  // Find the most recent assistant message with todos
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.role === "assistant" &&
      message.todos &&
      message.todos.length > 0
    ) {
      return message.todos;
    }
  }
  return [];
}

// Helper function to calculate progress based on todo status
function calculateProgress(todos: Todo[]): number {
  if (todos.length === 0) return 0;
  const completedCount = todos.filter(
    (todo) =>
      todo.status.toLowerCase() === "completed" ||
      todo.status.toLowerCase() === "done"
  ).length;
  return Math.round((completedCount / todos.length) * 100);
}

// Helper function to get completed todo count
function getCompletedCount(todos: Todo[]): number {
  return todos.filter(
    (todo) =>
      todo.status.toLowerCase() === "completed" ||
      todo.status.toLowerCase() === "done"
  ).length;
}

// Round progress bar component
function RoundProgress({
  progress,
  completed,
  total,
}: {
  progress: number;
  completed: number;
  total: number;
}) {
  const circumference = 2 * Math.PI * 8; // radius of 8
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex items-center justify-center">
      <span className="text-xs font-medium text-muted-foreground mr-1">
        {completed}/{total}
      </span>
      <div className="relative w-4 h-4">
        <svg className="w-4 h-4 transform -rotate-90" viewBox="0 0 20 20">
          <circle
            cx="10"
            cy="10"
            r="8"
            stroke="currentColor"
            strokeWidth="3"
            fill="transparent"
            className="text-muted-foreground/30"
          />
          <circle
            cx="10"
            cy="10"
            r="8"
            stroke="currentColor"
            strokeWidth="3"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-green-500 transition-all duration-300 ease-in-out"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default function Chat({ session }: { session: Doc<"sessions"> }) {
  const { data: authSession } = useSession();
  const addMessage = useMutation(api.messages.add);
  const messages = useQuery(api.messages.getBySession, {
    sessionId: session._id,
  });
  const [todosExpanded, setTodosExpanded] = useState(false);

  const handleSubmit = async (message: string) => {
    await addMessage({
      sessionId: session._id as Id<"sessions">,
      role: "user",
      content: message,
    });

    await runAgentAction({
      sessionId: session.sessionId!,
      id: session._id,
      message,
      repository: session.repository,
      token: authSession?.accessToken as string,
    });
  };

  const toggleTodos = () => {
    setTodosExpanded(!todosExpanded);
  };

  // Early return if messages are not loaded yet
  if (!messages) {
    return (
      <div className="w-[600px] bg-background rounded-lg flex flex-col border relative" />
    );
  }

  const latestTodos = extractLatestTodos(messages);
  const todosProgress = calculateProgress(latestTodos);
  const completedTodos = getCompletedCount(latestTodos);

  return (
    <div className="w-[600px] bg-background rounded-lg flex flex-col border relative">
      {/* Top fade */}
      <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background to-transparent z-10 rounded-t-lg pointer-events-none" />
      <ScrollArea className="h-[calc(100vh-100px)] px-2">
        <div className="flex flex-col gap-y-2 p-1 pb-[200px] pt-4">
          {messages.length === 0 && (
            <Message
              message={
                {
                  role: "assistant",
                  content: "Hello, I'm vibe0. How can I help you today?",
                } as Doc<"messages">
              }
              showAvatar={true}
            />
          )}
          {messages
            .filter((message) => !message.todos || message.todos.length <= 1)
            .map((message, index) => {
              // Show avatar if it's the first message or if the role changed from the previous message
              const showAvatar =
                index === 0 || messages[index - 1]?.role !== message.role;
              // Convert to Doc<"messages"> by removing extra properties

              return (
                <Message
                  key={message._id}
                  message={message as Doc<"messages">}
                  showAvatar={showAvatar}
                />
              );
            })}
          {session.status === "CUSTOM" && (
            <div className="flex items-center gap-x-2 mt-2 pl-10">
              <div className="size-3 bg-primary rounded-full animate-fast-pulse" />
              <TextShimmer className="text-sm">
                {`${session.statusMessage?.slice(0, 45)}...` || "Working"}
              </TextShimmer>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="absolute bottom-2 left-3 right-3 bg-background flex flex-col gap-y-2 backdrop-blur-md">
        <div className="flex flex-col gap-y-0">
          <div className="flex flex-col gap-y-2 mx-2 rounded-t-lg hover:bg-muted cursor-pointer bg-muted border-t border-l border-r transition-colors duration-300">
            <div
              className="flex items-center justify-between p-2"
              onClick={toggleTodos}
            >
              <div className="flex items-center gap-x-1">
                <ListTodo className="size-3" />
                <p className="text-xs font-medium">Todo&apos;s</p>
              </div>
              <div className="flex items-center gap-x-2">
                {latestTodos.length > 0 && (
                  <RoundProgress
                    progress={todosProgress}
                    completed={completedTodos}
                    total={latestTodos.length}
                  />
                )}
              </div>
            </div>
            {latestTodos.length > 0 && todosExpanded && (
              <div className="flex flex-col gap-y-1 px-2 pb-2 transition-all duration-300 ease-in-out">
                {latestTodos.slice(0, 3).map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-x-2 text-xs"
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        todo.status.toLowerCase() === "completed" ||
                        todo.status.toLowerCase() === "done"
                          ? "bg-green-500"
                          : todo.status.toLowerCase() === "in_progress" ||
                              todo.status.toLowerCase() === "in progress"
                            ? "bg-yellow-500"
                            : "bg-gray-400"
                      }`}
                    />
                    <span className="text-muted-foreground truncate flex-1">
                      {todo.content}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 ${
                        todo.priority.toLowerCase() === "high"
                          ? "text-red-500"
                          : todo.priority.toLowerCase() === "medium"
                            ? "text-orange-500"
                            : "text-blue-500"
                      }`}
                    >
                      {todo.priority}
                    </span>
                  </div>
                ))}
                {latestTodos.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{latestTodos.length - 3} more todos
                  </p>
                )}
              </div>
            )}
          </div>
          <ChatForm onSubmit={handleSubmit} />
        </div>

        <p className="text-xs text-muted-foreground text-center">
          vibe0 never makes mistakes. Like the other ones do.
        </p>
      </div>
    </div>
  );
}
