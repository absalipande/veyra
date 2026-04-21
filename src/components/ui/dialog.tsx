"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
      <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/20 supports-backdrop-filter:backdrop-blur-xs dark:bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-300 data-[state=open]:duration-500",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  mobileBehavior = "drawer",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  mobileBehavior?: "drawer" | "modal" | "adaptive"
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-mobile-behavior={mobileBehavior}
        className={cn(
          "fixed z-50 flex flex-col bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 outline-none",
          mobileBehavior === "drawer"
            ? "inset-y-0 right-0 h-[100dvh] w-screen max-w-none rounded-none translate-x-0 translate-y-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-10 data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-10 md:inset-y-auto md:left-1/2 md:right-auto md:top-[50svh] md:h-auto md:w-auto md:translate-x-[-50%] md:translate-y-[-50%] md:data-[state=open]:slide-in-from-right-0 md:data-[state=closed]:slide-out-to-right-0 md:data-[state=open]:zoom-in-95 md:data-[state=closed]:zoom-out-95"
            : mobileBehavior === "adaptive"
              ? "inset-x-0 bottom-0 top-auto h-[min(94dvh,calc(100dvh-0.5rem))] w-full max-w-none rounded-b-none rounded-t-[1.1rem] translate-x-0 translate-y-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-10 md:inset-y-0 md:left-auto md:right-0 md:top-0 md:h-[100dvh] md:w-full md:max-w-[23.75rem] lg:max-w-[26.25rem] md:rounded-none md:rounded-l-[1.1rem] md:border-l md:border-border/70 md:shadow-[-8px_0_24px_rgba(0,0,0,0.08)] md:data-[state=open]:slide-in-from-right-10 md:data-[state=closed]:slide-out-to-right-10"
              : "left-1/2 top-[50svh] max-h-[calc(100svh-1.5rem)] w-full max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 sm:max-h-[calc(100svh-2rem)] sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute right-3 top-3 rounded-full border border-border/70 bg-background/85 text-foreground shadow-sm hover:bg-muted/85 dark:bg-[#182123] dark:hover:bg-[#1f2a2c]"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
