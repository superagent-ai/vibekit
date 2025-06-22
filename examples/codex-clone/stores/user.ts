import { create } from "zustand"
import { persist } from "zustand/middleware"

interface UserState {
  hasCompletedOnboarding: boolean
  setOnboardingComplete: () => void
  resetOnboarding: () => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false }),
    }),
    {
      name: "user-storage",
    }
  )
)