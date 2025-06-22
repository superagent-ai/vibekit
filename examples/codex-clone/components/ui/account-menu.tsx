"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { ChevronDown, Settings, Keyboard, LogOut, Globe, Shield, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useGitHubAuth } from "@/hooks/use-github-auth"

interface AccountMenuProps {
  user?: {
    name: string
    email: string
    avatar_url?: string
  }
}

export function AccountMenu({ user }: AccountMenuProps) {
  const { logout } = useGitHubAuth()
  const [isOpen, setIsOpen] = React.useState(false)

  if (!user) {
    return null
  }

  const initials = user.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 h-auto"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
            {user.avatar_url ? (
              <Image 
                src={user.avatar_url} 
                alt={user.name} 
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              initials
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </Button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40 cursor-pointer" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-64 bg-popover border rounded-lg shadow-lg z-50">
            <div className="p-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                  {user.avatar_url ? (
                    <Image 
                      src={user.avatar_url} 
                      alt={user.name} 
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{user.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground mb-2">Personal account</div>
              
              <Separator className="my-2" />
              
              <div className="space-y-1">
                <Link href="/settings" className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                  <Settings className="h-4 w-4" />
                  <span>General</span>
                </Link>
                
                <Link href="/settings/environments" className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                  <Globe className="h-4 w-4" />
                  <span>Environments</span>
                </Link>
                
                <Link href="/settings/data-controls" className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                  <Shield className="h-4 w-4" />
                  <span>Data controls</span>
                </Link>
                
                <Link href="/settings/account" className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                  <User className="h-4 w-4" />
                  <span>Account</span>
                </Link>
                
                <Separator className="my-2" />
                
                <button className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                  <Keyboard className="h-4 w-4" />
                  <span>Keyboard shortcuts</span>
                </button>
                
                <Separator className="my-2" />
                
                <button 
                  onClick={() => {
                    logout()
                    setIsOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}