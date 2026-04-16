export type InstitutionOption = {
  aliases?: string[];
  keywords?: string[];
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
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    aliases: ["Banco de Oro"],
    keywords: ["bdo unibank"],
  },
  {
    id: "bpi",
    label: "BPI",
    initials: "BPI",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
    aliases: ["Bank of the Philippine Islands"],
    keywords: ["bpi family", "bpi direct"],
  },
  {
    id: "unionbank",
    label: "UnionBank",
    initials: "UB",
    tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100",
    aliases: ["Union Bank"],
    keywords: ["ubp"],
  },
  {
    id: "metrobank",
    label: "Metrobank",
    initials: "MB",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100",
    aliases: ["Metropolitan Bank and Trust Company"],
  },
  {
    id: "landbank",
    label: "LandBank",
    initials: "LB",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    aliases: ["Land Bank of the Philippines"],
  },
  {
    id: "rcbc",
    label: "RCBC",
    initials: "RC",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100",
    aliases: ["Rizal Commercial Banking Corporation"],
  },
  {
    id: "security-bank",
    label: "Security Bank",
    initials: "SB",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
  },
  {
    id: "chinabank",
    label: "China Bank",
    initials: "CB",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    aliases: ["China Banking Corporation"],
  },
  {
    id: "eastwest",
    label: "EastWest",
    initials: "EW",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
    aliases: ["EastWest Bank"],
  },
  {
    id: "pnb",
    label: "PNB",
    initials: "PN",
    tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-100",
    aliases: ["Philippine National Bank"],
  },
  {
    id: "maya",
    label: "Maya",
    initials: "MY",
    tone: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-100",
    aliases: ["Maya Bank", "PayMaya"],
  },
  {
    id: "gcash",
    label: "GCash",
    initials: "GC",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
    keywords: ["globe"],
  },
  {
    id: "gotyme",
    label: "GoTyme",
    initials: "GT",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100",
    aliases: ["GoTyme Bank"],
  },
  {
    id: "seabank",
    label: "SeaBank",
    initials: "SB",
    tone: "bg-lime-100 text-lime-800 dark:bg-lime-500/20 dark:text-lime-100",
  },
  {
    id: "cimb",
    label: "CIMB",
    initials: "CI",
    tone: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/20 dark:text-fuchsia-100",
    aliases: ["CIMB Bank"],
  },
  {
    id: "tonik",
    label: "Tonik",
    initials: "TN",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-100",
  },
  {
    id: "komo",
    label: "KOMO",
    initials: "KO",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    aliases: ["Komo by EastWest"],
  },
  {
    id: "ownbank",
    label: "OwnBank",
    initials: "OB",
    tone: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-100",
  },
  {
    id: "uno",
    label: "UNO Digital Bank",
    initials: "UN",
    tone: "bg-stone-100 text-stone-800 dark:bg-stone-500/20 dark:text-stone-100",
    aliases: ["UNO"],
  },
  {
    id: "wise",
    label: "Wise",
    initials: "WS",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
  },
  {
    id: "paypal",
    label: "PayPal",
    initials: "PP",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
  },
  {
    id: "payoneer",
    label: "Payoneer",
    initials: "PY",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
  },
  {
    id: "revolut",
    label: "Revolut",
    initials: "RV",
    tone: "bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-100",
  },
  {
    id: "hsbc",
    label: "HSBC",
    initials: "HS",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
  },
  {
    id: "citibank",
    label: "Citibank",
    initials: "CT",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    aliases: ["Citi"],
  },
  {
    id: "jpmorgan-chase",
    label: "Chase",
    initials: "CH",
    tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100",
    aliases: ["JP Morgan Chase", "JPMorgan Chase"],
  },
  {
    id: "bank-of-america",
    label: "Bank of America",
    initials: "BA",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
    aliases: ["BofA"],
  },
  {
    id: "wells-fargo",
    label: "Wells Fargo",
    initials: "WF",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
  },
  {
    id: "capital-one",
    label: "Capital One",
    initials: "CO",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100",
  },
  {
    id: "american-express",
    label: "American Express",
    initials: "AX",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
    aliases: ["Amex", "AMEX"],
  },
  {
    id: "discover",
    label: "Discover",
    initials: "DI",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
  },
  {
    id: "ing",
    label: "ING",
    initials: "IN",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
  },
  {
    id: "dbs",
    label: "DBS",
    initials: "DB",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
  },
  {
    id: "ocbc",
    label: "OCBC",
    initials: "OC",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
  },
  {
    id: "uob",
    label: "UOB",
    initials: "UO",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
  },
  {
    id: "anz",
    label: "ANZ",
    initials: "AN",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
  },
  {
    id: "standard-chartered",
    label: "Standard Chartered",
    initials: "SC",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
  },
  {
    id: "santander",
    label: "Santander",
    initials: "SA",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
  },
  {
    id: "barclays",
    label: "Barclays",
    initials: "BR",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
  },
  {
    id: "lloyds",
    label: "Lloyds",
    initials: "LY",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
  },
  {
    id: "westpac",
    label: "Westpac",
    initials: "WP",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
  },
  {
    id: "nab",
    label: "NAB",
    initials: "NB",
    tone: "bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-100",
  },
  {
    id: "commbank",
    label: "Commonwealth Bank",
    initials: "CB",
    tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-100",
    aliases: ["CommBank", "CBA"],
  },
  {
    id: "monzo",
    label: "Monzo",
    initials: "MZ",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
    aliases: ["Monzo Bank"],
  },
  {
    id: "n26",
    label: "N26",
    initials: "N2",
    tone: "bg-neutral-100 text-neutral-800 dark:bg-neutral-500/20 dark:text-neutral-100",
  },
  {
    id: "chime",
    label: "Chime",
    initials: "CH",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
  },
  {
    id: "cash-app",
    label: "Cash App",
    initials: "CA",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
  },
  {
    id: "alipay",
    label: "Alipay",
    initials: "AL",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
  },
  {
    id: "wechat-pay",
    label: "WeChat Pay",
    initials: "WP",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
  },
];

const fallbackTonePalette = [
  "bg-stone-100 text-stone-800 dark:bg-stone-500/20 dark:text-stone-100",
  "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100",
  "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
] as const;

const institutionLogoById: Partial<Record<InstitutionOption["id"], string>> = {
  bdo: "/bdo/bdo.jpg",
  bpi: "/bpi/bpi.png",
  unionbank: "/unionbank/unionbank.jpg",
  metrobank: "/metrobank/metrobank.jpg",
  landbank: "/landbank/landbank.png",
  rcbc: "/rcbc/rcbc.png",
  "security-bank": "/security-bank/security-bank.png",
  chinabank: "/chinabank/chinabank.png",
  eastwest: "/eastwest/eastwest.jpg",
  pnb: "/pnb/pnb.png",
  maya: "/digital-banks/maya.png",
  gcash: "/wallets-bnpl/gcash.jpg",
  gotyme: "/digital-banks/gotyme.png",
  seabank: "/digital-banks/seabank.png",
  cimb: "/digital-banks/cimb.png",
  tonik: "/digital-banks/tonik.png",
  hsbc: "/hsbc/hsbc.png",
  "american-express": "/amex/amex.svg",
};

function normalizeInstitutionValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildFallbackInitials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function resolveFallbackTone(value: string) {
  const hashed = hashString(value);
  return fallbackTonePalette[hashed % fallbackTonePalette.length] ?? fallbackTonePalette[0];
}

export function findInstitutionOption(value?: string | null) {
  if (!value) return null;

  const normalized = normalizeInstitutionValue(value);

  const exactMatch =
    institutionOptions.find((option) => {
      const optionValues = [
        option.id,
        option.label,
        ...(option.aliases ?? []),
      ].map(normalizeInstitutionValue);

      return optionValues.includes(normalized);
    }) ?? null;

  if (exactMatch) return exactMatch;

  return (
    institutionOptions.find((option) => {
      const optionValues = [
        option.id,
        option.label,
        ...(option.aliases ?? []),
        ...(option.keywords ?? []),
      ].map(normalizeInstitutionValue);

      return optionValues.some(
        (candidate) =>
          candidate.length > 1 && (normalized.includes(candidate) || candidate.includes(normalized))
      );
    }) ?? null
  );
}

export function getInstitutionDisplay(value?: string | null) {
  const matched = findInstitutionOption(value);

  if (matched) {
    return {
      label: matched.label,
      initials: matched.initials,
      logoPath: institutionLogoById[matched.id] ?? null,
      tone: matched.tone,
    };
  }

  const fallback = value?.trim() || "Manual";
  const initials = buildFallbackInitials(fallback);

  return {
    label: fallback,
    initials: initials || "VA",
    logoPath: null,
    tone: resolveFallbackTone(fallback),
  };
}
