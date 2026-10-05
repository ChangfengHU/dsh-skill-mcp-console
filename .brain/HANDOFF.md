# Handoff

## Runtime
- Source: /home/claude/dsh-skill-mcp-console
- Loaded package: /home/claude/.dsh/profiles/web/node_modules/dsh-skill-mcp-console
- Service: sop-dsh-web.service
- Local workspace: /Users/changfeng.hu/code/js/dsh-extensions
- UI: https://dsh.vyibc.com/ and http://localhost:3080/ -> Settings -> Apps

## App Import Contract

Fleet portable v1 是第二条安装链路，旧卡通 command adapter 保留。
`src/fleet-plugin-standard.mjs` 同步 Fleet 校验器，发布前比较字节；
`inspectCatalog` 固定发行包身份、散列、完整 Skill 树及 MCP 目录，确认
后申请插件范围授权。查看 `scripts/verify-portable-browser.mjs` 复验页面
预检；`--install` 明确确认安装/更新，不生成视频。ChatGPT 官方私有
发行与 DSH 安装收据分别校验，不能由一方成功推断另一方已授权。

新格式不支持 Hooks/Commands，必须明确拒绝。空授权的标准连接可在
预检说明后补齐；其余独立配置和停用状态保留。MCP 验收必须检查
初始化协议和 tools/list，失败消息保留具体原因，不仅报告服务名。

Web profile 可能使用手动固定运行包并保留旧 npm/pnpm 锁文件；不要
盲目运行全 profile 包管理器更新。先查看真实 node_modules 目标、
当前源码一致性、运行会话与活动 claims，按现有固定包机制发布；
复用现有运行依赖、保留旧包回滚，验证 host import、页面和真实 RPC。
The manual import adapter strictly parses supported publisher commands, never
executes arbitrary Shell. Previews pin an exact repository revision and keep
credentials server-side in a short-lived entry; install accepts only its preview
id. Unknown publishers need explicit adapters and endpoint allowlists.

Catalog installation and installed App update previews both obtain package-bound
Fleet authorization automatically through the existing trusted connection. They
show a permission preview before any content/configuration changes. The public
Fleet release route returns pinned metadata only, no bootstrap or broad token.
GitHub metadata uses Fleet's existing service:github Vault credential server-side
only at api.github.com, not raw content hosts. DSH uses this public metadata when
anonymous GitHub release checks fail. Do not remove this fallback on source sync.

Other-source Skill conflicts require explicit consent. Preserve disabled MCPs,
sessions, tasks, agents, credentials and machine-local configuration. Backups live
under ~/.dsh/app-backups. Verify source AND actual profile package after updates.
Run tests and build before deploying; Mac native SQLite must match launchd Node.
Use the existing local proxy for GitHub; localhost and vyibc endpoints stay direct.

DSH installation registers only DSH; it must not silently install Codex plugins.
Restored running job files represent interrupted work, not success. Re-preflight
after interruption rather than submitting a consumed preview twice.
The Mac launch settings are ~/Library/LaunchAgents/com.vyibc.dsh3080.plist.
Preserve its targeted V8 workaround (--no-opt --no-maglev --no-sparkplug) when
syncing, unless real crash/HTTP tests justify removing it. Do not use --jitless:
Node's HTTP parser can need WebAssembly. See wiki/dsh-runtime-source-binding.md.

## Acceptance Boundary
Disabled local MCP dependencies do not block App installation. Preserve their
opt-out and show an explicit untested warning; do not conflate it with Fleet's
published availability or claim the dependency works locally. Enabled connection
failures remain genuine failures. The 1.5.8 real installation passed with seven
MCP probes and a preserved disabled behavior warning.

Read App receipts and app-jobs together with the actual browser report to verify
install completion; file presence and completed progress stages are insufficient.
See dev-log and evidence.jsonl for current test and installation acceptance.
