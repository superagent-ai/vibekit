"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, GitBranch, TestTube, Code2, Cpu } from "lucide-react"
import Image from "next/image"

interface WelcomeScreenProps {
  onContinue: () => void
  onSkip?: () => void
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <div className="relative w-fit mx-auto mb-8">
          {/* Glow effect behind logo */}
          <div className="absolute -inset-20 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-3xl animate-pulse" />
          <Image
            src="/codesurf3.png" 
            alt="Codesurf" 
            width={400}
            height={100}
            className="relative z-10 mx-auto"
          />
        </div>
        
        <div className="space-y-4">
          <div className="inline-block px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium">
            Research preview
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            Conquer the wave
          </h1>
          <p className="text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            An autonomous coding agent capable of answering code-based questions, executing complex workflows, and drafting pull requests.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 text-left">
          <div className="p-6 rounded-xl border bg-card/50">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold">Works just like a developer</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Switches contexts, changes branches, fixes issues across versions. Unlike humans, it clones itself with specialized skills for parallel work.
            </p>
          </div>
          
          <div className="p-6 rounded-xl border bg-card/50">
            <div className="flex items-center gap-2 mb-2">
              <Code2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="font-semibold">Understands your codebase</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              100x faster than humans. A week becomes an hour. Unlike other models that see snapshots, Codesurf understands the journey - code, context, and project history.
            </p>
          </div>
          
          <div className="p-6 rounded-xl border bg-card/50">
            <div className="flex items-center gap-2 mb-2">
              <TestTube className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h3 className="font-semibold">Runs lint and tests</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Tired of &quot;AGI&quot; models making silly mistakes? Forgetting context? Misplacing commas? We guarantee results or you don&apos;t pay. In fact, we&apos;ll give you tokens.
            </p>
          </div>
          
          <div className="p-6 rounded-xl border bg-card/50">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <h3 className="font-semibold">Powered by LFG-1</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              A unique fusion of engineering expertise, fine-tuning, knowledge, coding best practices, memory, and experience creates a unique coding experience. This isn&apos;t vibe coding. This is LFG coding.
            </p>
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <Button 
            onClick={onContinue}
            size="lg"
            className="px-8 rounded-full"
          >
            Get started
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
}