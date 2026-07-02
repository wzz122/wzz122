# Claude ↔ Codex 桥接指南（在你的 Mac 上配置）

三种方案按推荐顺序排列。前两种都用各自的订阅计费、不需要任何 API key。

## 方案 A：互相 shell 调用（最简单，先用这个）

两家 CLI 都有无头模式，互调就是一条命令：

```sh
# Codex（或任何脚本）向 Claude 提问，拿到纯文本回答
claude -p "阅读 colormatch/reference/grade_math.py，评估把 TEMP_GAIN 从 4.0 改成 5.0 的影响"

# 需要结构化输出时
claude -p --output-format json "..."

# 反向：Claude Code（或脚本）派任务给 Codex
codex exec "跑 colormatch/verify_on_mac.sh，修复编译错误直到全绿，不得改数值行为"
```

让 Codex 主动用这条通道：在 ColorMatch 项目的 `AGENTS.md` 里加一节：

```markdown
## 咨询 Claude
遇到以下情况，先运行 `claude -p "<问题>"` 获取意见再动手：
1. 想修改 ColorMatchCore 的任何算法常数（Tuning/RenderTuning）；
2. CrossValidationTests 失败且原因不明；
3. 架构层面的取舍（模块边界、付费墙位置）。
把 Claude 的回答摘要写进 commit message 或 CODEX_REPORT.md。
```

注意：`claude -p` 每次调用默认是全新会话；连续对话用 `claude -p --continue`
（接上一次）。权限上无头模式默认保守，需要它自动改文件时加
`--permission-mode acceptEdits`（只在信任的任务里用）。

## 方案 B：MCP 互联（更深的集成）

MCP 是两家都支持的标准协议，适合"常驻工具"式的集成。

**让 Codex 能调 Claude Code 的工具**（`~/.codex/config.toml`）：

```toml
[mcp_servers.claude]
command = "claude"
args = ["mcp", "serve"]
```

**让 Claude Code 能调 Codex**（在项目目录执行一次）：

```sh
claude mcp add codex -- codex mcp
```

配置后，一边的会话里会出现另一边暴露的工具，模型自己决定何时调用。
适合的场景：本地 Claude Code 当总指挥做规划/评审，把具体编码步骤
作为工具调用派给 Codex 执行。

## 方案 C：把 Claude 模型接进 Codex 框架（不推荐做默认）

Codex 的 `model_providers` 只认 OpenAI 兼容接口，Anthropic API 不是，
需要 LiteLLM 之类的代理转换：

```sh
pip install 'litellm[proxy]'
export ANTHROPIC_API_KEY=sk-ant-...   # 需要 API 按量付费账号，与订阅无关
litellm --model anthropic/claude-fable-5 --port 4000
```

```toml
# ~/.codex/config.toml
[model_providers.claude_proxy]
name = "Claude via LiteLLM"
base_url = "http://localhost:4000/v1"

[profiles.fable]
model_provider = "claude_proxy"
model = "anthropic/claude-fable-5"
```

之后 `codex --profile fable` 即可。**为什么不推荐**：
1. 计费从订阅变成 API 按量（claude-fable-5 为 $10/$50 每百万 token）；
2. 模型和框架是配套调校的——Claude 的系统提示词、工具协议、权限模型
   都在 Claude Code 里，塞进 Codex 框架两头的调优都会损失；
3. 工具调用格式经代理转换有兼容性坑（思维块、并行工具调用）。
只有当你明确要"Codex 的界面 + Claude 的脑子"做实验时才值得。

## 针对 ColorMatch 工作流的建议

当前的 git 分支 + 交接文档模式保持不变（它解决"大块任务的交接"）。
桥接解决的是"任务执行中的即时咨询"：

- 给 Codex 的 AGENTS.md 加方案 A 的咨询约定（5 分钟，立刻有收益）；
- T1 编译修复时它就能 `claude -p` 问数值行为，而不用等你人肉转发；
- 方案 B 等你觉得 shell 调用不够用了再上；方案 C 忽略。
