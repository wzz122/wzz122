import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "./env.ts";
import { BUILD } from "./paths.ts";

// 官方文档：https://platform.minimax.io/docs/api-reference/speech-t2a-http（国际版）
//          https://platform.minimaxi.com/docs（国内版）
export const BASE_URLS = {
  global: "https://api.minimax.io",
  cn: "https://api.minimaxi.com",
} as const;
export type Region = keyof typeof BASE_URLS;

const RETRY_HTTP = new Set([429, 500, 502, 503, 504]);
// 1000 未知错误 / 1001 超时 / 1002 限流 / 1039 每分钟用量超限
const RETRY_STATUS = new Set([1000, 1001, 1002, 1039]);

export class MiniMaxError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

export function apiKey(): string | undefined {
  return env("MINIMAX_API_KEY");
}

function requireKey(): string {
  const key = apiKey();
  if (!key) throw new MiniMaxError("缺少 MINIMAX_API_KEY：写进项目根目录的 .env（参考 .env.example）");
  return key;
}

async function rawPost(base: string, route: string, body: unknown, timeoutMs: number): Promise<any> {
  const url = new URL(route, base);
  const groupId = env("MINIMAX_GROUP_ID");
  if (groupId) url.searchParams.set("GroupId", groupId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new MiniMaxError(`网络错误：${(e as Error).message}`, true);
  }
  const textBody = await res.text();
  if (!res.ok) {
    throw new MiniMaxError(`HTTP ${res.status}：${textBody.slice(0, 300)}`, RETRY_HTTP.has(res.status));
  }
  let payload: any;
  try {
    payload = JSON.parse(textBody);
  } catch {
    throw new MiniMaxError(`返回的不是 JSON：${textBody.slice(0, 200)}`, true);
  }
  const code = payload?.base_resp?.status_code ?? -1;
  if (code !== 0) {
    throw new MiniMaxError(
      `status_code=${code} ${payload?.base_resp?.status_msg ?? ""}（trace_id=${payload?.trace_id ?? "-"}）`,
      RETRY_STATUS.has(code),
    );
  }
  return payload;
}

/** 判断 Key 属于国际版还是国内版：MINIMAX_REGION 优先；否则用免费的「查询音色」接口两边各试一次。
 *  结果按 Key 的指纹缓存在 build/.minimax-region.json（不存 Key 本身）。 */
export async function resolveRegion(): Promise<Region> {
  const forced = env("MINIMAX_REGION")?.toLowerCase();
  if (forced === "global" || forced === "cn") return forced;
  if (forced) throw new MiniMaxError(`MINIMAX_REGION 只能是 global 或 cn，现在是 ${forced}`);

  const fingerprint = createHash("sha256").update(requireKey()).digest("hex").slice(0, 12);
  const cacheFile = path.join(BUILD, ".minimax-region.json");
  if (existsSync(cacheFile)) {
    const cache = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (cache.fingerprint === fingerprint && (cache.region === "global" || cache.region === "cn")) return cache.region;
  }
  const errors: string[] = [];
  for (const region of ["global", "cn"] as Region[]) {
    try {
      await rawPost(BASE_URLS[region], "/v1/get_voice", { voice_type: "system" }, 20000);
      mkdirSync(BUILD, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify({ fingerprint, region }, null, 2));
      console.log(`MiniMax：这个 Key 属于${region === "global" ? "国际版（api.minimax.io）" : "国内版（api.minimaxi.com）"}`);
      return region;
    } catch (e) {
      errors.push(`${region}: ${(e as Error).message}`);
    }
  }
  throw new MiniMaxError(`两个接口都认不出这个 Key：\n  ${errors.join("\n  ")}`);
}

export async function post(route: string, body: unknown, { retries = 4, timeoutMs = 120000, label = "" } = {}): Promise<any> {
  const base = BASE_URLS[await resolveRegion()];
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await rawPost(base, route, body, timeoutMs);
    } catch (e) {
      lastErr = e as Error;
      const retryable = e instanceof MiniMaxError && e.retryable;
      if (!retryable || attempt === retries) break;
      const wait = 2 ** attempt * 1000;
      console.warn(`  ! ${label} ${lastErr.message}；${wait / 1000} 秒后重试（第 ${attempt + 1} 次）`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr ?? new MiniMaxError("未知错误");
}
