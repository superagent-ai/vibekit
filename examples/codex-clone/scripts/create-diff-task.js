// Script to create a task with real diff content
const taskData = {
  title: "Test Diff Viewer",
  description: "Testing diff viewer functionality",
  messages: [
    {
      role: "user",
      type: "message",
      data: {
        id: "msg-1",
        text: "Show me the diff for the recent changes"
      }
    },
    {
      role: "assistant",
      type: "message", 
      data: {
        id: "msg-2",
        text: "I'll show you the diff for the recent changes."
      }
    },
    {
      role: "assistant",
      type: "local_shell_call",
      data: {
        call_id: "call-1",
        action: {
          command: ["git", "diff", "HEAD~1", "HEAD", "--", "README.md"]
        }
      }
    },
    {
      role: "assistant",
      type: "local_shell_call_output",
      data: {
        call_id: "call-1",
        output: JSON.stringify({
          output: `diff --git a/README.md b/README.md
index 5e1c309..8b8441b 100644
--- a/README.md
+++ b/README.md
@@ -1,10 +1,15 @@
-# Hello World
+# Hello World - Enhanced Edition
 
-This is a simple README file.
+This is an enhanced README file with more features.
 
 ## Features
 
-- Basic functionality
-- Simple design
+- Advanced functionality
+- Modern design
+- Real-time updates
+- Cloud integration
+
+## Installation
+
+\`\`\`bash
+npm install
+\`\`\``
        }),
        success: true
      }
    },
    {
      role: "assistant",
      type: "message",
      data: {
        id: "msg-3",
        text: "Here's another diff showing changes to the source code:"
      }
    },
    {
      role: "assistant", 
      type: "local_shell_call",
      data: {
        call_id: "call-2",
        action: {
          command: ["git", "diff", "--cached"]
        }
      }
    },
    {
      role: "assistant",
      type: "local_shell_call_output",
      data: {
        call_id: "call-2",
        output: JSON.stringify({
          output: `diff --git a/src/index.js b/src/index.js
index a8f9fd8..ed6e61a 100644
--- a/src/index.js
+++ b/src/index.js
@@ -1,5 +1,5 @@
 function main() {
-  console.log('Hello');
+  console.log('Hello, World!');
 }
 
 main();
diff --git a/src/utils.js b/src/utils.js
new file mode 100644
index 0000000..7c0b3eb
--- /dev/null
+++ b/src/utils.js
@@ -0,0 +1,5 @@
+export function formatDate(date) {
+  return new Intl.DateTimeFormat('en-US').format(date);
+}
+
+export const VERSION = '1.0.0';`
        }),
        success: true
      }
    }
  ],
  status: "DONE",
  branch: "main",
  sessionId: crypto.randomUUID(),
  repository: "test/repo",
  mode: "code",
  hasChanges: true,
  isArchived: false
};

// Get existing tasks from localStorage
const store = JSON.parse(localStorage.getItem('task-store') || '{"state":{"tasks":[]}}');

// Create new task
const now = new Date().toISOString();
const newTask = {
  ...taskData,
  id: crypto.randomUUID(),
  createdAt: now,
  updatedAt: now
};

// Add to store
store.state.tasks.push(newTask);

// Save back to localStorage
localStorage.setItem('task-store', JSON.stringify(store));

console.log('Created task with ID:', newTask.id);
console.log('Navigate to: http://localhost:3000/task/' + newTask.id);

// Automatically navigate
window.location.href = '/task/' + newTask.id;