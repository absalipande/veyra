import { TransactionsWorkspace } from "@/features/transactions/components/transactions-workspace";

type TransactionsPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const params = await searchParams;

  return <TransactionsWorkspace initialQuery={params?.q ?? ""} />;
}
