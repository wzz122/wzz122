# 本次检查与边界

日期：2026-11-17（Asia/Tokyo）。检查在独立临时 checkout 进行；原项目仅被读取，没有执行其生成、修改、模型或上传脚本。

- 472 个原始源码/配置/文档文件：manga-video 148、map-explainer 74、视频工厂与写稿 250；原件总计 4,387,748 字节。所有副本 SHA-256 与读取时的原文件相同，来源和修改时间见 SOURCE-MANIFEST.json。
- Python AST 解析 164 个文件、Node `--check` 检查 56 个 JS/MJS、`bash -n` 检查 36 个 shell、解析 44 个源 JSON：全部通过。只解析，没有导入执行项目代码；未生成 pyc。
- `grep -RInEi 'key|token|secret|password' handoff` 已执行。匹配中包含变量名、环境配置读取、设计 tokens、JS 对象 key、模型 token 计数和说明文字；认证相关匹配复核为环境读取/空值/占位说明，没有发现实际凭据。
- 另检查常见 provider key、私钥、JWT、字面量 Bearer、凭据赋值和带用户名密码的 URL：未发现需要移除的真实凭据。没有读取或复制 `.env`、cookie、Keychain、认证会话；语音资源 ID 保留，它们不是认证 token。
- 文件全部是 UTF-8 文本，单文件小于 5,000,000 字节，无符号链接、音视频、图片、模型、字体二进制、node_modules 或虚拟环境。原项目 Git 历史未复制。
- 原始 handoff/README/CLAUDE/AGENTS 与相关工作流共 20 份在 HANDOFF-video.md 末尾完整附入，独立文件保持原字节。历史指令没有被当成新任务执行。

没有执行：依赖安装、TypeScript 类型检查、Python 依赖导入验证、浏览器渲染、TTS/生图/配乐生成、模型检查、视频播放、人耳通听、云端整片运行。静态语法通过不代表原依赖、素材路径、网络服务或整片效果已验证。

已知运行阻断与缺口详见 HANDOFF：旧根 factory engine 的系统 Chrome 回退；本机绝对路径；Linux 不兼容的 MLX/macOS 工具；缺少媒体、字体、音效、旁白和安全注入的 API 配置。没有为了交接而绕过这些要求。

发布范围仅新分支 `handoff-video` 的 `handoff/`；保留仓库原 README 与 main。云端继续时先阅读 HANDOFF 和 EXCLUSIONS，不能以此静态检查记录代替生产验收。
