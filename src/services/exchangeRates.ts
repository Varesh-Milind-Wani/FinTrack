export interface ExchangeRateSnapshot {
  date: string;
  base: "EUR";
  rates: Record<string, number>;
}

const CACHE_KEY = "fintrack:exchange-rates:v1";
const CURRENCIES = ["INR", "USD", "GBP", "CAD", "JPY"];

export const readCachedExchangeRates = (): ExchangeRateSnapshot | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ExchangeRateSnapshot;
    if (!value.date || value.base !== "EUR" || !value.rates || !CURRENCIES.every((code) => Number.isFinite(value.rates[code]) && value.rates[code] > 0)) return null;
    return value;
  } catch {
    return null;
  }
};

export const fetchLatestExchangeRates = async (signal?: AbortSignal): Promise<ExchangeRateSnapshot> => {
  const url = `https://api.frankfurter.dev/v2/rates?base=EUR&quotes=${CURRENCIES.join(",")}`;
  try {
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Frankfurter returned ${response.status}`);
    const records = await response.json() as Array<{ date?: string; base?: string; quote?: string; rate?: number }>;
    const first = records[0];
    const rates: Record<string, number> = { EUR: 1 };
    records.forEach((record) => {
      if (record.quote && Number.isFinite(record.rate) && Number(record.rate) > 0) rates[record.quote] = Number(record.rate);
    });
    if (!first?.date || !CURRENCIES.every((code) => Number.isFinite(rates[code]) && rates[code] > 0)) {
      throw new Error("Frankfurter returned incomplete currency data");
    }
    const snapshot: ExchangeRateSnapshot = { date: first.date, base: "EUR", rates };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch { /* Keep rates in memory if browser storage is unavailable. */ }
    return snapshot;
  } catch (primaryError) {
    if (signal?.aborted) throw primaryError;
    const response = await fetch("https://open.er-api.com/v6/latest/EUR", { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw primaryError;
    const data = await response.json() as { result?: string; time_last_update_utc?: string; rates?: Record<string, number> };
    const rates: Record<string, number> = { EUR: 1, ...(data.rates ?? {}) };
    if (data.result !== "success" || !data.time_last_update_utc || !CURRENCIES.every((code) => Number.isFinite(rates[code]) && rates[code] > 0)) {
      throw primaryError;
    }
    const snapshot: ExchangeRateSnapshot = {
      date: new Date(data.time_last_update_utc).toISOString().slice(0, 10),
      base: "EUR",
      rates,
    };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch { /* Keep rates in memory if browser storage is unavailable. */ }
    return snapshot;
  }
};
