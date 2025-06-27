"use server"

import { Sandbox } from "@e2b/code-interpreter"

export const pauseE2BSandboxAction = async (sandboxId: string) => {
  try {
    console.log('[pauseE2BSandboxAction] Pausing sandbox:', sandboxId)
    
    // Resume the sandbox to get an instance we can pause
    const sandbox = await Sandbox.resume(sandboxId)
    await sandbox.pause()
    
    console.log('[pauseE2BSandboxAction] Sandbox paused successfully')
    return { success: true, status: 'paused' }
  } catch (error) {
    console.error('[pauseE2BSandboxAction] Failed to pause sandbox:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to pause sandbox: ${errorMessage}`)
  }
}

export const resumeE2BSandboxAction = async (sandboxId: string) => {
  try {
    console.log('[resumeE2BSandboxAction] Resuming sandbox:', sandboxId)
    
    // Resume the sandbox
    const sandbox = await Sandbox.resume(sandboxId, {
      timeoutMs: 60 * 60 * 1000, // 1 hour (max allowed)
    })
    
    console.log('[resumeE2BSandboxAction] Sandbox resumed successfully')
    return { 
      success: true, 
      status: 'running',
      sandboxId: sandbox.sandboxId 
    }
  } catch (error) {
    console.error('[resumeE2BSandboxAction] Failed to resume sandbox:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to resume sandbox: ${errorMessage}`)
  }
}

export const getE2BSandboxStatusAction = async (sandboxId: string) => {
  try {
    console.log('[getE2BSandboxStatusAction] Checking sandbox status:', sandboxId)
    
    const response = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
      method: 'GET',
      headers: {
        'X-API-KEY': process.env.E2B_API_KEY!,
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        return { exists: false, status: 'not_found' }
      }
      throw new Error(`Failed to get sandbox status: ${response.statusText}`)
    }
    
    const sandbox = await response.json()
    console.log('[getE2BSandboxStatusAction] Sandbox status:', sandbox.status)
    
    return {
      exists: true,
      status: sandbox.status || 'unknown',
      createdAt: sandbox.createdAt,
      expiresAt: sandbox.expiresAt,
      template: sandbox.template,
    }
  } catch (error) {
    console.error('[getE2BSandboxStatusAction] Failed to get sandbox status:', error)
    throw error
  }
}