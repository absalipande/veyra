import { BudgetsWorkspace } from "@/features/budgets/components/budgets-workspace";

type BudgetsPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
  const params = await searchParams;

  return <BudgetsWorkspace initialQuery={params?.q ?? ""} />;
}
