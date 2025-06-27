"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"

interface TaskSelectionProps {
  onBack: () => void
  onContinue: () => void
  onSkip?: () => void
}

export function TaskSelection({ onBack, onContinue, onSkip }: TaskSelectionProps) {
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])

  const tasks = [
    {
      id: "ask-1",
      type: "Ask",
      title: "Explain the codebase to a newcomer. What is the general structure, what are the important things to know, and what are some pointers for things to learn next?",
      description: "Get oriented with your codebase structure and key concepts."
    },
    {
      id: "code-1", 
      type: "Code",
      title: "Pick a part of the codebase that seems important and find and fix a bug.",
      description: "Identify and resolve issues in critical code areas."
    },
    {
      id: "ask-2",
      type: "Ask", 
      title: "Go through the codebase, find issues and propose one task to fix a typo, one task to fix a bug, one task to fix a code comment or documentation discrepancy, and one task to improve a test.",
      description: "Comprehensive code review with improvement suggestions."
    }
  ]

  const toggleTask = (taskId: string) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">Ready when you are</h1>
          <p className="text-muted-foreground">
            We picked a few tasks to get you started.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => toggleTask(task.id)}
              className={`p-6 rounded-xl border cursor-pointer transition-all ${
                selectedTasks.includes(task.id)
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    {task.type}
                  </span>
                  {selectedTasks.includes(task.id) && (
                    <Check className="h-5 w-5 text-blue-500" />
                  )}
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm leading-relaxed">
                    {task.title}
                  </p>
                </div>
                
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    {task.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-6">
            Codesurf can make mistakes. Always review the code.
          </p>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex gap-2">
            {onSkip && (
              <Button variant="outline" onClick={onSkip}>
                Skip
              </Button>
            )}
            <Button 
              onClick={onContinue}
              disabled={selectedTasks.length === 0}
            >
              Start tasks
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}