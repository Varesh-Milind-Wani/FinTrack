import type { ExchangeRateSnapshot } from "../services/exchangeRates";

let displayCurrency: string | null = null;
let exchangeRates: ExchangeRateSnapshot | null = null;

export const setCurrencyDisplay = (currency: string, snapshot: ExchangeRateSnapshot | null) => {
  displayCurrency = currency;
  exchangeRates = snapshot;
};

export const getCurrencyRateDate = () => exchangeRates?.date ?? null;

export const convertCurrencyValue = (value: number, fromCurrency: string, toCurrency = displayCurrency) => {
  if (!toCurrency || fromCurrency === toCurrency) return { value, currency: fromCurrency, converted: false };
  const fromRate = exchangeRates?.rates[fromCurrency];
  const toRate = exchangeRates?.rates[toCurrency];
  if (!fromRate || !toRate || !Number.isFinite(value)) return { value, currency: fromCurrency, converted: false };
  return { value: value / fromRate * toRate, currency: toCurrency, converted: true };
};

export const formatCurrency = (
  value: number,
  currency: string = "INR",
  maximumFractionDigits?: number
) => {
  const converted = convertCurrencyValue(value, currency);
  const digits = converted.currency === "JPY" ? 0 : maximumFractionDigits ?? 2;
  try {
    const locale = converted.currency === "INR" ? "en-IN" : converted.currency === "GBP" ? "en-GB" : converted.currency === "CAD" ? "en-CA" : "en-US";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: converted.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(converted.value);
  } catch {
    return `${converted.currency} ${converted.value.toLocaleString("en-IN")}`;
  }
};
