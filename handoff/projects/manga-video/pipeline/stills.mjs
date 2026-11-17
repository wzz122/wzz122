// 一次打包，批量截帧：node pipeline/stills.mjs <入口> <合成ID> <输出目录> <帧1,帧2,...> [props.json]
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
const [entry, id, outDir, framesArg, propsArg] = process.argv.slice(2);
const inputProps = propsArg ? JSON.parse(propsArg) : {};
const serveUrl = await bundle({ entryPoint: path.resolve(entry), publicDir: path.resolve(process.env.PUBLIC_DIR ?? 'public') });
const composition = await selectComposition({ serveUrl, id, inputProps });
fs.mkdirSync(outDir, { recursive: true });
for (const fr of framesArg.split(',').map(Number)) {
  await renderStill({ serveUrl, composition, frame: fr, output: path.join(outDir, `f${String(fr).padStart(6, '0')}.png`), inputProps });
}
console.log('done', framesArg.split(',').length);
