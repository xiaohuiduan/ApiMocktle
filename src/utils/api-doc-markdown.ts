import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

import type { ApiDetails, Parameter } from '@/types'
import type { JsonSchema } from '@/components/JsonSchema'
import { SchemaType } from '@/components/JsonSchema'
import { buildSchemaExample, buildSchemaRows, getTypeLabel } from '@/components/JsonSchema/schema-normalizer'

// ── types ──

export interface ExportApi {
  id: string
  name: string
  data: ApiDetails
}

export interface ExportFolder {
  name: string
  children: ExportApi[]
}

export interface ExportTreeInput {
  folders: ExportFolder[]
  ungrouped: ExportApi[]
  totalCount: number
}

// ── helpers ──

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\|/g, '\\|')
}

// ── Markdown generators ──

function renderParamsTable(params: Parameter[] | undefined, title: string): string {
  if (!params?.length) return ''
  const rows = params.map(p =>
    `| ${esc(p.name ?? '')} | ${esc(String(p.type))} | ${p.required ? '是' : '否'} | ${esc(p.description ?? '-')} | ${esc(p.example != null ? String(p.example) : '-')} |`,
  ).join('\n')
  return `**${esc(title)}**\n\n| 参数名 | 类型 | 必填 | 说明 | 示例 |\n|--------|------|------|------|------|\n${rows}\n`
}

function renderSchemaMd(schema?: JsonSchema, indent = ''): string {
  if (!schema) return ''
  if (schema.type === SchemaType.Object && Array.isArray(schema.properties) && schema.properties.length > 0) {
    const rows = buildSchemaRows(schema, undefined, { resolveRefs: false })
    const rowMd = rows.map(r =>
      `${indent}| ${'  '.repeat(r.depth)}${esc(r.name)} | ${esc(r.typeLabel)} | ${r.required ? '必填' : '可选'} | ${esc(r.description ?? '-')} |`,
    ).join('\n')
    const example = JSON.stringify(buildSchemaExample(schema, undefined), null, 2)
    return `${indent}| 字段名 | 类型 | 必填 | 说明 |\n${indent}|--------|------|------|------|\n${rowMd}\n\n**示例:**\n\n\`\`\`json\n${example}\n\`\`\`\n`
  }
  if (schema.type === SchemaType.Array) {
    return `${indent}array\n\n${renderSchemaMd(schema.items, indent)}`
  }
  return `${indent}\`${schema ? esc(getTypeLabel(schema)) : 'unknown'}\`\n`
}

function renderApiMd(item: ExportApi): string {
  const d = item.data
  const method = ((d as any).method ?? 'GET').toUpperCase()
  const path = (d as any).path ?? '/'
  const params = (d as any).parameters
  const reqBody = (d as any).requestBody as any
  const responses: any[] = (d as any).responses ?? []

  const hasParams = !!params?.path?.length || !!params?.query?.length || !!params?.header?.length || !!params?.cookie?.length
  const hasBody = reqBody && reqBody.type !== 'none'
  const hasResponses = responses.length > 0

  let md = `### ${esc(method)} ${esc(path)}\n\n`
  md += `**${esc(item.name)}**\n\n`
  if (d.description) md += `${esc(d.description)}\n\n`

  if (hasParams) {
    md += `#### 请求参数\n\n`
    md += renderParamsTable(params.path, 'Path 参数')
    md += renderParamsTable(params.query, 'Query 参数')
    md += renderParamsTable(params.header, 'Header 参数')
    md += renderParamsTable(params.cookie, 'Cookie 参数')
  }

  if (hasBody) {
    const bodyLabel = reqBody.type === 'application/json' ? 'JSON'
      : reqBody.type === 'multipart/form-data' ? 'Form Data' : 'Raw'
    md += `#### 请求体 (${bodyLabel})\n\n`
    if (reqBody.jsonSchema) {
      md += renderSchemaMd(reqBody.jsonSchema)
    }
  }

  if (hasResponses) {
    md += `#### 返回响应\n\n`
    responses.forEach(resp => {
      const resSchema = resp.jsonSchema
      md += `##### ${resp.code} ${esc(resp.name ?? '')}\n\n`
      md += `| 状态码 | 内容格式 |\n|--------|----------|\n| ${resp.code} | ${esc(resp.contentType ?? 'json')} |\n\n`
      if (resSchema) {
        md += renderSchemaMd(resSchema)
      } else {
        md += `**返回示例:**\n\n\`\`\`json\n${JSON.stringify(buildSchemaExample(resSchema, undefined), null, 2)}\n\`\`\`\n\n`
      }
    })
  }

  md += '---\n\n'
  return md
}

function renderToc(folders: ExportFolder[], ungrouped: ExportApi[]): string {
  let md = '## 目录\n\n'

  for (const folder of folders) {
    md += `- **${esc(folder.name)}**\n`
    for (const api of folder.children) {
      const method = ((api.data as any).method ?? 'GET').toUpperCase()
      const path = (api.data as any).path ?? '/'
      md += `  - ${esc(method)} ${esc(path)} ${esc(api.name)}\n`
    }
  }

  if (ungrouped.length > 0) {
    md += `- **未分组**\n`
    for (const api of ungrouped) {
      const method = ((api.data as any).method ?? 'GET').toUpperCase()
      const path = (api.data as any).path ?? '/'
      md += `  - ${esc(method)} ${esc(path)} ${esc(api.name)}\n`
    }
  }

  return md + '\n---\n\n'
}

// ── main export ──

export function generateApiDocMarkdown(
  projectName: string,
  folders: ExportFolder[],
  ungrouped: ExportApi[],
  totalCount: number,
): string {
  const toc = renderToc(folders, ungrouped)

  const parts: string[] = []

  for (const folder of folders) {
    parts.push(`## ${esc(folder.name)}\n\n`)
    for (const api of folder.children) {
      parts.push(renderApiMd(api))
    }
  }

  if (ungrouped.length > 0) {
    parts.push(`## 未分组\n\n`)
    for (const api of ungrouped) {
      parts.push(renderApiMd(api))
    }
  }

  const body = parts.join('')

  return `# ${esc(projectName)} - API 文档\n\n> 共 ${totalCount} 个接口\n\n${toc}${body}`
}

export async function downloadMarkdown(projectName: string, tree: ExportTreeInput): Promise<boolean> {
  const md = generateApiDocMarkdown(projectName, tree.folders, tree.ungrouped, tree.totalCount)
  const filename = `${projectName.replace(/[\\/:*?"<>|]/g, '_')}_API文档.md`

  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: 'Markdown 文档', extensions: ['md'] }],
  })

  if (!filePath) return false

  await invoke('write_export_file', { path: filePath, content: md })
  return true
}
