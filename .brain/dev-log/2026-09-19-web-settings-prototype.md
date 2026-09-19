# 2026-09-19 · Settings Web 静态原型

## 范围

- 保留现有 Settings 布局与 General、Models、Plugins、Agent presets、Apps、Skills、MCP。
- 仅新增顶层 Web 菜单，展示 `dsh-free-search` Plugin 的 Provider、凭据、路由和健康状态。
- Firecrawl 作为 Web Provider 配置，不作为 MCP 暴露给 Agent。

## 交付

- 静态原型：`prototypes/settings-web-search-v1.html`
- 公网验收：`https://resource.vyibc.com/dsh-skill-mcp-console_prototypes_settings-web-search-v1.html`

## 验证

- 本地 Chrome 1440×1000 截图检查通过。
- 公网地址返回 HTTP 200、`text/html`，并通过 Chrome 重新加载截图验证。
- Provider 卡片、配置抽屉、策略切换、启停、测试和保存反馈均具备静态交互。
