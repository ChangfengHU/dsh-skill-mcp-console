# Portable 插件：发行与安装分离

同一源码遵循 Agent Plugins 格式，Fleet 追加可选平台/入口/核心声明；
角色标记不替代 SKILL.md 中的流程。发行包固定白名单和散列，预检
完整 Skill 引用树，不运行远端 Shell、不发授权。确认后才申请插件
范围的连接配置并落盘。Unsupported Hooks/Commands 必须拒绝而非丢弃。

验证分层：包结构/散列 → 平台保存与文件读回 → 页面预检 → 明确确认
→ Skill 文件字节检查 → MCP initialize 和 tools/list → 安装收据。
HTTP 200 不是协议成功，目录存在不是已授权，平台注册不是已安装。

复用的旧连接也必须验收。若是标准地址且 headers 完全为空，可在
预检告知后补齐授权；自定义连接、已有授权、停用状态不能静默覆盖。
报错保留具体 HTTP/协议原因，避免只报依赖名称而无法定位。

浏览器验收遇 QUIC_TOO_MANY_RTOS 时，先区分传输与业务；本机验收
Chrome 禁用 QUIC 复验，不据此更改生产站点或降低验收标准。截图
须等最终 busy 状态解除，避免把阶段完成截图当成完整交付。

关联：[[published-apps-and-install-grants]]、[[dsh-runtime-source-binding]]。
2026-10-05；协议或平台加载机制改变时重新核验。
