"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CategoryItem = RouterOutputs["categories"]["list"][number];
type CategoryKind = CategoryItem["kind"];

type CategoryDraft = {
  id: string | null;
  kind: CategoryKind;
  name: string;
};

const initialDraft: CategoryDraft = {
  id: null,
  kind: "expense",
  name: "",
};

type DeleteTarget = {
  id: string;
  name: string;
} | null;

function getKindMeta(kind: CategoryKind) {
  if (kind === "income") {
    return {
      description: "Useful for salary, side income, reimbursements, and other inflows.",
      icon: TrendingUp,
      label: "Income",
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
    };
  }

  return {
    description: "Useful for groceries, food, bills, transport, and other spending.",
    icon: TrendingDown,
    label: "Expense",
    tone: "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  };
}

type CategoriesWorkspaceProps = {
  initialQuery?: string;
};

export function CategoriesWorkspace({ initialQuery = "" }: CategoriesWorkspaceProps) {
  const utils = trpc.useUtils();
  const categoriesQuery = trpc.categories.list.useQuery();
  const summaryQuery = trpc.categories.summary.useQuery();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(initialQuery);
  const [kindFilter, setKindFilter] = useState<"all" | CategoryKind>("all");
  const [draft, setDraft] = useState<CategoryDraft>(initialDraft);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const summaryScrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeSummaryIndex, setActiveSummaryIndex] = useState(0);

  const refreshCategories = async () => {
    await Promise.all([
      utils.categories.list.invalidate(),
      utils.categories.summary.invalidate(),
      utils.transactions.list.invalidate(),
    ]);
  };

  const createCategory = trpc.categories.create.useMutation({
    onSuccess: async () => {
      await refreshCategories();
      setDraft(initialDraft);
      setOpen(false);
      toast.success("Category created", {
        description: "It is now available in the transaction composer.",
      });
    },
    onError: (error) => {
      toast.error("Could not create category", {
        description: error.message,
      });
    },
  });

  const updateCategory = trpc.categories.update.useMutation({
    onSuccess: async () => {
      await refreshCategories();
      setDraft(initialDraft);
      setOpen(false);
      toast.success("Category updated", {
        description: "The changes are now reflected across your workspace.",
      });
    },
    onError: (error) => {
      toast.error("Could not update category", {
        description: error.message,
      });
    },
  });

  const deleteCategory = trpc.categories.remove.useMutation({
    onSuccess: async () => {
      const name = deleteTarget?.name;
      await refreshCategories();
      setDeleteTarget(null);
      toast.success("Category deleted", {
        description: name ? `"${name}" was removed from your workspace.` : "The category was removed.",
      });
    },
    onError: (error) => {
      toast.error("Could not delete category", {
        description: error.message,
      });
    },
  });

  const visibleCategories = useMemo(() => {
    const items = categoriesQuery.data ?? [];
    const normalized = search.trim().toLowerCase();

    return items.filter((category) => {
      const matchesKind = kindFilter === "all" || category.kind === kindFilter;
      const matchesSearch =
        normalized.length === 0 ||
        category.name.toLowerCase().includes(normalized) ||
        category.kind.toLowerCase().includes(normalized);

      return matchesKind && matchesSearch;
    });
  }, [categoriesQuery.data, kindFilter, search]);

  const expenseCategories = visibleCategories.filter((category) => category.kind === "expense");
  const incomeCategories = visibleCategories.filter((category) => category.kind === "income");
  const summaryCards = [
    {
      label: "Categories",
      value: String(summaryQuery.data?.totalCategories ?? 0),
      detail: "Keep the list compact and useful for real transaction capture.",
    },
    {
      label: "Expense",
      value: String(summaryQuery.data?.expenseCategories ?? 0),
      detail: "Spending categories for expenses, budgets, and future insights.",
    },
    {
      label: "Income",
      value: String(summaryQuery.data?.incomeCategories ?? 0),
      detail: "Inflow categories for salary, reimbursements, and other incoming money.",
    },
  ];

  useEffect(() => {
    if (!summaryScrollerRef.current) return;

    const handleScroll = () => {
      const scroller = summaryScrollerRef.current;
      if (!scroller) return;

      const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-summary-slide]"));
      if (cards.length === 0) return;

      const scrollerCenter = scroller.scrollLeft + scroller.clientWidth / 2;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - scrollerCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveSummaryIndex(closestIndex);
    };

    handleScroll();
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;
    scroller.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
    };
  }, [summaryCards.length]);

  const scrollSummaryCards = (index: number) => {
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;

    const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-summary-slide]"));
    const nextCard = cards[index];
    if (!nextCard) return;

    nextCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  };

  const openCreateDialog = () => {
    setDraft(initialDraft);
    setOpen(true);
  };

  const openEditDialog = (category: CategoryItem) => {
    setDraft({
      id: category.id,
      kind: category.kind,
      name: category.name,
    });
    setOpen(true);
  };

  const submitCategory = () => {
    if (!draft.name.trim()) return;

    if (draft.id) {
      updateCategory.mutate({
        id: draft.id,
        kind: draft.kind,
        name: draft.name,
      });
      return;
    }

    createCategory.mutate({
      kind: draft.kind,
      name: draft.name,
    });
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="space-y-4">
        <div
          ref={summaryScrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {summaryCards.map((card) => (
            <div
              key={card.label}
              data-summary-slide
              className="min-w-0 shrink-0 basis-full snap-center"
            >
              <Card className="border-white/75 bg-white/84 shadow-[0_20px_60px_-52px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123]">
                <CardContent className="p-5">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-2 text-[1.8rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                    {card.value}
                  </p>
                  <p className="mt-2 text-[0.92rem] leading-6 text-muted-foreground">
                    {card.detail}
                  </p>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {summaryCards.length > 1 ? (
          <div className="flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2">
              {summaryCards.map((card, index) => (
                <button
                  key={card.label}
                  type="button"
                  aria-label={`Go to ${card.label}`}
                  aria-pressed={activeSummaryIndex === index}
                  className={`h-2.5 rounded-full transition-all ${
                    activeSummaryIndex === index ? "w-6 bg-primary" : "w-2.5 bg-border"
                  }`}
                  onClick={() => scrollSummaryCards(index)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() => scrollSummaryCards(Math.max(0, activeSummaryIndex - 1))}
                disabled={activeSummaryIndex === 0}
              >
                <span aria-hidden="true">‹</span>
                <span className="sr-only">Previous summary card</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() =>
                  scrollSummaryCards(Math.min(summaryCards.length - 1, activeSummaryIndex + 1))
                }
                disabled={activeSummaryIndex === summaryCards.length - 1}
              >
                <span aria-hidden="true">›</span>
                <span className="sr-only">Next summary card</span>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="hidden gap-4 md:grid md:grid-cols-3">
          {summaryCards.map((card) => (
            <Card
              key={card.label}
              className="border-white/75 bg-white/84 shadow-[0_20px_60px_-52px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123]"
            >
              <CardContent className="p-5">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-2 text-[1.8rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  {card.value}
                </p>
                <p className="mt-2 text-[0.92rem] leading-6 text-muted-foreground">
                  {card.detail}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123]">
          <CardHeader className="gap-5 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-[1.45rem] tracking-tight text-[#10292B] dark:text-foreground">
                  Categories
                </CardTitle>
                <CardDescription className="max-w-2xl text-[0.96rem] leading-7">
                  Create a small, durable category set first, then let transactions point into it
                  through a simple dropdown.
                </CardDescription>
              </div>

              <Button
                type="button"
                className="w-auto self-start rounded-full bg-[#17393c] hover:bg-[#1d4a4d]"
                onClick={openCreateDialog}
              >
                <Plus className="size-4" />
                Create category
              </Button>
            </div>

            <div className="space-y-3">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search categories"
                  className="h-12 rounded-full border-border/70 bg-[#fbfaf6] pl-10 pr-4 text-[0.92rem] dark:bg-[#162022]"
                />
              </div>
              <div className="flex gap-2 md:hidden">
                {[
                  { label: "All", value: "all" as const },
                  { label: "Expense", value: "expense" as const },
                  { label: "Income", value: "income" as const },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={kindFilter === option.value ? "default" : "outline"}
                    className={`flex-1 rounded-full ${
                      kindFilter === option.value
                        ? "bg-[#17393c] text-white hover:bg-[#1d4a4d]"
                        : ""
                    }`}
                    onClick={() => setKindFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="hidden md:block">
                <Select
                  value={kindFilter}
                  onValueChange={(value) => setKindFilter(value as "all" | CategoryKind)}
                >
                  <SelectTrigger className="h-12 rounded-full border-border/70 bg-[#fbfaf6] px-4 text-[0.92rem] dark:bg-[#162022]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
            {categoriesQuery.isLoading ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-[1.5rem] border border-border/70 bg-[#fbfaf6] dark:bg-[#162022]"
                  />
                ))}
              </div>
            ) : visibleCategories.length === 0 ? (
              <div className="rounded-[1.8rem] border border-dashed border-border/80 bg-[#fbfaf6] px-6 py-12 text-center dark:bg-[#162022]">
                <p className="text-[1.35rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  No categories yet
                </p>
                <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-8 text-muted-foreground">
                  Start with a few high-signal labels like Groceries, Food, Salary, or Bills, then
                  expand only when the list stays useful.
                </p>
                <Button
                  type="button"
                  className="mt-5 rounded-full bg-[#17393c] hover:bg-[#1d4a4d]"
                  onClick={openCreateDialog}
                >
                  <Plus className="size-4" />
                  Create first category
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-4 md:hidden">
                  {[
                    { items: expenseCategories, kind: "expense" as const },
                    { items: incomeCategories, kind: "income" as const },
                  ]
                    .filter((group) => group.items.length > 0)
                    .map((group) => {
                      const meta = getKindMeta(group.kind);
                      const Icon = meta.icon;

                      return (
                        <div key={group.kind} className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-[#10292B] dark:text-foreground">
                              <Icon className="size-4.5" />
                              <p className="text-[1rem] font-semibold tracking-tight">
                                {meta.label}
                              </p>
                            </div>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${meta.tone}`}
                            >
                              {group.items.length}
                            </span>
                          </div>

                          <div className="space-y-3">
                            {group.items.map((category) => (
                              <div
                                key={category.id}
                                className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-border/70 bg-[#fdfcf8] px-4 py-3 dark:bg-[#141d1f]"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                                    {category.name}
                                  </p>
                                  <p className="mt-1 text-[0.8rem] text-muted-foreground">
                                    Used for {category.kind} events.
                                  </p>
                                </div>

                                <div className="flex shrink-0 gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="rounded-full"
                                    onClick={() => openEditDialog(category)}
                                  >
                                    <Pencil className="size-4" />
                                    <span className="sr-only">Edit category</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="rounded-full text-destructive hover:text-destructive"
                                    onClick={() =>
                                      setDeleteTarget({ id: category.id, name: category.name })
                                    }
                                  >
                                    <Trash2 className="size-4" />
                                    <span className="sr-only">Delete category</span>
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="hidden gap-4 md:grid xl:grid-cols-2">
                {[
                  { items: expenseCategories, kind: "expense" as const },
                  { items: incomeCategories, kind: "income" as const },
                ]
                  .filter((group) => group.items.length > 0)
                  .map((group) => {
                    const meta = getKindMeta(group.kind);
                    const Icon = meta.icon;

                    return (
                      <div
                        key={group.kind}
                        className="rounded-[1.7rem] border border-border/70 bg-[#fdfcf8] p-4 dark:bg-[#141d1f]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 text-[#10292B] dark:text-foreground">
                              <Icon className="size-4.5" />
                              <p className="text-[1.05rem] font-semibold tracking-tight">
                                {meta.label}
                              </p>
                            </div>
                            <p className="mt-1 text-[0.84rem] leading-6 text-muted-foreground">
                              {meta.description}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${meta.tone}`}
                          >
                            {group.items.length}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          {group.items.map((category) => (
                            <div
                              key={category.id}
                              className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-border/70 bg-white/85 px-4 py-3 dark:bg-[#182123]"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                                  {category.name}
                                </p>
                                <p className="mt-1 text-[0.8rem] text-muted-foreground">
                                  Used for {category.kind} events.
                                </p>
                              </div>

                              <div className="flex shrink-0 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  className="rounded-full"
                                  onClick={() => openEditDialog(category)}
                                >
                                  <Pencil className="size-4" />
                                  <span className="sr-only">Edit category</span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  className="rounded-full text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setDeleteTarget({ id: category.id, name: category.name })
                                  }
                                >
                                  <Trash2 className="size-4" />
                                  <span className="sr-only">Delete category</span>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && !createCategory.isPending && !updateCategory.isPending) {
            setDraft(initialDraft);
          }
        }}
      >
        <DialogContent className="max-h-[calc(86dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.45rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] sm:max-h-[92vh] sm:max-w-xl sm:rounded-[1.9rem]">
          <DialogHeader className="border-b border-border/70 px-4 pb-3.5 pt-[max(0.85rem,env(safe-area-inset-top))] pr-12 sm:px-7 sm:pb-5 sm:pt-7 sm:pr-16">
            <div className="inline-flex w-fit rounded-lg border border-[#17393c]/10 bg-[#17393c]/5 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary sm:rounded-full sm:px-3 sm:text-[0.68rem] sm:tracking-[0.22em]">
              Category setup
            </div>
            <DialogTitle className="pt-1.5 text-[1.2rem] tracking-tight text-[#10292B] dark:text-foreground sm:pt-3 sm:text-[1.8rem]">
              {draft.id ? "Edit category" : "Create a category"}
            </DialogTitle>
            <DialogDescription className="max-w-md text-[0.82rem] leading-6 sm:text-[0.95rem] sm:leading-7">
              Keep names short and durable so they stay useful as transaction filters and dropdown
              options.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-7 sm:py-6">
            <div className="space-y-3">
              <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                Category name
              </label>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Groceries"
                className="h-9 rounded-lg border-border/80 bg-background px-3 text-sm sm:h-13 sm:rounded-[1.35rem] sm:px-5 sm:text-base"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                Type
              </label>
              <Select
                value={draft.kind}
                onValueChange={(value) => setDraft((current) => ({ ...current, kind: value as CategoryKind }))}
              >
                <SelectTrigger className="h-9 rounded-lg border-border/80 bg-background px-3 text-sm sm:h-13 sm:rounded-[1.35rem] sm:px-5 sm:text-base">
                  <SelectValue placeholder="Category type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-border/70 bg-[#fbfaf6] px-3.5 py-3 text-[0.76rem] leading-5 text-muted-foreground dark:bg-[#162022] sm:rounded-[1.3rem] sm:px-4 sm:text-[0.83rem] sm:leading-6">
              Categories show up as dropdown choices inside the transaction composer. Start narrow
              and expand only when a new label would genuinely change how you review spending.
            </div>

            <DialogFooter className="!-mx-0 !-mb-0 flex-row items-center justify-end gap-2 bg-transparent px-0 pt-1.5 sm:pt-2 [&>button]:w-auto">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg text-sm sm:h-10 sm:rounded-full sm:text-base"
                onClick={() => setOpen(false)}
                disabled={createCategory.isPending || updateCategory.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-9 rounded-lg bg-[#17393c] text-sm hover:bg-[#1d4a4d] sm:h-10 sm:rounded-full sm:text-base"
                onClick={submitCategory}
                disabled={createCategory.isPending || updateCategory.isPending}
              >
                {createCategory.isPending || updateCategory.isPending
                  ? "Saving..."
                  : draft.id
                    ? "Save changes"
                    : "Create category"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!deleteCategory.isPending && !nextOpen) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(86dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.35rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] sm:max-h-[92vh] sm:max-w-lg sm:rounded-[1.6rem]">
          <DialogHeader className="border-b border-border/70 px-4 pb-3.5 pt-[max(0.85rem,env(safe-area-inset-top))] pr-12 sm:px-7 sm:pb-5 sm:pt-7 sm:pr-16">
            <div className="inline-flex w-fit rounded-lg border border-destructive/15 bg-destructive/5 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-destructive sm:rounded-full sm:px-3 sm:text-[0.68rem] sm:tracking-[0.22em]">
              Confirm delete
            </div>
            <DialogTitle className="pt-1.5 text-[1.12rem] tracking-tight text-[#10292B] dark:text-foreground sm:pt-3 sm:text-[1.65rem]">
              Delete category?
            </DialogTitle>
            <DialogDescription className="max-w-md text-[0.82rem] leading-6 sm:text-[0.95rem] sm:leading-7">
              {deleteTarget
                ? `Remove "${deleteTarget.name}" from your workspace? Existing transactions will keep their amounts and dates, but the category link will be cleared.`
                : "Remove this category from your workspace? Existing transactions will keep their amounts and dates, but the category link will be cleared."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-end gap-2 px-4 py-4 sm:px-7 sm:py-6">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg px-4 text-sm sm:h-11 sm:rounded-full sm:px-5 sm:text-base"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteCategory.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 rounded-lg bg-destructive px-4 text-sm text-white hover:bg-destructive/90 sm:h-11 sm:rounded-full sm:px-5 sm:text-base"
              onClick={() => deleteTarget && deleteCategory.mutate({ id: deleteTarget.id })}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? "Deleting..." : "Delete category"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
