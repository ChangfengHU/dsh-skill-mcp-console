import { useState } from 'react'
import { McpSection, type McpApi } from './McpSection.tsx'
import { SkillsSection, type SkillsApi } from './SkillsSection.tsx'
import { AppsSection, type AppsApi } from './AppsSection.tsx'
import type { T } from './ui.tsx'

type Page = 'apps' | 'skills' | 'mcp'

/** One Workbench module with explicit tabs over the plugin's real panels. */
export function SkillMcpWorkbenchPage({ appsApi, skillsApi, mcpApi, t }: {
  appsApi: AppsApi
  skillsApi: SkillsApi
  mcpApi: McpApi
  t: T
}) {
  const [page, setPage] = useState<Page>('apps')
  return (
    <section className="dsm-root dsm-workbench-page">
      <div className="dsm-workbench-head">
        <div>
          <h2>Apps · Skills · MCP</h2>
          <p>安装完整能力包，并管理会话中可真实调用的技能、MCP 服务和工具开关。</p>
        </div>
        <div className="dsm-switch" role="tablist" aria-label="Skills 与 MCP 页面">
          <button type="button" role="tab" aria-selected={page === 'apps'} onClick={() => setPage('apps')}>Apps</button>
          <button type="button" role="tab" aria-selected={page === 'skills'} onClick={() => setPage('skills')}>Skills</button>
          <button type="button" role="tab" aria-selected={page === 'mcp'} onClick={() => setPage('mcp')}>MCP</button>
        </div>
      </div>
      {page === 'apps' ? <AppsSection api={appsApi} /> : page === 'skills'
        ? <SkillsSection api={skillsApi} t={t} /> : <McpSection api={mcpApi} t={t} />}
    </section>
  )
}
