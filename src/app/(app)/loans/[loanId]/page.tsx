import { LoanDetailsWorkspace } from "@/features/loans/components/loan-details-workspace";

type LoanDetailsPageProps = {
  params: Promise<{
    loanId: string;
  }>;
};

export default async function LoanDetailsPage({ params }: LoanDetailsPageProps) {
  const { loanId } = await params;
  return <LoanDetailsWorkspace loanId={loanId} />;
}

