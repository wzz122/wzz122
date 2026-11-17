// npm run voices [-- --all]
// 列出这个 MiniMax 账号能用的音色：自己克隆的、自己设计的，以及中文、日语的系统音色。
// 用的是免费的「查询音色」接口，不扣费。需要 .env 里有 MINIMAX_API_KEY。
import { apiKey, post } from "./lib/minimax.ts";

if (!apiKey()) {
  console.error("没有 MINIMAX_API_KEY：复制 .env.example 为 .env，填上 Key 再运行。");
  process.exit(1);
}
const showAll = process.argv.includes("--all");
const resp = await post("/v1/get_voice", { voice_type: "all" }, { label: "查询音色" });

type Voice = { voice_id: string; voice_name?: string; description?: string[] | string; created_time?: string };
const print = (title: string, list: Voice[] | undefined, filter?: (v: Voice) => boolean) => {
  const items = (list ?? []).filter(filter ?? (() => true));
  console.log(`\n${title}（${items.length} 个）`);
  for (const v of items) {
    const desc = Array.isArray(v.description) ? v.description.join(" ") : v.description ?? "";
    console.log(`  ${v.voice_id}${v.voice_name ? `  「${v.voice_name}」` : ""}${desc ? `  ${desc}` : ""}`);
  }
};

print("自己克隆的音色", resp.voice_cloning);
print("自己设计的音色（文字描述生成）", resp.voice_generation);
const lang = (v: Voice) => showAll || /^(Chinese|Japanese)/.test(v.voice_id);
print(showAll ? "系统音色（全部）" : "系统音色（中文、日语；--all 看全部）", resp.system_voice, lang);
console.log("\n把想用的 voice_id 填进 config/characters.json 的 voice.minimax.voiceId，并把 voiceIdIsPlaceholder 改成 false。");
