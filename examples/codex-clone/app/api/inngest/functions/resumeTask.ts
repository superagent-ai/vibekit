import { inngest } from '@/lib/inngest'
import { Sandbox } from '@e2b/code-interpreter'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { getSubscriptionToken } from '@inngest/realtime'
import { taskChannel, getInngestApp } from '@/lib/inngest'

interface ResumeTaskEvent {
  data: {
    userId: string
    taskId: string
    runId: string
    eventId: string
    savedState?: {
      executedCode?: string[]
      currentStep?: number
      variables?: Record<string, any>
      sandboxId?: string
    }
  }
}

export const resumeTask = inngest.createFunction(
  {
    id: 'resume-task',
    concurrency: {
      limit: 10,
      key: 'event.data.taskId',
    },
  },
  { event: 'clonedx/resume.task' },
  async ({ event, step }: { event: ResumeTaskEvent; step: any }) => {
    const { userId, taskId, runId, eventId, savedState } = event.data

    try {
      // Get subscription token for real-time updates
      const { token } = await step.run('get-subscription-token', async () => {
        const token = await getSubscriptionToken({
          appHost: getInngestApp().host,
          signingKey: process.env.INNGEST_SIGNING_KEY!,
          channelName: createTaskChannel(taskId, userId),
          expirySeconds: 3600,
        })
        return { token }
      })

      // Create communication channel
      const channel = await step.run('create-channel', async () => {
        const realtimeChannel = getTaskChannel()
        return {
          postUpdate: (update: any) => {
            console.log('[resumeTask] Posting update:', update)
            // In production, this would use the actual channel
            // For now, we'll log updates
          }
        }
      })

      // Post initial resuming status
      await channel.postUpdate({
        type: 'task.update',
        task: {
          id: taskId,
          status: 'RESUMING',
          updatedAt: new Date().toISOString(),
        },
      })

      // Resume or create sandbox
      const { sandbox, metadata } = await step.run('resume-sandbox', async () => {
        let sandbox = null
        let metadata: any = {}

        if (savedState?.sandboxId) {
          try {
            console.log('[resumeTask] Attempting to resume sandbox:', savedState.sandboxId)
            sandbox = await Sandbox.resume(savedState.sandboxId, {
              timeoutMs: 60 * 60 * 1000, // 1 hour
            })
            metadata.sandboxId = savedState.sandboxId
            metadata.resumed = true
          } catch (error) {
            console.log('[resumeTask] Failed to resume sandbox, creating new one:', error)
          }
        }

        // If resume failed or no sandbox ID, create new one
        if (!sandbox) {
          sandbox = await Sandbox.create({
            apiKey: process.env.E2B_API_KEY!,
            metadata: {
              taskId,
              userId,
              runId,
            },
          })
          metadata.sandboxId = sandbox.id
          metadata.resumed = false
        }

        return { sandbox, metadata }
      })

      // Restore state if available
      if (savedState && metadata.resumed) {
        await step.run('restore-state', async () => {
          if (savedState.executedCode) {
            // Re-execute previous code to restore state
            for (const code of savedState.executedCode) {
              await sandbox.runCode(code)
            }
          }

          await channel.postUpdate({
            type: 'agent.stateChange',
            state: {
              status: 'restored',
              restoredFrom: savedState,
            },
          })
        })
      }

      // Continue with task execution
      await step.run('continue-execution', async () => {
        await channel.postUpdate({
          type: 'task.update',
          task: {
            id: taskId,
            status: 'IN_PROGRESS',
            updatedAt: new Date().toISOString(),
          },
        })

        // Here you would continue with the actual task logic
        // For now, we'll just mark it as resumed
        await channel.postUpdate({
          type: 'agent.stateChange',
          state: {
            status: 'running',
            sandboxId: metadata.sandboxId,
          },
        })
      })

      return {
        success: true,
        taskId,
        sandboxId: metadata.sandboxId,
        resumed: metadata.resumed,
      }
    } catch (error) {
      console.error('[resumeTask] Error:', error)

      // Post error update
      await step.run('post-error', async () => {
        const channel = getTaskChannel()
        // In production, would post to actual channel
        console.log('[resumeTask] Error update:', {
          type: 'agent.error',
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            code: 'RESUME_ERROR',
          },
        })
      })

      throw error
    }
  }
)