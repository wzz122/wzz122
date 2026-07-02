import type { Env } from "./types";

export interface PriceTable {
  asrDiarizePerMin: number;
  asrMiniPerMin: number;
  llmInPer1k: number;
  llmOutPer1k: number;
}

const DEFAULT_PRICES: PriceTable = {
  asrDiarizePerMin: 0.9,
  asrMiniPerMin: 0.45,
  llmInPer1k: 0.045,
  llmOutPer1k: 0.375,
};

export function loadPriceTable(env: Env): PriceTable {
  if (!env.PRICE_TABLE_JSON) return DEFAULT_PRICES;
  try {
    return { ...DEFAULT_PRICES, ...JSON.parse(env.PRICE_TABLE_JSON) };
  } catch {
    return DEFAULT_PRICES;
  }
}

export function sessionBudgetJpy(env: Env): number {
  const v = Number(env.SESSION_BUDGET_JPY);
  return Number.isFinite(v) && v > 0 ? v : 100;
}

export function asrCostJpy(prices: PriceTable, seconds: number, diarize: boolean): number {
  const perMin = diarize ? prices.asrDiarizePerMin : prices.asrMiniPerMin;
  return (seconds / 60) * perMin;
}

export function llmCostJpy(
  prices: PriceTable,
  usage: { promptTokens: number; completionTokens: number },
): number {
  return (
    (usage.promptTokens / 1000) * prices.llmInPer1k +
    (usage.completionTokens / 1000) * prices.llmOutPer1k
  );
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// 每日全局熔断：防止 token 泄漏被刷爆。未绑定 KV 时静默跳过。
export async function dailyBudgetExceeded(env: Env): Promise<boolean> {
  if (!env.BUDGET_KV) return false;
  const limit = Number(env.DAILY_BUDGET_JPY);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const key = dailyKey();
  const spent = Number((await env.BUDGET_KV.get(key)) ?? "0");
  return spent >= limit;
}

export async function addDailySpend(env: Env, jpy: number): Promise<void> {
  if (!env.BUDGET_KV || jpy <= 0) return;
  const key = dailyKey();
  const spent = Number((await env.BUDGET_KV.get(key)) ?? "0");
  await env.BUDGET_KV.put(key, String(spent + jpy), { expirationTtl: 60 * 60 * 48 });
}

function dailyKey(): string {
  return `daily-spend:${new Date().toISOString().slice(0, 10)}`;
}
