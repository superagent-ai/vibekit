"use client"

import { useState } from "react"
import { WelcomeScreen } from "./welcome-screen"
import { EnvironmentSetup } from "./environment-setup"
import { TaskSelection } from "./task-selection"

export type OnboardingStep = "welcome" | "environment" | "tasks" | "complete"

interface OnboardingFlowProps {
  onComplete: () => void
  onSkip?: () => void
}

export function OnboardingFlow({ onComplete, onSkip }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome")

  const handleStepChange = (step: OnboardingStep) => {
    setCurrentStep(step)
  }

  const handleComplete = () => {
    onComplete()
  }

  switch (currentStep) {
    case "welcome":
      return (
        <WelcomeScreen 
          onContinue={() => handleStepChange("environment")}
          onSkip={onSkip}
        />
      )
    
    case "environment":
      return (
        <EnvironmentSetup
          onBack={() => handleStepChange("welcome")}
          onContinue={() => handleStepChange("tasks")}
          onSkip={onSkip}
        />
      )
    
    case "tasks":
      return (
        <TaskSelection
          onBack={() => handleStepChange("environment")}
          onContinue={handleComplete}
          onSkip={onSkip}
        />
      )
    
    default:
      return null
  }
}