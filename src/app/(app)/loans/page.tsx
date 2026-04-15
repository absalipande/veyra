import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoansPage() {
  return (
    <section className="mx-auto max-w-3xl py-6 sm:py-8">
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl tracking-tight">Loans are temporarily disabled</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            We are rebuilding Loans v2 to support lender-accurate amortization, final-payment
            adjustments, and payment-history reconciliation.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Current loan creation and loan disbursement capture are paused while this rebuild is in
            progress. Existing account and transaction modules remain available.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline" className="h-9 rounded-lg px-4 text-sm">
              <Link href="/transactions">Go to transactions</Link>
            </Button>
            <Button asChild type="button" className="h-9 rounded-lg px-4 text-sm">
              <Link href="/accounts">Go to accounts</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
