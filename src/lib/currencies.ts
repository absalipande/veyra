export const supportedCurrencies = [
  "PHP",
  "USD",
  "EUR",
  "GBP",
  "SGD",
  "JPY",
  "AUD",
  "HKD",
] as const;

export type SupportedCurrency = (typeof supportedCurrencies)[number];

export const currencyLabels: Record<SupportedCurrency, string> = {
  PHP: "Philippine peso",
  USD: "US dollar",
  EUR: "Euro",
  GBP: "British pound",
  SGD: "Singapore dollar",
  JPY: "Japanese yen",
  AUD: "Australian dollar",
  HKD: "Hong Kong dollar",
};

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return supportedCurrencies.includes(value as SupportedCurrency);
}

export function getCurrencyLabel(currency: string) {
  return isSupportedCurrency(currency) ? currencyLabels[currency] : currency;
}

export function formatCurrencyMiliunits(value: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: isSupportedCurrency(currency) ? currency : "USD",
    maximumFractionDigits: 2,
  }).format(value / 1000);
}
