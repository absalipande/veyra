import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VeyraMonogram } from "@/components/brand/veyra-monogram";

const concepts = [
  {
    name: "Monogram V",
    note: "Best for favicon",
    summary: "Sharp, premium, and easiest to recognize at tiny sizes.",
    vibe: "Confident finance OS",
    preview: (
      <svg viewBox="0 0 96 96" className="size-28" aria-hidden="true">
        <defs>
          <linearGradient id="v-monogram" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#1d5d60" />
            <stop offset="100%" stopColor="#8fc8b3" />
          </linearGradient>
        </defs>
        <rect x="8" y="8" width="80" height="80" rx="24" fill="#132d2f" />
        <path
          d="M28 24L45 69C46 72 50 72 51 69L68 24"
          fill="none"
          stroke="url(#v-monogram)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    favicon: (
      <svg viewBox="0 0 32 32" className="size-10" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="#132d2f" />
        <path
          d="M10 8.5L15.6 22.7C15.9 23.5 17.1 23.5 17.4 22.7L23 8.5"
          fill="none"
          stroke="#d9efe4"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "Orbit Mark",
    note: "Best brand symbol",
    summary: "Feels modern and fintech-native without being too literal.",
    vibe: "Motion, flow, capital",
    preview: (
      <svg viewBox="0 0 96 96" className="size-28" aria-hidden="true">
        <defs>
          <linearGradient id="v-orbit" x1="15%" y1="10%" x2="90%" y2="90%">
            <stop offset="0%" stopColor="#dcefe6" />
            <stop offset="100%" stopColor="#4a9085" />
          </linearGradient>
        </defs>
        <rect x="8" y="8" width="80" height="80" rx="24" fill="#17393c" />
        <circle cx="48" cy="48" r="6" fill="#e9f6f0" />
        <path
          d="M24 56C24 37 39 24 57 24C63 24 69 25 74 28"
          fill="none"
          stroke="url(#v-orbit)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M72 40C72 59 57 72 39 72C33 72 27 71 22 68"
          fill="none"
          stroke="#7ec1ad"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>
    ),
    favicon: (
      <svg viewBox="0 0 32 32" className="size-10" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="#17393c" />
        <circle cx="16" cy="16" r="2.5" fill="#f0faf6" />
        <path
          d="M8.5 18.5C8.5 11.7 13.7 8.5 20 8.5"
          fill="none"
          stroke="#dcefe6"
          strokeWidth="2.7"
          strokeLinecap="round"
        />
        <path
          d="M23.5 13.5C23.5 20.3 18.3 23.5 12 23.5"
          fill="none"
          stroke="#7ec1ad"
          strokeWidth="2.7"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    name: "Editorial Crest",
    note: "Best luxury option",
    summary: "More elevated and fashion-like, but slightly weaker for tiny tabs.",
    vibe: "Luxury journal for money",
    preview: (
      <svg viewBox="0 0 96 96" className="size-28" aria-hidden="true">
        <rect x="8" y="8" width="80" height="80" rx="24" fill="#f6f1e8" />
        <path
          d="M48 20L68 30V49C68 60 60 70 48 76C36 70 28 60 28 49V30L48 20Z"
          fill="none"
          stroke="#21484a"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <path
          d="M37 35L48 59L59 35"
          fill="none"
          stroke="#21484a"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    favicon: (
      <svg viewBox="0 0 32 32" className="size-10" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="#f6f1e8" />
        <path
          d="M16 5.5L23 9V15.6C23 19.6 20.2 23.2 16 25.4C11.8 23.2 9 19.6 9 15.6V9L16 5.5Z"
          fill="none"
          stroke="#21484a"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12.5 11.7L16 18.9L19.5 11.7"
          fill="none"
          stroke="#21484a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-12 sm:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center">
        <div className="rounded-[2rem] border border-white/70 bg-white/80 p-3 shadow-[0_24px_70px_-40px_rgba(10,31,34,0.45)]">
          <VeyraMonogram className="size-20" />
        </div>
        <Badge className="rounded-full bg-primary/10 px-4 py-1 text-primary hover:bg-primary/10">
          Veyra identity exploration
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Three directions for the Veyra tab icon and logo
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          I would not reuse the old Mynt mark. Veyra feels stronger as a fresh identity, and the
          favicon should be simple enough to read instantly in a crowded browser tab.
        </p>
      </div>

      <section className="mt-12 grid gap-6 lg:grid-cols-3">
        {concepts.map((concept) => (
          <Card
            key={concept.name}
            className="overflow-hidden border-white/60 bg-white/75 shadow-[0_24px_80px_-40px_rgba(10,31,34,0.45)] backdrop-blur"
          >
            <CardHeader className="gap-4 pb-4">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {concept.note}
                </Badge>
                <div className="rounded-2xl border border-border/70 bg-background/90 p-2">
                  {concept.favicon}
                </div>
              </div>
              <div className="flex items-center justify-center rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(243,247,245,0.92))] py-8">
                {concept.preview}
              </div>
              <div>
                <CardTitle className="text-2xl">{concept.name}</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6">
                  {concept.summary}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-2xl bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">
                <span className="font-medium text-foreground">Brand vibe:</span> {concept.vibe}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mx-auto mt-12 w-full max-w-4xl rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-[0_24px_90px_-50px_rgba(10,31,34,0.4)]">
        <h2 className="text-2xl font-semibold tracking-tight">My recommendation</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          The <span className="font-medium text-foreground">Monogram V</span> is the strongest
          overall choice. It is the cleanest at favicon size, it feels premium without trying too
          hard, and it gives us an easy system for app icon, header logo, splash screen, and
          loading states.
        </p>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          If you want Veyra to feel more fintech-native and less editorial, the{" "}
          <span className="font-medium text-foreground">Orbit Mark</span> is the runner-up.
        </p>
      </section>
    </main>
  );
}
