"use client"
import { useState, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, Check, Star, GitFork, Building, User } from "lucide-react"

interface SmartRepositorySelectorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SmartRepositorySelector({
  value,
  onChange,
  className
}: SmartRepositorySelectorProps) {
  const [organizations, setOrganizations] = useState<any[]>([])
  const [selectedOrg, setSelectedOrg] = useState<string>("")
  const [orgRepos, setOrgRepos] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  
  // Fetch organizations once
  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const res = await fetch('/api/auth/github/organizations', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data.organizations) {
            setOrganizations(data.organizations)
            // Auto-select first org
            if (data.organizations.length > 0 && !selectedOrg) {
              setSelectedOrg(data.organizations[0].login)
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch organizations:', error)
      }
    }
    
    fetchOrgs()
  }, [])
  
  // Fetch repos for selected org
  useEffect(() => {
    if (!selectedOrg) return
    
    const fetchRepos = async () => {
      setIsLoading(true)
      try {
        const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''
        const res = await fetch(
          `/api/auth/github/org-repos?org=${encodeURIComponent(selectedOrg)}${searchParam}`,
          { credentials: 'include' }
        )
        if (res.ok) {
          const data = await res.json()
          setOrgRepos(data.repositories || [])
        }
      } catch (error) {
        console.error('Failed to fetch repos:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    // Debounce search
    const timeoutId = setTimeout(fetchRepos, 300)
    return () => clearTimeout(timeoutId)
  }, [selectedOrg, searchQuery])
  
  const handleRepoSelect = (repoFullName: string) => {
    onChange(repoFullName)
  }

  return (
    <div className={className}>
      {/* Organization selector */}
      <div className="flex gap-2 mb-4">
        {organizations.map(org => (
          <button
            key={org.login}
            onClick={() => setSelectedOrg(org.login)}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-md text-sm
              ${selectedOrg === org.login 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary hover:bg-secondary/80'
              }
            `}
          >
            {org.type === "Organization" ? (
              <Building className="h-3 w-3" />
            ) : (
              <User className="h-3 w-3" />
            )}
            {org.login}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Repository list */}
      <ScrollArea className="h-[300px] border rounded-md">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">
            Loading repositories...
          </div>
        ) : orgRepos.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            No repositories found
          </div>
        ) : (
          <div className="p-2">
            {orgRepos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => handleRepoSelect(repo.full_name)}
                className={`
                  w-full text-left p-3 rounded-md mb-2 transition-colors
                  ${value === repo.full_name
                    ? "bg-primary/10 border border-primary"
                    : "hover:bg-muted"
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{repo.name}</span>
                      {repo.private && (
                        <span className="text-xs px-1.5 py-0.5 bg-muted rounded">
                          Private
                        </span>
                      )}
                      {repo.fork && <GitFork className="h-3 w-3" />}
                    </div>
                    {repo.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {repo.language && <span>{repo.language}</span>}
                      {repo.stargazers_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          {repo.stargazers_count}
                        </span>
                      )}
                      <span>
                        Updated {new Date(repo.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {value === repo.full_name && (
                    <Check className="h-5 w-5 text-primary shrink-0 ml-2" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}