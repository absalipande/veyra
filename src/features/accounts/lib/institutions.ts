export type InstitutionOption = {
  aliases?: string[];
  keywords?: string[];
  logoDomain?: string;
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
    logoDomain: "bdo.com.ph",
  },
  {
    id: "bpi",
    label: "BPI",
    initials: "BPI",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
    aliases: ["Bank of the Philippine Islands"],
    keywords: ["bpi family", "bpi direct"],
    logoDomain: "bpi.com.ph",
  },
  {
    id: "unionbank",
    label: "UnionBank",
    initials: "UB",
    tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100",
    aliases: ["Union Bank"],
    keywords: ["ubp"],
    logoDomain: "unionbankph.com",
  },
  {
    id: "metrobank",
    label: "Metrobank",
    initials: "MB",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100",
    aliases: ["Metropolitan Bank and Trust Company"],
    logoDomain: "metrobank.com.ph",
  },
  {
    id: "landbank",
    label: "LandBank",
    initials: "LB",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    aliases: ["Land Bank of the Philippines"],
    logoDomain: "landbank.com",
  },
  {
    id: "rcbc",
    label: "RCBC",
    initials: "RC",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100",
    aliases: ["Rizal Commercial Banking Corporation"],
    logoDomain: "rcbc.com",
  },
  {
    id: "security-bank",
    label: "Security Bank",
    initials: "SB",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
    logoDomain: "securitybank.com",
  },
  {
    id: "chinabank",
    label: "China Bank",
    initials: "CB",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    aliases: ["China Banking Corporation"],
    logoDomain: "chinabank.ph",
  },
  {
    id: "eastwest",
    label: "EastWest",
    initials: "EW",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
    aliases: ["EastWest Bank"],
    logoDomain: "eastwestbanker.com",
  },
  {
    id: "pnb",
    label: "PNB",
    initials: "PN",
    tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-100",
    aliases: ["Philippine National Bank"],
    logoDomain: "pnb.com.ph",
  },
  {
    id: "psbank",
    label: "PSBank",
    initials: "PS",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    aliases: ["Philippine Savings Bank"],
    logoDomain: "psbank.com.ph",
  },
  {
    id: "aub",
    label: "AUB",
    initials: "AU",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    aliases: ["Asia United Bank"],
    logoDomain: "aub.com.ph",
  },
  {
    id: "robinsons-bank",
    label: "Robinsons Bank",
    initials: "RB",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    aliases: ["RBank"],
    logoDomain: "robinsonsbank.com.ph",
  },
  {
    id: "maybank",
    label: "Maybank",
    initials: "MY",
    tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-100",
    aliases: ["Maybank Philippines"],
    logoDomain: "maybank.com.ph",
  },
  {
    id: "bank-of-commerce",
    label: "Bank of Commerce",
    initials: "BC",
    tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100",
    aliases: ["BanCommerce"],
    logoDomain: "bankcom.com.ph",
  },
  {
    id: "sterling-bank-of-asia",
    label: "Sterling Bank of Asia",
    initials: "SA",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100",
    aliases: ["Sterling Bank"],
    logoDomain: "sterlingbankasia.com",
  },
  {
    id: "ctbc",
    label: "CTBC",
    initials: "CB",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
    aliases: ["CTBC Bank"],
    logoDomain: "ctbcbank.com.ph",
  },
  {
    id: "maya",
    label: "Maya",
    initials: "MY",
    tone: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-100",
    aliases: ["Maya Bank", "PayMaya"],
    logoDomain: "mayabank.ph",
  },
  {
    id: "gcash",
    label: "GCash",
    initials: "GC",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
    keywords: ["globe"],
    logoDomain: "gcash.com",
  },
  {
    id: "gotyme",
    label: "GoTyme",
    initials: "GT",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100",
    aliases: ["GoTyme Bank"],
    logoDomain: "gotyme.com.ph",
  },
  {
    id: "seabank",
    label: "SeaBank",
    initials: "SB",
    aliases: ["MariBank, SeaBank"],
    tone: "bg-lime-100 text-lime-800 dark:bg-lime-500/20 dark:text-lime-100",
    logoDomain: "seabank.ph",
  },
  {
    id: "cimb",
    label: "CIMB",
    initials: "CI",
    tone: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/20 dark:text-fuchsia-100",
    aliases: ["CIMB Bank"],
    logoDomain: "cimbbank.com.ph",
  },
  {
    id: "tonik",
    label: "Tonik",
    initials: "TN",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-100",
    logoDomain: "tonikbank.com",
  },
  {
    id: "atome",
    label: "Atome",
    initials: "AT",
    tone: "bg-lime-100 text-lime-800 dark:bg-lime-500/20 dark:text-lime-100",
    aliases: ["Atome SG", "Atome PH"],
    logoDomain: "atome.sg",
  },
  {
    id: "komo",
    label: "KOMO",
    initials: "KO",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    aliases: ["Komo by EastWest"],
    logoDomain: "eastwestbanker.com",
  },
  {
    id: "ownbank",
    label: "OwnBank",
    initials: "OB",
    tone: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-100",
    logoDomain: "ownbank.com",
  },
  {
    id: "uno",
    label: "UNO Digital Bank",
    initials: "UN",
    tone: "bg-stone-100 text-stone-800 dark:bg-stone-500/20 dark:text-stone-100",
    aliases: ["UNO"],
    logoDomain: "unodigitalbank.com",
  },
  {
    id: "wise",
    label: "Wise",
    initials: "WS",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    logoDomain: "wise.com",
  },
  {
    id: "paypal",
    label: "PayPal",
    initials: "PP",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    logoDomain: "paypal.com",
  },
  {
    id: "payoneer",
    label: "Payoneer",
    initials: "PY",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
    logoDomain: "payoneer.com",
  },
  {
    id: "revolut",
    label: "Revolut",
    initials: "RV",
    tone: "bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-100",
    logoDomain: "revolut.com",
  },
  {
    id: "hsbc",
    label: "HSBC",
    initials: "HS",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    logoDomain: "hsbc.com",
  },
  {
    id: "citibank",
    label: "Citibank",
    initials: "CT",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    aliases: ["Citi"],
    logoDomain: "citibank.com",
  },
  {
    id: "jpmorgan-chase",
    label: "Chase",
    initials: "CH",
    tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100",
    aliases: ["JP Morgan Chase", "JPMorgan Chase"],
    logoDomain: "chase.com",
  },
  {
    id: "bank-of-america",
    label: "Bank of America",
    initials: "BA",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
    aliases: ["BofA"],
    logoDomain: "bankofamerica.com",
  },
  {
    id: "wells-fargo",
    label: "Wells Fargo",
    initials: "WF",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    logoDomain: "wellsfargo.com",
  },
  {
    id: "capital-one",
    label: "Capital One",
    initials: "CO",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100",
    logoDomain: "capitalone.com",
  },
  {
    id: "american-express",
    label: "American Express",
    initials: "AX",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
    aliases: ["Amex", "AMEX"],
    logoDomain: "americanexpress.com",
  },
  {
    id: "discover",
    label: "Discover",
    initials: "DI",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
    logoDomain: "discover.com",
  },
  {
    id: "ing",
    label: "ING",
    initials: "IN",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
    logoDomain: "ing.com",
  },
  {
    id: "dbs",
    label: "DBS",
    initials: "DB",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
    logoDomain: "dbs.com.sg",
  },
  {
    id: "ocbc",
    label: "OCBC",
    initials: "OC",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    logoDomain: "ocbc.com",
  },
  {
    id: "uob",
    label: "UOB",
    initials: "UO",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    logoDomain: "uobgroup.com",
  },
  {
    id: "anz",
    label: "ANZ",
    initials: "AN",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
    logoDomain: "anz.com",
  },
  {
    id: "standard-chartered",
    label: "Standard Chartered",
    initials: "SC",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
    logoDomain: "sc.com",
  },
  {
    id: "santander",
    label: "Santander",
    initials: "SA",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    logoDomain: "santander.com",
  },
  {
    id: "barclays",
    label: "Barclays",
    initials: "BR",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    logoDomain: "barclays.com",
  },
  {
    id: "lloyds",
    label: "Lloyds",
    initials: "LY",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    logoDomain: "lloydsbank.com",
  },
  {
    id: "westpac",
    label: "Westpac",
    initials: "WP",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    logoDomain: "westpac.com.au",
  },
  {
    id: "nab",
    label: "NAB",
    initials: "NB",
    tone: "bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-100",
    logoDomain: "nab.com.au",
  },
  {
    id: "commbank",
    label: "Commonwealth Bank",
    initials: "CB",
    tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-100",
    aliases: ["CommBank", "CBA"],
    logoDomain: "commbank.com.au",
  },
  {
    id: "monzo",
    label: "Monzo",
    initials: "MZ",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-100",
    aliases: ["Monzo Bank"],
    logoDomain: "monzo.com",
  },
  {
    id: "n26",
    label: "N26",
    initials: "N2",
    tone: "bg-neutral-100 text-neutral-800 dark:bg-neutral-500/20 dark:text-neutral-100",
    logoDomain: "n26.com",
  },
  {
    id: "chime",
    label: "Chime",
    initials: "CH",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
    logoDomain: "chime.com",
  },
  {
    id: "cash-app",
    label: "Cash App",
    initials: "CA",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    logoDomain: "cash.app",
  },
  {
    id: "alipay",
    label: "Alipay",
    initials: "AL",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    logoDomain: "alipay.com",
  },
  {
    id: "wechat-pay",
    label: "WeChat Pay",
    initials: "WP",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
    logoDomain: "pay.weixin.qq.com",
  },
  {
    id: "wise-business",
    label: "Wise Business",
    initials: "WB",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
    aliases: ["TransferWise Business"],
    logoDomain: "wise.com",
  },
  {
    id: "deutsche-bank",
    label: "Deutsche Bank",
    initials: "DB",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    logoDomain: "db.com",
  },
  {
    id: "bnp-paribas",
    label: "BNP Paribas",
    initials: "BN",
    tone: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-100",
    logoDomain: "bnpparibas.com",
  },
  {
    id: "ubs",
    label: "UBS",
    initials: "UB",
    tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
    logoDomain: "ubs.com",
  },
  {
    id: "credit-suisse",
    label: "Credit Suisse",
    initials: "CS",
    tone: "bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-100",
    logoDomain: "credit-suisse.com",
  },
  {
    id: "sofi",
    label: "SoFi",
    initials: "SF",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
    aliases: ["SoFi Bank"],
    logoDomain: "sofi.com",
  },
  {
    id: "zelle",
    label: "Zelle",
    initials: "ZE",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-100",
    logoDomain: "zellepay.com",
  },
  {
    id: "venmo",
    label: "Venmo",
    initials: "VE",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    logoDomain: "venmo.com",
  },
  {
    id: "apple-cash",
    label: "Apple Cash",
    initials: "AC",
    tone: "bg-neutral-100 text-neutral-800 dark:bg-neutral-500/20 dark:text-neutral-100",
    aliases: ["Apple Pay Cash"],
    logoDomain: "apple.com",
  },
  {
    id: "google-pay",
    label: "Google Pay",
    initials: "GP",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100",
    aliases: ["GPay"],
    logoDomain: "pay.google.com",
  },
  {
    id: "paytm",
    label: "Paytm",
    initials: "PT",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100",
    logoDomain: "paytm.com",
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

function buildLogoDevUrl(domain?: string | null) {
  const token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

  if (!domain || !token) return null;

  return `https://img.logo.dev/${domain}?token=${token}&format=png&size=128`;
}

export function findInstitutionOption(value?: string | null) {
  if (!value) return null;

  const normalized = normalizeInstitutionValue(value);

  const exactMatch =
    institutionOptions.find((option) => {
      const optionValues = [option.id, option.label, ...(option.aliases ?? [])].map(
        normalizeInstitutionValue,
      );

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
          candidate.length > 1 &&
          (normalized.includes(candidate) || candidate.includes(normalized)),
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
      logoPath: buildLogoDevUrl(matched.logoDomain),
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
