"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { inferRouterInputs } from "@trpc/server";
import { Bot, Brain, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { AppRouter } from "@/server/api/root";
import { updateSettingsSchema } from "@/features/settings/server/schema";
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

type RouterInputs = inferRouterInputs<AppRouter>;
type UpdateSettingsInput = RouterInputs["settings"]["update"];

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  dataBasis?: string;
  generatedAt?: string;
  intent?: string;
};

type SessionMemoryMode = "unknown" | "temporary" | "remember";

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

function serializeSessionMessages(messages: AssistantMessage[]) {
  return messages.slice(-12).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function sessionModeCardClassName(selected = false) {
  return [
    "w-full rounded-[1.15rem] border px-4 py-3.5 text-left transition",
    "whitespace-normal break-words",
    selected
      ? "border-[#0f766e] bg-[#eef7f3] shadow-[inset_0_0_0_2px_rgba(15,118,110,0.55)] dark:border-primary/60 dark:bg-primary/10"
      : "border-border/70 bg-white/72 hover:border-[#8db8b3]/45 hover:bg-[#eef7f3] dark:border-white/8 dark:bg-white/5 dark:hover:bg-white/8",
  ].join(" ");
}

function AssistantMessageBubble({ message }: { message: AssistantMessage }) {
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
      </div>
    </div>
  );
}

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [sessionMemoryMode, setSessionMemoryMode] = useState<SessionMemoryMode>("unknown");
  const [sessionMemoryId, setSessionMemoryId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    staleTime: 60_000,
  });
  const utils = trpc.useUtils();
  const askAssistant = trpc.assistant.ask.useMutation({
    onSuccess: (result) => {
      const assistantMessage: AssistantMessage = {
        id: createMessageId(),
        role: "assistant",
        content: result.answer,
        dataBasis: result.dataBasis,
        generatedAt: result.generatedAt,
        intent: result.intent,
      };
      let nextMessages: AssistantMessage[] = [];
      setMessages((current) => {
        nextMessages = [...current, assistantMessage];
        return nextMessages;
      });

      if (sessionMemoryMode === "remember" && result.memoryEnabled) {
        rememberAssistantSession.mutate({
          memoryId: sessionMemoryId ?? undefined,
          messages: serializeSessionMessages(nextMessages),
        });
      }
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
  const rememberAssistantSession = trpc.assistant.rememberSession.useMutation({
    onSuccess: (result) => {
      if (!result.saved) return;
      setSessionMemoryId(result.memoryId);
    },
    onError: (error) => {
      toast.error("Could not save session memory", {
        description: error.message,
      });
    },
  });
  const enableAssistantMemory = trpc.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.get.invalidate();
      setSessionMemoryMode("remember");
      toast.success("Session memory enabled", {
        description: "Ask Veyra will save a compact summary for this session.",
      });
    },
    onError: (error) => {
      toast.error("Could not enable session memory", {
        description: error.message,
      });
    },
  });

  const aiEnabled = settingsQuery.data?.allowAiCoaching ?? true;
  const memoryAvailable = settingsQuery.data?.allowAssistantMemory ?? false;
  const isBusy = askAssistant.isPending;
  const canSend = draft.trim().length >= 3 && !isBusy && aiEnabled && sessionMemoryMode !== "unknown";
  const hasMessages = messages.length > 0;

  const assistantStatus = useMemo(() => {
    if (settingsQuery.isLoading) return "Checking settings";
    if (!aiEnabled) return "Disabled";
    if (sessionMemoryMode === "remember") return "Memory on";
    if (sessionMemoryMode === "temporary") return "Temporary";
    return "Choose session mode";
  }, [aiEnabled, sessionMemoryMode, settingsQuery.isLoading]);

  const submitQuestion = (question: string) => {
    const normalized = question.replace(/\s+/g, " ").trim();
    if (normalized.length < 3 || isBusy || !aiEnabled || sessionMemoryMode === "unknown") return;

    const userMessage: AssistantMessage = {
      id: createMessageId(),
      role: "user",
      content: normalized,
      generatedAt: new Date().toISOString(),
    };
    let nextMessages: AssistantMessage[] = [];
    setMessages((current) => {
      nextMessages = [...current, userMessage];
      return nextMessages;
    });
    setDraft("");
    const history = nextMessages.slice(0, -1).slice(-6).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    askAssistant.mutate({ message: normalized, history });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion(draft);
  };

  const handleEnableSessionMemory = () => {
    if (!settingsQuery.data || enableAssistantMemory.isPending) return;
    const nextSettings = updateSettingsSchema.parse({
      defaultCurrency: settingsQuery.data.defaultCurrency,
      locale: settingsQuery.data.locale,
      weekStartsOn: settingsQuery.data.weekStartsOn,
      dateFormat: settingsQuery.data.dateFormat,
      timezone: settingsQuery.data.timezone,
      allowAiCoaching: settingsQuery.data.allowAiCoaching,
      allowAssistantMemory: true,
      allowUsageAnalytics: settingsQuery.data.allowUsageAnalytics,
    }) satisfies UpdateSettingsInput;
    enableAssistantMemory.mutate(nextSettings);
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
              ) : sessionMemoryMode === "unknown" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-white/78 p-4 shadow-[0_18px_50px_-42px_rgba(10,31,34,0.45)] dark:border-white/8 dark:bg-white/5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-[#8db8b3]/35 bg-[#dfeee9]/80 text-[#17393c] dark:border-primary/25 dark:bg-primary/12 dark:text-primary">
                        <Brain className="size-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Choose how this chat should behave</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          Ask Veyra chats are temporary. If the page refreshes or you log out, this session will disappear.
                          If you turn memory on, Veyra will save a compact AI summary of the session instead of the full chat.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2.5">
                      <button
                        type="button"
                        className={sessionModeCardClassName(false)}
                        onClick={() => setSessionMemoryMode("temporary")}
                      >
                        <span className="block">
                          <span className="block text-sm font-medium text-foreground">Keep this session temporary</span>
                          <span className="mt-0.5 block text-[0.78rem] font-normal leading-5 text-muted-foreground">
                            Nothing gets remembered after the session ends.
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={sessionModeCardClassName(false)}
                        onClick={() => {
                          if (memoryAvailable) {
                            setSessionMemoryMode("remember");
                            return;
                          }
                          handleEnableSessionMemory();
                        }}
                        disabled={!settingsQuery.data || enableAssistantMemory.isPending}
                      >
                        <span className="block">
                          <span className="block text-sm font-medium text-foreground">Turn on session memory</span>
                          <span className="mt-0.5 block text-[0.78rem] font-normal leading-5 text-muted-foreground">
                            {memoryAvailable
                              ? "Save a compact summary so future chats have better context."
                              : "Enable memory now and save a compact summary for future chats."}
                          </span>
                        </span>
                      </button>
                    </div>
                    {!memoryAvailable ? (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
                        <p className="text-[0.76rem] leading-5 text-muted-foreground">
                          Session memory is currently off. You can enable it here without leaving chat.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full px-3 hover:bg-muted"
                          onClick={handleEnableSessionMemory}
                          disabled={!settingsQuery.data || enableAssistantMemory.isPending}
                        >
                          {enableAssistantMemory.isPending ? (
                            <>
                              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                              Enabling
                            </>
                          ) : (
                            "Enable memory"
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : !hasMessages ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-white/78 p-4 shadow-[0_18px_50px_-42px_rgba(10,31,34,0.45)] dark:border-white/8 dark:bg-white/5">
                    <p className="text-sm font-medium text-foreground">What would you like to understand?</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Ask about spending, budgets, bills, loans, or account pressure. Veyra answers from
                      deterministic app data.
                    </p>
                    <p className="mt-2 text-[0.76rem] leading-5 text-muted-foreground">
                      {sessionMemoryMode === "remember"
                        ? "Session memory is on. Veyra will keep updating one compact summary as you chat."
                        : "This session is temporary and will reset on refresh or logout."}
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
                    <AssistantMessageBubble key={message.id} message={message} />
                  ))}
                  {isBusy ? (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-border/75 bg-white/88 px-3.5 py-3 text-sm text-muted-foreground dark:border-white/8 dark:bg-[#172124]">
                        <Loader2 className="size-4 animate-spin" />
                        Reading Veyra context...
                      </div>
                    </div>
                  ) : null}
                  {sessionMemoryMode === "remember" && hasMessages ? (
                    <p className="px-1 text-[0.72rem] leading-4 text-muted-foreground">
                      {rememberAssistantSession.isPending
                        ? "Updating session memory..."
                        : sessionMemoryId
                          ? "Session memory is being kept as a compact summary."
                          : "Session memory will be saved as a compact summary."}
                    </p>
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
                  placeholder={
                    !aiEnabled
                      ? "Enable AI coaching in Settings"
                      : sessionMemoryMode === "unknown"
                        ? "Choose a session mode first"
                        : "Ask about your money..."
                  }
                  disabled={!aiEnabled || sessionMemoryMode === "unknown"}
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
