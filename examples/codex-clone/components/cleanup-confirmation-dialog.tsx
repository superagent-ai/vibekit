"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle, Trash2 } from "lucide-react"

interface CleanupConfirmationDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  sandboxId?: string
}

export function CleanupConfirmationDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  sandboxId
}: CleanupConfirmationDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <AlertDialogTitle>Terminate Sandbox Environment?</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                This action will permanently terminate the sandbox environment and all its resources.
              </p>
              
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-2">
                <p className="font-semibold">⚠️ Warning: This will result in:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Loss of all unsaved work in the sandbox</li>
                  <li>Deletion of all files and code changes</li>
                  <li>Termination of all running processes</li>
                  <li>Loss of installed packages and dependencies</li>
                  <li>Removal of all environment configurations</li>
                </ul>
              </div>
              
              <p className="text-muted-foreground">
                Sandbox ID: <code className="text-xs bg-muted px-1 py-0.5 rounded">{sandboxId || 'Unknown'}</code>
              </p>
              
              <p className="font-medium">
                This action cannot be undone. Are you sure you want to continue?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Yes, Terminate Sandbox
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}