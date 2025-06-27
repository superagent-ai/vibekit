import { Task } from "@/stores/tasks";

interface CodeChange {
  filepath: string;
  content: string;
  operation: "create" | "edit" | "delete";
}

export function extractCodeChangesFromTask(task: Task): CodeChange[] {
  const codeChanges: CodeChange[] = [];
  
  if (!task.messages) return codeChanges;
  
  // Look for code blocks in assistant messages
  task.messages
    .filter(msg => msg.type === "message" && msg.role === "assistant")
    .forEach(msg => {
      const text = msg.data?.text as string || "";
      
      // Extract code blocks with file paths
      const codeBlockRegex = /```(?:typescript|javascript|tsx|jsx|ts|js|json|md|css|html|bash|sh|yaml|yml)?\s*\n(?:\/\/|#|<!--)?\s*(?:File:|file:)?\s*([^\n]+)\n([\s\S]*?)```/g;
      
      let match;
      while ((match = codeBlockRegex.exec(text)) !== null) {
        const filepath = match[1].trim();
        const content = match[2];
        
        // Determine operation based on context
        let operation: "create" | "edit" | "delete" = "edit";
        if (text.toLowerCase().includes(`creating ${filepath}`) || 
            text.toLowerCase().includes(`create ${filepath}`)) {
          operation = "create";
        } else if (text.toLowerCase().includes(`deleting ${filepath}`) ||
                   text.toLowerCase().includes(`delete ${filepath}`)) {
          operation = "delete";
        }
        
        codeChanges.push({
          filepath,
          content,
          operation
        });
      }
    });
  
  // Also check for file operations in shell commands
  task.messages
    .filter(msg => msg.type === "local_shell_call")
    .forEach(msg => {
      const command = (msg.data as any)?.action?.command;
      if (command && Array.isArray(command)) {
        const cmdStr = command.join(" ");
        
        // Check for file creation commands
        if (cmdStr.includes("echo") && cmdStr.includes(">")) {
          const fileMatch = cmdStr.match(/>\s*([^\s]+)/);
          if (fileMatch) {
            const filepath = fileMatch[1];
            const contentMatch = cmdStr.match(/echo\s+["']([^"']+)["']/);
            if (contentMatch) {
              codeChanges.push({
                filepath,
                content: contentMatch[1],
                operation: "create"
              });
            }
          }
        }
      }
    });
  
  return codeChanges;
}

export function generateRecoveryScript(codeChanges: CodeChange[]): string {
  let script = "#!/bin/bash\n\n";
  script += "# Recovery script for task code changes\n";
  script += "# Generated on " + new Date().toISOString() + "\n\n";
  
  // Group by directory
  const directories = new Set<string>();
  codeChanges.forEach(change => {
    const dir = change.filepath.substring(0, change.filepath.lastIndexOf("/"));
    if (dir) directories.add(dir);
  });
  
  // Create directories
  if (directories.size > 0) {
    script += "# Create directories\n";
    directories.forEach(dir => {
      script += `mkdir -p "${dir}"\n`;
    });
    script += "\n";
  }
  
  // Create/update files
  script += "# Create/update files\n";
  codeChanges.forEach(change => {
    if (change.operation !== "delete") {
      script += `cat > "${change.filepath}" << 'EOF'\n`;
      script += change.content;
      script += "\nEOF\n\n";
    }
  });
  
  // Delete files
  const deletions = codeChanges.filter(c => c.operation === "delete");
  if (deletions.length > 0) {
    script += "# Delete files\n";
    deletions.forEach(change => {
      script += `rm -f "${change.filepath}"\n`;
    });
  }
  
  return script;
}