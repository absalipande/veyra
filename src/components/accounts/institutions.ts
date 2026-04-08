export type InstitutionOption = {
  aliases?: string[];
  id: string;
  initials: string;
  label: string;
  tone: string;
};

export const institutionOptions: InstitutionOption[] = [
  {
    id: "bdo",
    label: "BDO",
    initials: "BDO",
    tone: "bg-blue-100 text-blue-800",
    aliases: ["Banco de Oro"],
  },
  {
    id: "bpi",
    label: "BPI",
    initials: "BPI",
    tone: "bg-rose-100 text-rose-800",
    aliases: ["Bank of the Philippine Islands"],
  },
  {
    id: "unionbank",
    label: "UnionBank",
    initials: "UB",
    tone: "bg-indigo-100 text-indigo-800",
    aliases: ["Union Bank"],
  },
  {
    id: "metrobank",
    label: "Metrobank",
    initials: "MB",
    tone: "bg-sky-100 text-sky-800",
  },
  {
    id: "landbank",
    label: "LandBank",
    initials: "LB",
    tone: "bg-emerald-100 text-emerald-800",
  },
  {
    id: "security-bank",
    label: "Security Bank",
    initials: "SB",
    tone: "bg-green-100 text-green-800",
  },
  {
    id: "maya",
    label: "Maya",
    initials: "MY",
    tone: "bg-teal-100 text-teal-800",
  },
  {
    id: "gcash",
    label: "GCash",
    initials: "GC",
    tone: "bg-cyan-100 text-cyan-800",
  },
  {
    id: "gotyme",
    label: "GoTyme",
    initials: "GT",
    tone: "bg-amber-100 text-amber-800",
  },
  {
    id: "seabank",
    label: "SeaBank",
    initials: "SB",
    tone: "bg-lime-100 text-lime-800",
  },
];

export function findInstitutionOption(value?: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();

  return (
    institutionOptions.find(
      (option) =>
        option.id === normalized ||
        option.label.toLowerCase() === normalized ||
        option.aliases?.some((alias) => alias.toLowerCase() === normalized)
    ) ?? null
  );
}

export function getInstitutionDisplay(value?: string | null) {
  const matched = findInstitutionOption(value);

  if (matched) {
    return {
      label: matched.label,
      initials: matched.initials,
      tone: matched.tone,
    };
  }

  const fallback = value?.trim() || "Manual";
  const initials = fallback
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  return {
    label: fallback,
    initials: initials || "VA",
    tone: "bg-stone-100 text-stone-800",
  };
}
