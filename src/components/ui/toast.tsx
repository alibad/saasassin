"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Toast notifications on the Radix Toast primitive, styled with the theme tokens.
 * Call `toast({ title, description })` from anywhere; render one <Toaster /> per page.
 * Several components may each render a <Toaster />: only the first one mounted shows toasts.
 */

type ToastVariant = "default" | "destructive"

export type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
  /** Milliseconds; defaults to 5000. */
  duration?: number
}

type ToastItem = ToastInput & { id: number; open: boolean }

let items: ToastItem[] = []
let nextId = 1
let hostId: string | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot() {
  return items
}

const emptyItems: ToastItem[] = []

function serverSnapshot() {
  return emptyItems
}

function hostSnapshot() {
  return hostId
}

function serverHostSnapshot() {
  return null
}

const hosts: string[] = []

function claimHost(id: string) {
  if (!hosts.includes(id)) hosts.push(id)
  if (hostId !== hosts[0]) {
    hostId = hosts[0]
    emit()
  }
}

function releaseHost(id: string) {
  const index = hosts.indexOf(id)
  if (index >= 0) hosts.splice(index, 1)
  const next = hosts[0] ?? null
  if (hostId !== next) {
    hostId = next
    emit()
  }
}

export function toast(input: ToastInput) {
  const id = nextId++
  items = [...items.slice(-3), { ...input, id, open: true }]
  emit()
  return id
}

function dismiss(id: number) {
  items = items.map((item) => (item.id === id ? { ...item, open: false } : item))
  emit()
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id)
    emit()
  }, 300)
}

function Toaster({ className }: { className?: string }) {
  const toasts = React.useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const host = React.useSyncExternalStore(subscribe, hostSnapshot, serverHostSnapshot)
  const myId = React.useId()

  React.useEffect(() => {
    claimHost(myId)
    return () => releaseHost(myId)
  }, [myId])

  if (host !== myId) return null

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          open={item.open}
          duration={item.duration ?? 5000}
          onOpenChange={(open) => {
            if (!open) dismiss(item.id)
          }}
          data-variant={item.variant ?? "default"}
          className={cn(
            "group/toast pointer-events-auto relative grid w-full gap-1 rounded-[var(--radius)] border bg-popover p-3 pr-9 text-popover-foreground shadow-lg ring-1 ring-foreground/5",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:animate-out",
            "data-[variant=destructive]:border-destructive/40 data-[variant=destructive]:text-destructive"
          )}
        >
          <ToastPrimitive.Title className="text-sm font-medium">{item.title}</ToastPrimitive.Title>
          {item.description ? (
            <ToastPrimitive.Description className="text-sm text-muted-foreground">
              {item.description}
            </ToastPrimitive.Description>
          ) : null}
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport
        className={cn(
          "fixed right-0 bottom-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 outline-none sm:max-w-sm",
          className
        )}
      />
    </ToastPrimitive.Provider>
  )
}

export { Toaster }
