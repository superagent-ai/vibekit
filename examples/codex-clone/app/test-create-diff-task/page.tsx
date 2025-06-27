"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useTaskStore } from "@/stores/tasks"

export default function TestCreateDiffTaskPage() {
  const router = useRouter()
  const { addTask } = useTaskStore()

  const createTestTask = () => {
    const testTask = addTask({
      title: "Test Diff Viewer Task",
      description: "A test task with diff content",
      messages: [
        {
          role: "user",
          type: "message",
          data: {
            text: "Show me the changes in the README file"
          }
        },
        {
          role: "assistant", 
          type: "message",
          data: {
            text: "I'll show you the changes in the README file."
          }
        },
        {
          role: "assistant",
          type: "local_shell_call_output",
          data: {
            output: `diff --git a/README.md b/README.md
index 1234567..abcdefg 100644
--- a/README.md
+++ b/README.md
@@ -1,10 +1,10 @@
 # My Project
 
-This is the old description of my project.
+This is the new and improved description of my project.
 
 ## Features
 
-- Feature 1
-- Feature 2
+- Amazing Feature 1
+- Incredible Feature 2
+- New Feature 3
 
 ## Installation`
          }
        },
        {
          role: "assistant",
          type: "local_shell_call_output", 
          data: {
            output: `Running git diff...

--- a/src/app.js
+++ b/src/app.js
@@ -10,7 +10,8 @@ function main() {
   console.log('Starting application');
-  const config = loadConfig();
+  const config = loadConfig();
+  validateConfig(config);
   
   if (config.debug) {
     console.log('Debug mode enabled');
   }
}`
          }
        }
      ],
      status: "DONE",
      branch: "test-diff-viewer",
      sessionId: "test-session",
      repository: "test/repo",
      mode: "code",
      hasChanges: true
    })

    router.push(`/task/${testTask.id}`)
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Create Test Task with Diff Content</h1>
      <Button onClick={createTestTask}>
        Create Test Task and View
      </Button>
    </div>
  )
}