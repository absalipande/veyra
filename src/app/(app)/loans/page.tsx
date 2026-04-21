import { LoansWorkspace } from "@/features/loans/components/loans-workspace";

type LoansPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function LoansPage({ searchParams }: LoansPageProps) {
  const params = await searchParams;

  return <LoansWorkspace initialQuery={params?.q ?? ""} />;
}
