# dsh-skill-mcp-console

Skills and MCP as two **top-level** sections in DeepSeek Harness settings.

中文说明在下方。

---

## Why another capability panel

The ecosystem has plenty. Every one measured before writing this fails at
least one of the following, and all four matter for a dsh reached over a
domain rather than `localhost`.

| | |
|---|---|
| **Top level** | Registers into `settings.section`, not `settings.plugins.tab`. A panel nested two clicks deep inside Settings → Plugins is a panel nobody finds. |
| **No loopback fence** | Several skill managers reject any request whose `Host` header is not `localhost` — a correct default for a plugin that renames files under skill roots, and fatal behind a tunnel. This one reads through the Remote seam the app already authenticates, so it works wherever the app works. |
| **Every skill root** | `~/.agents/skills`, `~/.dsh/skills`, and the Claude Code / Codex / Gemini / OpenCode roots. A skill you can invoke but cannot see is worse than one that is missing. |
| **Universal `mcpServers`** | dsh stores cordis patch entries; Cursor, Claude Desktop and every MCP README in circulation write `mcpServers`. The JSON view speaks the world's dialect, so you can compare it against any documentation without translating in your head. |

## Install

```bash
dsh plugin --profile web add dsh-skill-mcp-console
```

Restart dsh. Two new entries appear in Settings: **Skills** and **MCP**.

## What it shows

**Skills** — every skill directory found under every root, with its
frontmatter description, which agent's root it came from, and when it last
changed. Click a row for the file tree and the text of any file in it.

Rows carry their own problems inline. A skill whose `SKILL.md` frontmatter
`name` does not match its directory name loads under the directory name and
the frontmatter name silently does nothing; a skill with no `description`
never gets invoked by the model. From inside a session both are invisible —
this panel is the only place they can say so.

**MCP** — each configured server with the tools it actually registered,
expandable to the full `mcp__<server>__<tool>` inventory, plus the whole
configuration as one `mcpServers` document.

No connection dot. dsh's official MCP client exposes no status seam yet, so a
green light here would be invented; the row shows what is knowable — the
entry's disabled flag, its cordis fiber phase, and the tools that really
exist. Credentials never leave the host: header and env **names** are shown,
their values are masked before the snapshot is built.

## Not in this version

The JSON view is read-only. Translating `mcpServers` back into cordis patch
entries is the write path, and shipping a Save button before that round-trip
is proven would risk the one file that holds every server's credentials.
Enable/disable toggles wait on the same work.

## Development

```bash
pnpm install
pnpm build          # esbuild → lib/index.js, lib/typert.host.js, lib/client.js
```

The client bundle is wrapped in dsh's `window.__ModuleLoader__.load({ id,
factory })` envelope, with React left external — the app hands it in through
the factory's `require`. Everything else is bundled, including schemastery,
because the browser has no module resolver of its own.

Install a local build with a tarball, never `link:` — Node resolves a
symlinked package's imports from its **real** path, so a linked plugin looks
for `@deepseek-ai/*` next to your checkout instead of inside the profile, and
the whole plugin tree fails to load.

```bash
pnpm pack
dsh plugin --profile web add ./dsh-skill-mcp-console-0.1.0.tgz
```

## Licence

MIT

---

# 技能与 MCP 控制台

给 DeepSeek Harness 加两个**顶层**设置菜单:**Skills** 和 **MCP**。

## 为什么还要再写一个

生态里同类不少,但下面四条每一条都有人漏,而对于**通过域名访问**(而非
`localhost`)的 dsh,四条都是硬要求:

- **顶层菜单** —— 注册到 `settings.section`,不是 `settings.plugins.tab`。埋在
  设置 → 插件里面的面板等于没有。
- **没有 loopback 栅栏** —— 好几个技能管理插件要求 `Host` 头必须是
  `localhost`。对于会重命名技能目录文件的插件这是合理默认,但域名访问下必然
  403。本插件走 app 自己已经鉴权的 Remote 通道,app 能用的地方它就能用。
- **扫全部技能根** —— `~/.agents/skills`、`~/.dsh/skills`,以及 Claude Code /
  Codex / Gemini / OpenCode 的根目录。**能调用却看不见的技能,比没有更糟。**
- **通用 `mcpServers` 格式** —— dsh 内部存的是 cordis 补丁条目,而 Cursor、
  Claude Desktop 和几乎所有 MCP 文档写的都是 `mcpServers`。JSON 视图说通用
  方言,你不用在脑子里做格式转换。

## 安装

```bash
dsh plugin --profile web add dsh-skill-mcp-console
```

重启 dsh,设置里会多出 **Skills** 和 **MCP** 两项。

## 它显示什么

**Skills** —— 所有根目录下的技能,带 frontmatter 描述、来源根、最后修改时间。
点一行看它的文件树和任意文件正文。

每行还带自己的问题诊断。`SKILL.md` 里 frontmatter 的 `name` 和目录名不一致
时,技能按目录名加载、frontmatter 那个名字**静默失效**;没有 `description`
的技能模型永远不会自动调用它。这两种情况在会话里都是看不见的,这个面板是
它们唯一能开口的地方。

**MCP** —— 每个已配置服务器,以及它**实际注册**的工具,展开看完整的
`mcp__<服务器>__<工具>` 清单;另有整份配置的 `mcpServers` 文档视图。

**没有连接状态灯。** dsh 官方 MCP 客户端目前不暴露状态接口,这里点一个绿灯
就是编的。行里只显示能确知的:条目是否停用、cordis fiber 阶段、以及真实存在
的工具。凭据不出宿主:header 和 env 的**名字**会显示,值在快照生成前就被遮蔽。

## 本版没有的

JSON 视图是只读的。把 `mcpServers` 反向翻译成 cordis 补丁条目是写入路径,在
这个往返没验证透之前就放一个保存按钮,拿整个机器所有服务器的凭据去赌,不值。
启停开关同理,等同一批工作。

## 授权

MIT
