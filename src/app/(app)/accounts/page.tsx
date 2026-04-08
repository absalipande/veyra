import { AccountsWorkspace } from "@/features/accounts/components/accounts-workspace";

type AccountsPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const params = await searchParams;

  return <AccountsWorkspace initialQuery={params?.q ?? ""} />;
}
