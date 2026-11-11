import type { OhlcBar } from "../utils/volatility";

interface MarketHistoryResponse { bars?: OhlcBar[]; }

// The configured URL must be a same-origin/server-side proxy. Never put a market-data
// provider secret in VITE_* variables or call a paid provider directly from this app.
const cache = new Map<string, { expiresAt: number; bars: OhlcBar[] }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export function getMarketHistoryProxyUrl(): string | null {
  const url = import.meta.env.VITE_MARKET_DATA_PROXY_URL?.trim();
  return url || null;
}

export async function fetchDailyHistory(symbol: string, signal?: AbortSignal): Promise<OhlcBar[]> {
  const baseUrl = getMarketHistoryProxyUrl();
  if (!baseUrl) throw new Error("Market history proxy is not configured");
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cached = cache.get(normalizedSymbol);
  if (cached && cached.expiresAt > Date.now()) return cached.bars;

  const url = new URL(baseUrl, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("Market history must use the same-origin server proxy");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("range", "5y");
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Market history request failed (${response.status})`);
  const payload = await response.json() as MarketHistoryResponse;
  if (!Array.isArray(payload.bars)) throw new Error("Market history response is invalid");
  const bars = payload.bars.filter((bar) => bar && typeof bar.date === "string");
  cache.set(normalizedSymbol, { expiresAt: Date.now() + CACHE_TTL_MS, bars });
  return bars;
}
