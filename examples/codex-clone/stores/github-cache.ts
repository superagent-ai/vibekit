import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GitHubRepository {
  id: number
  name: string
  full_name: string
  private: boolean
  description?: string
  html_url: string
  default_branch: string
  language?: string
  stargazers_count?: number
  forks_count?: number
  updated_at?: string
  created_at?: string
  owner: {
    login: string
    type: string
    avatar_url: string
  }
}

interface GitHubBranch {
  name: string
  commit: {
    sha: string
    url: string
  }
  protected: boolean
  isDefault: boolean
}

interface GitHubCacheState {
  repositories: GitHubRepository[]
  branches: Record<string, GitHubBranch[]>
  lastFetched: number | null
  isRefreshing: boolean
  
  // Actions
  setRepositories: (repos: GitHubRepository[]) => void
  setBranches: (repoName: string, branches: GitHubBranch[]) => void
  setRefreshing: (refreshing: boolean) => void
  getCachedRepositories: () => GitHubRepository[]
  getCachedBranches: (repoName: string) => GitHubBranch[]
  shouldRefresh: () => boolean
  clearCache: () => void
}

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export const useGitHubCache = create<GitHubCacheState>()(
  persist(
    (set, get) => ({
      repositories: [],
      branches: {},
      lastFetched: null,
      isRefreshing: false,

      setRepositories: (repos) => set({ 
        repositories: repos, 
        lastFetched: Date.now() 
      }),

      setBranches: (repoName, branches) => set((state) => ({
        branches: {
          ...state.branches,
          [repoName]: branches
        }
      })),

      setRefreshing: (refreshing) => set({ isRefreshing: refreshing }),

      getCachedRepositories: () => get().repositories,

      getCachedBranches: (repoName) => get().branches[repoName] || [],

      shouldRefresh: () => {
        const { lastFetched } = get()
        if (!lastFetched) return true
        return Date.now() - lastFetched > CACHE_DURATION
      },

      clearCache: () => set({
        repositories: [],
        branches: {},
        lastFetched: null,
        isRefreshing: false
      })
    }),
    {
      name: 'github-cache-storage'
    }
  )
)