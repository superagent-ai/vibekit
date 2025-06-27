"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { 
  Github, 
  Lock, 
  Globe, 
  Search, 
  GitBranch, 
  ChevronDown,
  Check,
  Building,
  User,
  RefreshCw
} from "lucide-react"
import { useGitHubAuth } from "@/hooks/use-github-auth"
import { ScrollArea } from "@/components/ui/scroll-area"

interface RepositorySelectorProps {
  value?: {
    organization?: string
    repository?: string
    branch?: string
  }
  onChange?: (value: {
    organization: string
    repository: string
    branch: string
  }) => void
  className?: string
  onClose?: () => void
}

export function RepositorySelector({ value, onChange, className, onClose }: RepositorySelectorProps) {
  const { isAuthenticated, user, repositories, getCachedBranches, fetchRepositories, fetchBranches } = useGitHubAuth()
  
  const [visibility, setVisibility] = useState<"private" | "public">("private")
  const [selectedOrg, setSelectedOrg] = useState(value?.organization || "")
  const [selectedRepo, setSelectedRepo] = useState(value?.repository || "")
  const branches = getCachedBranches(selectedRepo)
  const [selectedBranch, setSelectedBranch] = useState(value?.branch || "main")
  const [repoSearchOpen, setRepoSearchOpen] = useState(false)
  const [repoSearch, setRepoSearch] = useState("")
  const [publicRepoUrl, setPublicRepoUrl] = useState("")
  const [publicBranch, setPublicBranch] = useState("main")
  const [recentRepos, setRecentRepos] = useState<any[]>([])

  const [organizations, setOrganizations] = useState<any[]>([])
  const [orgRepos, setOrgRepos] = useState<any[]>([])
  const [allOrgRepos, setAllOrgRepos] = useState<Record<string, any[]>>({}) // Cache all repos per org
  const [isPublicUrlValid, setIsPublicUrlValid] = useState(false)
  
  // Cache for organizations and repos to prevent API spam
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
  const getCachedData = (key: string) => {
    try {
      const cached = localStorage.getItem(`github_cache_${key}`)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data
        }
      }
    } catch (error) {
      console.error('Cache read error:', error)
    }
    return null
  }
  
  const setCachedData = (key: string, data: any) => {
    try {
      localStorage.setItem(`github_cache_${key}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('Cache write error:', error)
    }
  }
  
  // Load recent repos from localStorage
  useEffect(() => {
    const loadRecentRepos = () => {
      try {
        const saved = localStorage.getItem('recent_repos')
        if (saved) {
          setRecentRepos(JSON.parse(saved))
        }
      } catch (error) {
        console.error('Failed to load recent repos:', error)
      }
    }
    loadRecentRepos()
  }, [])

  // Save selected repo to recent repos
  const saveToRecentRepos = (repo: any) => {
    try {
      const newRecent = [repo, ...recentRepos.filter(r => r.full_name !== repo.full_name)].slice(0, 10)
      setRecentRepos(newRecent)
      localStorage.setItem('recent_repos', JSON.stringify(newRecent))
    } catch (error) {
      console.error('Failed to save recent repos:', error)
    }
  }

  // Validate public URL
  useEffect(() => {
    const validateGitHubUrl = (url: string) => {
      const githubUrlPattern = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+$/
      return githubUrlPattern.test(url)
    }
    setIsPublicUrlValid(validateGitHubUrl(publicRepoUrl))
  }, [publicRepoUrl])

  // Fetch organizations once with caching (always try if we have env token)
  useEffect(() => {
    if (organizations.length === 0) {
      const cachedOrgs = getCachedData('organizations')
      if (cachedOrgs) {
        console.log('[RepoSelector] Using cached organizations')
        setOrganizations(cachedOrgs)
        setSelectedOrg(cachedOrgs[0]?.login || '')
        return
      }
      
      console.log('[RepoSelector] Fetching organizations from API')
      fetch('/api/auth/github/organizations', { credentials: 'include' })
        .then(res => {
          console.log('[RepoSelector] Organizations response:', res.status)
          if (!res.ok) {
            throw new Error(`Failed to fetch organizations: ${res.status}`)
          }
          return res.json()
        })
        .then(data => {
          console.log('[RepoSelector] Organizations data:', data)
          if (data.organizations) {
            setOrganizations(data.organizations)
            setSelectedOrg(data.organizations[0]?.login || '')
            setCachedData('organizations', data.organizations)
          } else if (data.error) {
            console.error('[RepoSelector] API Error:', data.error)
            alert(`GitHub API Error: ${data.error}`)
          }
        })
        .catch(error => {
          console.error('[RepoSelector] Fetch error:', error)
          alert(`Failed to load GitHub data: ${error.message}`)
        })
    }
  }, [])
  
  // Fetch repos for selected org with smart caching (only 10 initially, then filter locally)
  useEffect(() => {
    if (selectedOrg) {
      // Check if we have cached repos for this org
      const cacheKey = `repos_${selectedOrg}`
      const cachedRepos = getCachedData(cacheKey)
      
      if (cachedRepos) {
        console.log(`[RepoSelector] Using cached repos for ${selectedOrg}`)
        setAllOrgRepos(prev => ({ ...prev, [selectedOrg]: cachedRepos }))
        return
      }
      
      // Only fetch if we don't have cached data
      if (!allOrgRepos[selectedOrg]) {
        console.log(`[RepoSelector] Fetching repos for ${selectedOrg} (first time only)`)
        fetch(`/api/auth/github/org-repos?org=${encodeURIComponent(selectedOrg)}`, { credentials: 'include' })
          .then(res => res.json())
          .then(data => {
            console.log(`[RepoSelector] Received ${data.repositories?.length || 0} repos for ${selectedOrg}`)
            if (data.repositories) {
              const newRepos = { ...allOrgRepos, [selectedOrg]: data.repositories }
              setAllOrgRepos(newRepos)
              setCachedData(cacheKey, data.repositories)
            }
          })
          .catch(console.error)
      }
    }
  }, [selectedOrg])
  
  // Filter repos locally instead of making API calls
  useEffect(() => {
    if (allOrgRepos[selectedOrg]) {
      let filtered = allOrgRepos[selectedOrg]
      
      // Filter by search term locally
      if (repoSearch) {
        filtered = filtered.filter((repo: any) =>
          repo.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
          repo.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(repoSearch.toLowerCase()))
        )
      }
      
      setOrgRepos(filtered)
    }
  }, [selectedOrg, repoSearch, allOrgRepos])

  // Filter repos by visibility only (org filtering and search handled by API)
  const filteredRepos = useMemo(() => {
    if (visibility === "private") {
      // For private tab, show recent repos if no search, otherwise filter org repos
      if (!repoSearch && recentRepos.length > 0) {
        return recentRepos.slice(0, 10)
      }
      return orgRepos.filter(repo => repo.private)
    }
    return orgRepos.filter(repo => !repo.private)
  }, [orgRepos, visibility, repoSearch, recentRepos])


  // Fetch branches when repo changes
  useEffect(() => {
    if (selectedRepo) {
      fetchBranches(selectedRepo)
    }
  }, [selectedRepo, fetchBranches])

  // Update parent when selection changes
  useEffect(() => {
    if (visibility === "private" && selectedOrg && selectedRepo && selectedBranch && onChange) {
      onChange({
        organization: selectedOrg,
        repository: selectedRepo,
        branch: selectedBranch
      })
    } else if (visibility === "public" && isPublicUrlValid && publicBranch && onChange) {
      // Extract org/repo from URL
      const match = publicRepoUrl.match(/github\.com\/([\w-]+)\/([\w.-]+)/)
      if (match) {
        onChange({
          organization: match[1],
          repository: `${match[1]}/${match[2]}`,
          branch: publicBranch
        })
      }
    }
  }, [selectedOrg, selectedRepo, selectedBranch, visibility, publicRepoUrl, publicBranch, isPublicUrlValid]) // Removed onChange from dependencies


  // Always show the repository selector UI, even when not authenticated

  return (
    <div className={cn("space-y-6 p-6 bg-background rounded-lg", className)}>

      {/* Repository visibility toggle */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={visibility === "private" ? "default" : "outline"}
          onClick={() => setVisibility("private")}
          className="flex items-center gap-2"
        >
          <Lock className="h-4 w-4" />
          Private Repository
        </Button>
        <Button
          variant={visibility === "public" ? "default" : "outline"}
          onClick={() => setVisibility("public")}
          className="flex items-center gap-2"
        >
          <Globe className="h-4 w-4" />
          Public Repository
        </Button>
      </div>

      {visibility === "private" ? (
        <>
      {/* Organization selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Github className="h-4 w-4" />
            Connected Organizations
          </Label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // Clear all GitHub cache
              for (let key in localStorage) {
                if (key.startsWith('github_cache_')) {
                  localStorage.removeItem(key);
                }
              }
              // Reset state to trigger refetch
              setOrganizations([])
              setAllOrgRepos({})
              setOrgRepos([])
            }}
            className="h-6 px-2 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>
        <Select value={selectedOrg} onValueChange={setSelectedOrg}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select organization">
              {selectedOrg && (
                <div className="flex items-center gap-2">
                  <span>{selectedOrg}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {organizations.map(org => (
              <SelectItem key={org.login} value={org.login}>
                <div className="flex items-center gap-2">
                  {org.type === "Organization" ? (
                    <Building className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  <span>{org.login}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Repository selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm text-muted-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 13V8a2 2 0 0 0-2-2h-2M22 13l-4.5-9M22 13l-10 6M2 13V8a2 2 0 0 1 2-2h2M2 13l4.5-9M2 13l10 6M12 2v17" />
            </svg>
            Select Repo
          </Label>
          <Popover open={repoSearchOpen} onOpenChange={setRepoSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={repoSearchOpen}
                className="w-full justify-between"
              >
                {selectedRepo ? (
                  <span className="truncate">
                    {repositories.find(r => r.full_name === selectedRepo)?.name || selectedRepo}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Search for a repository</span>
                )}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search repositories..."
                  value={repoSearch}
                  onValueChange={setRepoSearch}
                />
                <CommandList>
                  <CommandEmpty>No repository found.</CommandEmpty>
                  <CommandGroup heading={!repoSearch && recentRepos.length > 0 ? "Recent Repositories" : undefined}>
                    <ScrollArea className="h-[300px]">
                      {filteredRepos.map((repo) => (
                        <CommandItem
                          key={repo.id}
                          value={repo.full_name}
                          onSelect={(currentValue) => {
                            setSelectedRepo(currentValue)
                            setRepoSearchOpen(false)
                            // Save to recent repos
                            const selectedRepoData = filteredRepos.find(r => r.full_name === currentValue)
                            if (selectedRepoData) {
                              saveToRecentRepos(selectedRepoData)
                            }
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedRepo === repo.full_name ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{repo.name}</div>
                            {repo.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {repo.description}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </ScrollArea>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Branch selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            Select Branch
          </Label>
          <Select 
            value={selectedBranch} 
            onValueChange={setSelectedBranch}
            disabled={!selectedRepo}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.length === 0 ? (
                <SelectItem value="main">main</SelectItem>
              ) : (
                branches.map(branch => (
                  <SelectItem key={branch.name} value={branch.name}>
                    <div className="flex items-center gap-2">
                      <span>{branch.name}</span>
                      {branch.isDefault && (
                        <Badge variant="secondary" className="text-xs">default</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
        </>
      ) : (
        <>
          {/* Public repository input */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Github className="h-4 w-4" />
                Repository URL
              </Label>
              <Input
                placeholder="https://github.com/owner/repository"
                value={publicRepoUrl}
                onChange={(e) => setPublicRepoUrl(e.target.value)}
                className={cn(
                  "w-full",
                  publicRepoUrl && !isPublicUrlValid && "border-destructive"
                )}
              />
              {publicRepoUrl && !isPublicUrlValid && (
                <p className="text-xs text-destructive">Please enter a valid GitHub repository URL</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm text-muted-foreground">
                <GitBranch className="h-4 w-4" />
                Branch
              </Label>
              <Input
                placeholder="main"
                value={publicBranch}
                onChange={(e) => setPublicBranch(e.target.value)}
                disabled={!isPublicUrlValid}
              />
            </div>
          </div>
        </>
      )}

      {/* Add close/confirm button */}
      {onClose && (
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (visibility === "private" && selectedRepo) {
                onClose()
              } else if (visibility === "public" && isPublicUrlValid) {
                onClose()
              }
            }}
            disabled={
              (visibility === "private" && !selectedRepo) ||
              (visibility === "public" && !isPublicUrlValid)
            }
          >
            Confirm Selection
          </Button>
        </div>
      )}
    </div>
  )
}