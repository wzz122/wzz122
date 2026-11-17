import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Google Fonts 的 Noto Sans SC / Noto Sans JP（可变字重版本），放在本地 assets/fonts/。
// 不用 @remotion/google-fonts 在线加载：中日文字体被切成上百个分片，每个渲染进程都要下载一遍，容易超时。
export const FONT_SC = "Noto Sans SC";
export const FONT_JP = "Noto Sans JP";

let started = false;
export const ensureFonts = () => {
  if (started) return;
  started = true;
  loadFont({ family: FONT_SC, url: staticFile("manga/assets/fonts/NotoSansSC.ttf"), weight: "100 900" });
  loadFont({ family: FONT_JP, url: staticFile("manga/assets/fonts/NotoSansJP.ttf"), weight: "100 900" });
};

export const fontStack = (lang: "zh" | "ja") =>
  lang === "ja" ? `'${FONT_JP}', '${FONT_SC}', sans-serif` : `'${FONT_SC}', '${FONT_JP}', sans-serif`;
