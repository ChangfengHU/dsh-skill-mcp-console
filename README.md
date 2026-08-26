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

## Getting skills in

`Add` offers five routes, and `Browse` opens the curated directory.

- **From a command or link.** GitHub first, because that is where skills
  live: a full URL, a `user/repo` shorthand, a `github:` spec, or a deep link
  at `…/tree/<branch>/<dir>`. Also `git clone`, a URL pointing straight at a
  `SKILL.md` or an archive, and `bash <(curl …)` for publishers who ship an
  installer. A repository routinely carries a dozen skills, so the ones found
  are listed and you pick.
- **Upload**, **Create** from three fields, or **Have dsh write one**, which
  drops a prompt into the composer rather than showing another form.

Whatever the route, the install ends with four checks — `SKILL.md` present,
frontmatter complete, scripts executable, and **the skill actually visible in
the registry**. That last one is the one that catches real failures: files can
all be correct while the skill never loads, because dsh keys the registry on
the directory name and the frontmatter says something else. An installer that
prints a menu and copies nothing still exits 0.

## What it does not do

No connection dot. dsh's official MCP client exposes no status seam, so a
green light would be invented.

`name-only` has no equivalent in dsh — the registry carries exactly two
policy booleans. It is implemented by parking the full description in this
plugin's own file and writing the skill's name in its place, so the model
still knows the skill exists without paying for the prose. Reverting restores
the original text verbatim, and every frontmatter edit is backed up into
`<skill>/.smc-backup/` first.

## The directory

`Browse` reads a JSON index named by `SMC_REGISTRY_URL`. There is no default:
the Agent Skills format carries no version field, so an index pointing at
someone else's moving branch hands you a script — holding your machine's
credentials — that can change under you. Curate your own and pin each entry.

```json
{
  "skills": [
    {
      "name": "fleet-proxy-switch",
      "description": "What it does and when it triggers.",
      "install": "bash <(curl -fsSL 'https://example.com/install-x.sh') agents",
      "version": "20260825012250"
    }
  ]
}
```

`install` is run verbatim, so **include whatever argument the script needs**.
The publisher this was built against prints an interactive menu when called
with no target — non-interactively that reads EOF, installs nothing, and
exits 0. The landing checks catch it, but passing the argument is better than
catching the failure.

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

## 技能怎么装进来

`Add` 有五条路,`Browse` 打开收录目录。

- **从命令或链接安装** —— GitHub 优先,因为技能就长在那儿:完整地址、
  `user/repo` 简写、`github:` 写法,或带 `…/tree/<分支>/<子目录>` 的深链。
  也认 `git clone`、直接指向 `SKILL.md` 或压缩包的 URL,以及
  `bash <(curl …)` —— 有些发布者出的就是这个。一个仓库常常装着十几个技能,
  所以会列出来让你勾。
- **上传**、**三格表单新建**,或者**让 dsh 帮我写** —— 后者不再弹表单,
  把 prompt 送进输入框,交给 agent 自己问自己写。

不管走哪条,安装都以四条校验收尾:`SKILL.md` 在不在、frontmatter 全不全、
脚本有没有执行位,以及**技能有没有真的出现在注册表里**。最后一条才是抓真
故障的:文件可以全都对,技能却根本不加载 —— 因为 dsh 按目录名建索引,而
frontmatter 里写的是别的名字。**打个菜单什么都没装的安装脚本,退出码一样是 0。**

## 它不做什么

**没有连接状态灯。** dsh 官方 MCP 客户端不暴露状态接口,点个绿灯就是编的。

**`仅名字` 这一档 dsh 里没有对应语义** —— 注册表只有两个策略布尔值。它是这样
实现的:把完整描述存进本插件自己的文件,frontmatter 里换成技能名,模型仍然
知道这个技能存在,但不再为那段长文付费。切回去时原文逐字恢复,而且每次改
frontmatter 之前都会先备份到 `<技能>/.smc-backup/`。

## 技能目录

`Browse` 读 `SMC_REGISTRY_URL` 指向的 JSON 索引。**没有默认值**:Agent Skills
格式本身没有版本字段,指向别人的活分支意味着那个脚本——手里握着你机器的凭据
——随时会在你脚下变。自己收录,每条钉版本。

```json
{
  "skills": [
    {
      "name": "fleet-proxy-switch",
      "description": "干什么、什么时候触发。",
      "install": "bash <(curl -fsSL 'https://example.com/install-x.sh') agents",
      "version": "20260825012250"
    }
  ]
}
```

`install` 会被原样执行,所以**脚本要什么参数就得带什么参数**。这套插件对着的
那个发布器,不给目标参数时会打一个交互菜单——非交互执行下它读到 EOF、什么都
没装、**退出码还是 0**。落地校验能抓住它,但带上参数比事后抓住更好。

## 授权

MIT
