"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/trpc/react";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  dataBasis?: string;
  generatedAt?: string;
  intent?: string;
  memoryEnabled?: boolean;
  remembered?: boolean;
  sourceQuestion?: string;
};

const starterPrompts = [
  "What changed in my spending this month?",
  "What bills should I watch this week?",
  "Am I overspending anywhere?",
  "Can I afford my next loan payment?",
  "What should I review before payday?",
];

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function AssistantMessageBubble({
  message,
  onRemember,
  remembering,
}: {
  message: AssistantMessage;
  onRemember?: (message: AssistantMessage) => void;
  remembering?: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl border px-3.5 py-3 text-sm leading-6 shadow-[0_14px_40px_-34px_rgba(10,31,34,0.42)] ${
          isUser
            ? "border-[#17393c]/25 bg-[#17393c] text-white dark:border-primary/25 dark:bg-primary dark:text-primary-foreground"
            : "border-border/75 bg-white/88 text-foreground dark:border-white/8 dark:bg-[#172124]"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.generatedAt ? (
          <p className={`mt-2 text-[0.72rem] ${isUser ? "text-white/65" : "text-muted-foreground"}`}>
            {new Date(message.generatedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        ) : null}
        {!isUser && message.dataBasis ? (
          <p className="mt-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1 text-[0.7rem] leading-4 text-muted-foreground dark:border-white/8 dark:bg-white/5">
            Based on {message.dataBasis}.
          </p>
        ) : null}
        {!isUser && message.memoryEnabled && onRemember ? (
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-2.5 text-[0.7rem]"
              disabled={message.remembered || remembering}
              onClick={() => onRemember(message)}
            >
              {message.remembered ? "Remembered" : remembering ? "Saving..." : "Remember"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    staleTime: 60_000,
  });
  const askAssistant = trpc.assistant.ask.useMutation({
    onSuccess: (result, variables) => {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: result.answer,
          dataBasis: result.dataBasis,
          generatedAt: result.generatedAt,
          intent: result.intent,
          memoryEnabled: result.memoryEnabled,
          sourceQuestion: variables.message,
        },
      ]);
    },
    onError: (error) => {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content:
            error.data?.code === "FORBIDDEN"
              ? "AI coaching is disabled in Settings. Turn it on to use Ask Veyra."
              : error.message,
          generatedAt: new Date().toISOString(),
        },
      ]);
      toast.error("Ask Veyra could not answer", {
        description: error.message,
      });
    },
  });
  const rememberAssistant = trpc.assistant.remember.useMutation({
    onSuccess: () => {
      toast.success("Memory saved", {
        description: "Ask Veyra will use this as a lightweight future hint.",
      });
    },
    onError: (error) => {
      toast.error("Could not save memory", {
        description: error.message,
      });
    },
  });

  const aiEnabled = settingsQuery.data?.allowAiCoaching ?? true;
  const isBusy = askAssistant.isPending;
  const canSend = draft.trim().length >= 3 && !isBusy && aiEnabled;
  const hasMessages = messages.length > 0;

  const assistantStatus = useMemo(() => {
    if (settingsQuery.isLoading) return "Checking settings";
    if (!aiEnabled) return "Disabled";
    return "Read-only";
  }, [aiEnabled, settingsQuery.isLoading]);

  const submitQuestion = (question: string) => {
    const normalized = question.replace(/\s+/g, " ").trim();
    if (normalized.length < 3 || isBusy || !aiEnabled) return;

    setMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role: "user",
        content: normalized,
        generatedAt: new Date().toISOString(),
      },
    ]);
    setDraft("");
    const history = messages.slice(-6).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    askAssistant.mutate({ message: normalized, history });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion(draft);
  };

  return (
    <>
      <div className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="h-12 rounded-full border border-[#17393c]/20 bg-[#17393c] px-4 text-white shadow-[0_18px_50px_-28px_rgba(10,31,34,0.72)] hover:bg-[#21484b] dark:border-primary/20 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
        >
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">Ask Veyra</span>
          <span className="sm:hidden">Ask</span>
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="h-[100dvh] max-w-none gap-0 overflow-hidden rounded-none border-0 bg-[linear-gradient(180deg,rgba(250,249,244,0.98),rgba(243,247,244,0.98))] p-0 data-[side=right]:inset-0 data-[side=right]:w-screen dark:bg-[linear-gradient(180deg,rgba(21,31,33,0.98),rgba(14,22,24,0.98))] sm:rounded-l-[1.4rem] sm:border-l sm:border-white/70 sm:dark:border-white/8 sm:data-[side=right]:inset-y-0 sm:data-[side=right]:right-0 sm:data-[side=right]:left-auto sm:data-[side=right]:w-[28rem] sm:data-[side=right]:max-w-[28rem]"
        >
          <SheetHeader className="border-b border-border/65 px-5 py-4 text-left dark:border-white/8">
            <div className="flex items-start gap-3 pr-8">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#8db8b3]/35 bg-[#dfeee9]/80 text-[#17393c] dark:border-primary/25 dark:bg-primary/12 dark:text-primary">
                <Bot className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-base">Ask Veyra</SheetTitle>
                  <Badge variant="outline" className="bg-white/65 text-[0.7rem] dark:bg-white/5">
                    {assistantStatus}
                  </Badge>
                </div>
                <SheetDescription className="mt-1 text-[0.83rem] leading-5">
                  Private guidance from your tracked money data.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {!aiEnabled ? (
                <div className="rounded-2xl border border-border/70 bg-white/78 p-4 text-sm leading-6 text-muted-foreground dark:border-white/8 dark:bg-white/5">
                  AI coaching is disabled. Enable it in{" "}
                  <Link href="/settings" className="font-medium text-foreground underline underline-offset-4">
                    Settings
                  </Link>{" "}
                  to use Ask Veyra.
                </div>
              ) : !hasMessages ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-white/78 p-4 shadow-[0_18px_50px_-42px_rgba(10,31,34,0.45)] dark:border-white/8 dark:bg-white/5">
                    <p className="text-sm font-medium text-foreground">What would you like to understand?</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Ask about spending, budgets, bills, loans, or account pressure. Veyra answers from
                      deterministic app data.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => submitQuestion(prompt)}
                        className="w-full rounded-2xl border border-border/70 bg-white/72 px-3.5 py-3 text-left text-sm leading-5 text-foreground transition hover:border-[#8db8b3]/45 hover:bg-[#eef7f3] dark:border-white/8 dark:bg-white/5 dark:hover:bg-white/8"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <AssistantMessageBubble
                      key={message.id}
                      message={message}
                      remembering={rememberAssistant.isPending}
                      onRemember={(target) => {
                        if (!target.sourceQuestion || !target.dataBasis) return;
                        rememberAssistant.mutate(
                          {
                            message: target.sourceQuestion,
                            answer: target.content,
                            intent:
                              target.intent === "accounts" ||
                              target.intent === "budgets" ||
                              target.intent === "bills" ||
                              target.intent === "loans" ||
                              target.intent === "spending" ||
                              target.intent === "cashflow" ||
                              target.intent === "general"
                                ? target.intent
                                : "general",
                            dataBasis: target.dataBasis,
                          },
                          {
                            onSuccess: () => {
                              setMessages((current) =>
                                current.map((messageItem) =>
                                  messageItem.id === target.id ? { ...messageItem, remembered: true } : messageItem
                                )
                              );
                            },
                          }
                        );
                      }}
                    />
                  ))}
                  {isBusy ? (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-border/75 bg-white/88 px-3.5 py-3 text-sm text-muted-foreground dark:border-white/8 dark:bg-[#172124]">
                        <Loader2 className="size-4 animate-spin" />
                        Reading Veyra context...
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-border/65 bg-white/62 p-3 dark:border-white/8 dark:bg-[#11191b]/72"
            >
              <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-white/92 p-2 shadow-[0_18px_50px_-44px_rgba(10,31,34,0.45)] dark:border-white/8 dark:bg-[#172124]">
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={aiEnabled ? "Ask about your money..." : "Enable AI coaching in Settings"}
                  disabled={!aiEnabled}
                  rows={2}
                  className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submitQuestion(draft);
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  className="size-10 shrink-0 rounded-full"
                >
                  {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  <span className="sr-only">Send question</span>
                </Button>
              </div>
              <p className="mt-2 px-1 text-[0.72rem] leading-4 text-muted-foreground">
                Read-only guidance. Veyra will not change records from chat.
              </p>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
