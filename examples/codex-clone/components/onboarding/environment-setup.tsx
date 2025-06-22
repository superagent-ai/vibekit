"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ArrowRight, Search, Check } from "lucide-react"

interface EnvironmentSetupProps {
  onBack: () => void
  onContinue: () => void
  onSkip?: () => void
}

export function EnvironmentSetup({ onBack, onContinue, onSkip }: EnvironmentSetupProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null)

  // Mock environment data - replace with real data
  const environments = [
    {
      id: "1",
      name: "jasonkneen/fluentCLI",
      owner: "Jason Kneen",
      isSelected: false
    }
  ]

  const filteredEnvironments = environments.filter(env =>
    env.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">Select an environment</h1>
          <p className="text-muted-foreground">
            Environments configure the container for the agent to run. Not seeing your repo? You can create new
            environments in settings later.
          </p>
        </div>

        <div className="space-y-6">
          <div className="flex gap-4 border-b">
            <button className="pb-3 border-b-2 border-foreground font-medium">
              Existing environments
            </button>
            <button className="pb-3 text-muted-foreground">
              New environment
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="border rounded-lg p-4 min-h-[200px]">
            {filteredEnvironments.length > 0 ? (
              <div className="space-y-2">
                {filteredEnvironments.map((env) => (
                  <div
                    key={env.id}
                    onClick={() => setSelectedEnvironment(env.id)}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedEnvironment === env.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{env.name}</div>
                        <div className="text-sm text-muted-foreground">{env.owner}</div>
                      </div>
                      {selectedEnvironment === env.id && (
                        <Check className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No environments found
              </div>
            )}
          </div>
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
              disabled={!selectedEnvironment}
            >
              Use environment
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}