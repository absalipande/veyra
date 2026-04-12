import { CategoriesWorkspace } from "@/features/categories/components/categories-workspace";

type CategoriesPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const params = await searchParams;

  return <CategoriesWorkspace initialQuery={params?.q ?? ""} />;
}
