import { BillsWorkspace } from "@/features/bills/components/bills-workspace";

type BillsPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function BillsPage({ searchParams }: BillsPageProps) {
  const params = await searchParams;

  return <BillsWorkspace initialQuery={params?.q ?? ""} />;
}
