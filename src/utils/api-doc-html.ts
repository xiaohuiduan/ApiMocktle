import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

import type { ApiDetails, Parameter } from '@/types'
import { SchemaType, type JsonSchema } from '@/components/JsonSchema'

const METHOD_COLORS: Record<string, string> = {
  GET: '#52c41a',
  POST: '#1677ff',
  PUT: '#fa8c16',
  DELETE: '#ff4d4f',
  PATCH: '#722ed1',
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function h(tag: string, attrs: Record<string, string>, body?: string): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('')
  return body != null ? `<${tag}${a}>${body}</${tag}>` : `<${tag}${a} />`
}

// ── shared styles (inline) ──

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#333;background:#f5f5f5;line-height:1.6}
pre{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:12px;line-height:1.7}
code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:12px}
table{border-collapse:collapse;width:100%}
th,td{padding:8px 12px;text-align:left;font-size:13px}
th{background:#fafafa;font-weight:500}
tr{border-bottom:1px solid #f0f0f0}
.doc-header{background:#fff;border-bottom:1px solid #f0f0f0;padding:12px 24px;display:flex;align-items:center;gap:16px}
.doc-header h1{font-size:18px;font-weight:600;margin:0}
.doc-body{display:flex;min-height:calc(100vh - 53px)}
.doc-sidebar{width:260px;flex-shrink:0;background:#fff;border-right:1px solid #f0f0f0;overflow-y:auto}
.doc-sidebar-title{padding:8px 12px;font-size:12px;color:#999}
.doc-sidebar-item{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;border-bottom:1px solid #f5f5f5;font-size:13px;transition:background .15s}
.doc-sidebar-item:hover{background:#f0f7ff}
.doc-sidebar-item.active{background:#e6f4ff}
.doc-main{flex:1;overflow-y:auto;padding:24px}
.method-tag{display:inline-block;padding:2px 6px;font-size:11px;font-weight:700;color:#fff;border-radius:3px;flex-shrink:0}
.api-section{margin-bottom:24px;background:#fff;border:1px solid #f0f0f0;border-radius:6px;padding:24px}
.api-section h2{font-size:16px;margin-bottom:8px}
.api-section h3{font-size:14px;margin:16px 0 8px}
.schema-panel{border:1px solid #f0f0f0;border-radius:4px;overflow:hidden;display:grid;grid-template-columns:minmax(360px,1fr) minmax(240px,.9fr)}
.schema-left{border-right:1px solid #f0f0f0}
.schema-right{display:flex;flex-direction:column}
.schema-header{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;font-size:12px}
.schema-row{display:grid;grid-template-columns:2fr 1.2fr .8fr 2fr;gap:8px;padding:4px 12px;border-bottom:1px solid #f5f5f5;min-height:32px;align-items:center}
.schema-field{padding:1px 6px;background:#e6f4ff;color:#1677ff;border-radius:4px;font-size:12px}
.tabs{display:flex;border-bottom:1px solid #f0f0f0;margin-bottom:0}
.tab{padding:6px 16px;font-size:13px;cursor:pointer;border:1px solid transparent;border-bottom:none;border-radius:4px 4px 0 0;margin-right:2px}
.tab.active{background:#fff;border-color:#f0f0f0;font-weight:500}
`

// ── helpers ──

function getTypeLabel(node: JsonSchema): string {
  if (node.type === SchemaType.Array) return `array<${getTypeLabel(node.items)}>`
  if (node.type === SchemaType.Refer) return node.$ref
  return node.type
}

interface SchemaFieldRow {
  name: string
  typeLabel: string
  description: string
  depth: number
}

function buildSchemaRows(schema?: JsonSchema): SchemaFieldRow[] {
  if (!schema || schema.type !== SchemaType.Object || !Array.isArray(schema.properties)) return []
  const rows: SchemaFieldRow[] = []
  const walk = (properties: JsonSchema[], depth: number) => {
    properties.forEach((field: JsonSchema, i: number) => {
      const name = field.name ?? `field_${i + 1}`
      rows.push({ name, typeLabel: getTypeLabel(field), description: field.description ?? '-', depth })
      if (field.type === SchemaType.Object && Array.isArray(field.properties)) walk(field.properties, depth + 1)
      if (field.type === SchemaType.Array) {
        const items = field.items
        if (items?.type === SchemaType.Object && Array.isArray(items.properties)) walk(items.properties, depth + 1)
      }
    })
  }
  walk(schema.properties, 0)
  return rows
}

function buildSchemaExample(schema?: JsonSchema): unknown {
  if (!schema) return {}
  switch (schema.type) {
    case SchemaType.String: return 'string'
    case SchemaType.Integer: return 0
    case SchemaType.Number: return 0
    case SchemaType.Boolean: return true
    case SchemaType.Null: return null
    case SchemaType.Refer: return {}
    case SchemaType.Any: return {}
    case SchemaType.Array: return [buildSchemaExample(schema.items)]
    case SchemaType.Object: {
      const out: Record<string, unknown> = {}
      if (Array.isArray(schema.properties)) {
        schema.properties.forEach((field, i) => {
          out[field.name ?? `field_${i + 1}`] = buildSchemaExample(field)
        })
      }
      return out
    }
    default: return {}
  }
}

// ── HTML generators ──

function renderMethodTag(method: string): string {
  const m = method.toUpperCase()
  const color = METHOD_COLORS[m] ?? '#8c8c8c'
  return `<span class="method-tag" style="background:${color}">${esc(m)}</span>`
}

function renderParamsTable(params: Parameter[] | undefined, title: string): string {
  if (!params?.length) return ''
  const rows = params.map(p => `
    <tr>
      <td><code>${esc(p.name ?? '')}</code></td>
      <td>${esc(String(p.type))}</td>
      <td>${p.required ? '是' : '否'}</td>
      <td>${esc(p.description ?? '-')}</td>
      <td>${esc(p.example != null ? String(p.example) : '-')}</td>
    </tr>`).join('')
  return `<div style="margin-bottom:16px">
    <strong style="display:block;margin-bottom:8px;font-size:13px">${esc(title)}</strong>
    <div style="border:1px solid #f0f0f0;border-radius:4px;overflow:hidden">
      <table><thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th><th>示例</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`
}

function renderSchemaPanel(schema?: JsonSchema): string {
  if (!schema) return '<span style="color:#999">无</span>'

  if (schema.type === SchemaType.Object && Array.isArray(schema.properties) && schema.properties.length > 0) {
    const rows = buildSchemaRows(schema)
    const example = buildSchemaExample(schema)
    const exampleJson = JSON.stringify(example, null, 2)

    const rowHtml = rows.map(r => `
      <div class="schema-row">
        <span style="padding-left:${r.depth * 16}px"><span class="schema-field">${esc(r.name)}</span></span>
        <span style="font-size:12px;opacity:.7;font-family:monospace">${esc(r.typeLabel)}</span>
        <span style="font-size:12px;opacity:.5">可选</span>
        <span style="font-size:12px;opacity:.5">${esc(r.description)}</span>
      </div>`).join('')

    return `<div class="schema-panel">
      <div class="schema-left">
        <div class="schema-header"><span style="opacity:.6">参数名</span><span style="opacity:.4;font-size:11px">${rows.length} fields</span></div>
        <div style="max-height:320px;overflow:auto">
          <div class="schema-row" style="background:#fafafa;position:sticky;top:0"><span style="font-weight:500;opacity:.5">字段名</span><span style="font-weight:500;opacity:.5">类型</span><span style="font-weight:500;opacity:.5">必填</span><span style="font-weight:500;opacity:.5">说明</span></div>
          ${rowHtml}
        </div>
      </div>
      <div class="schema-right">
        <div class="schema-header"><span style="opacity:.6">示例</span></div>
        <pre style="margin:0;flex:1;padding:12px;background:#fafafa;max-height:320px;overflow:auto">${esc(exampleJson)}</pre>
      </div>
    </div>`
  }

  if (schema.type === SchemaType.Array) {
    return `<div><span style="background:#e6f4ff;color:#1677ff;padding:2px 8px;border-radius:4px;font-size:12px">array</span><div style="margin-top:8px">${renderSchemaPanel(schema.items)}</div></div>`
  }

  return `<span style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px">${esc(getTypeLabel(schema))}</span>`
}

function renderApiDetail(item: { name: string; data: ApiDetails }): string {
  const d = item.data
  const method = ((d as any).method ?? 'GET').toUpperCase()
  const path = (d as any).path ?? '/'
  const params = (d as any).parameters
  const reqBody = (d as any).requestBody as any
  const responses: any[] = (d as any).responses ?? []

  const hasParams = !!params?.path?.length || !!params?.query?.length || !!params?.header?.length || !!params?.cookie?.length
  const hasBody = reqBody && reqBody.type !== 'none'
  const hasResponses = responses.length > 0

  let bodyHtml = ''
  if (hasBody) {
    const bodyLabel = reqBody.type === 'application/json' ? 'JSON'
      : reqBody.type === 'multipart/form-data' ? 'Form Data' : 'Raw'
    bodyHtml += `<h3>请求体 <span style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:400">${esc(bodyLabel)}</span></h3>`
    if (reqBody.jsonSchema) {
      bodyHtml += renderSchemaPanel(reqBody.jsonSchema)
      bodyHtml += `<div style="margin-top:12px"><strong style="display:block;margin-bottom:8px;font-size:13px">请求示例</strong>
        <pre style="margin:0;border:1px solid #f0f0f0;border-radius:4px;padding:12px;background:#fafafa;overflow:auto">${esc(JSON.stringify(buildSchemaExample(reqBody.jsonSchema), null, 2))}</pre></div>`
    }
  }

  let responseHtml = ''
  if (hasResponses) {
    responseHtml += '<h3>返回响应</h3>'
    responses.forEach(resp => {
      const resSchema = resp.jsonSchema
      const resExample = JSON.stringify(buildSchemaExample(resSchema), null, 2)
      const statusColor = String(resp.code).startsWith('2') ? '#52c41a' : String(resp.code).startsWith('4') ? '#fa8c16' : '#ff4d4f'
      responseHtml += `<div style="margin-bottom:16px;border:1px solid #f0f0f0;border-radius:4px">
        <div style="padding:8px 16px;background:#fafafa;border-bottom:1px solid #f0f0f0">
          <span style="background:${statusColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">${resp.code}</span>
          <span style="margin-left:8px">${esc(resp.name ?? '')}</span>
        </div>
        <div style="padding:16px">
          <div style="margin-bottom:16px;font-size:13px">
            <span style="opacity:.5">HTTP 状态码：</span>${resp.code}
            <span style="margin-left:16px;opacity:.5">内容格式：</span>${esc(resp.contentType ?? 'json')}
          </div>
          ${resSchema ? renderSchemaPanel(resSchema) : ''}
          <div style="margin-top:12px"><strong style="display:block;margin-bottom:8px;font-size:13px">返回示例</strong>
          <pre style="margin:0;border:1px solid #f0f0f0;border-radius:4px;padding:12px;background:#fafafa;overflow:auto">${esc(resExample)}</pre></div>
        </div>
      </div>`
    })
  }

  return `<div class="api-section">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      ${renderMethodTag(method)}
      <strong style="font-size:18px">${esc(path)}</strong>
    </div>
    <h2>${esc(item.name)}</h2>
    ${d.description ? `<p style="color:#666">${esc(d.description)}</p>` : ''}
    ${hasParams ? `<h3>请求参数</h3>
      ${renderParamsTable(params.path, 'Path 参数')}
      ${renderParamsTable(params.query, 'Query 参数')}
      ${renderParamsTable(params.header, 'Header 参数')}
      ${renderParamsTable(params.cookie, 'Cookie 参数')}` : ''}
    ${bodyHtml ? `<div style="margin-bottom:24px">${bodyHtml}</div>` : ''}
    ${responseHtml ? `<div>${responseHtml}</div>` : ''}
  </div>`
}

function renderSidebar(items: { id: string; name: string; data: ApiDetails }[]): string {
  return items.map(item => {
    const method = ((item.data as any).method ?? 'GET').toUpperCase()
    const path = (item.data as any).path ?? '/'
    return `<div class="doc-sidebar-item">
      ${renderMethodTag(method)}
      <span style="font-size:12px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</span>
      <span style="font-size:11px;color:#999;margin-left:auto">${esc(path)}</span>
    </div>`
  }).join('')
}

export function generateApiDocHtml(projectName: string, items: { id: string; name: string; data: ApiDetails }[]): string {
  const sidebar = renderSidebar(items)
  const main = items.map(item => renderApiDetail(item)).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(projectName)} - API 文档</title>
<style>${CSS}</style>
</head>
<body>
<div class="doc-header">
  <h1>${esc(projectName)} - API 文档</h1>
  <span style="font-size:12px;color:#999">${items.length} 个接口</span>
</div>
<div class="doc-body">
  <div class="doc-sidebar">
    <div class="doc-sidebar-title">接口列表 (${items.length})</div>
    ${sidebar}
  </div>
  <div class="doc-main">${main}</div>
</div>
</body>
</html>`
}

export function generateMhtml(projectName: string, items: { id: string; name: string; data: ApiDetails }[]): string {
  const html = generateApiDocHtml(projectName, items)
  const boundary = '----=_NextBoundary_001'
  return [
    'From: <api-doc-export@apimocktle.local>',
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(projectName + ' - API 文档')))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n')
}

export async function downloadMhtml(projectName: string, items: { id: string; name: string; data: ApiDetails }[]): Promise<boolean> {
  const mhtml = generateMhtml(projectName, items)
  const filename = `${projectName.replace(/[\\/:*?"<>|]/g, '_')}_API文档.mhtml`

  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: 'MHTML 文档', extensions: ['mhtml'] }],
  })

  if (!filePath) return false

  await invoke('write_export_file', { path: filePath, content: mhtml })
  return true
}
