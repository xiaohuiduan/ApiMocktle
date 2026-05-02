import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

import type { ApiDetails, Parameter } from '@/types'
import type { JsonSchema } from '@/components/JsonSchema'
import { SchemaType } from '@/components/JsonSchema'
import { buildSchemaExample, buildSchemaRows, getTypeLabel } from '@/components/JsonSchema/schema-normalizer'

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
.doc-sidebar{width:280px;flex-shrink:0;background:#fff;border-right:1px solid #f0f0f0;overflow-y:auto}
.doc-sidebar-title{padding:8px 12px;font-size:12px;color:#999}
.folder-group{border-bottom:1px solid #f0f0f0}
.folder-group summary{display:flex;align-items:center;gap:4px;padding:8px 12px;cursor:pointer;font-size:13px;font-weight:500;color:#555;list-style:none}
.folder-group summary::-webkit-details-marker{display:none}
.folder-group summary:hover{background:#f5f5f5}
.folder-arrow{font-size:10px;width:14px;text-align:center;flex-shrink:0;display:inline-block;transition:transform .15s}
details[open]>.folder-arrow{transform:rotate(90deg)}
.folder-count{font-size:11px;color:#999;margin-left:auto}
.doc-sidebar-item{display:flex;align-items:center;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid #f9f9f9;font-size:12px;text-decoration:none;color:#333;transition:background .12s;cursor:pointer;user-select:none}
.doc-sidebar-item:hover{background:#f0f7ff}
.doc-main{flex:1;overflow-y:auto;padding:24px;scroll-behavior:smooth}
.placeholder{text-align:center;color:#999;padding:80px 0;font-size:14px}
.method-tag{display:inline-block;padding:2px 6px;font-size:11px;font-weight:700;color:#fff;border-radius:3px;flex-shrink:0}
.api-radio{position:absolute;opacity:0;pointer-events:none}
.api-section{background:#fff;border:1px solid #f0f0f0;border-radius:6px;padding:24px;margin-bottom:24px;display:none}
.api-detail-active{display:block;border-color:#1677ff;box-shadow:0 0 0 2px rgba(22,119,255,.15)}
.api-section h2{font-size:16px;margin-bottom:8px}
.api-section h3{font-size:14px;margin:16px 0 8px}
.schema-panel{border:1px solid #f0f0f0;border-radius:4px;overflow:hidden;display:grid;grid-template-columns:minmax(360px,1fr) minmax(240px,.9fr)}
.schema-left{border-right:1px solid #f0f0f0}
.schema-right{display:flex;flex-direction:column}
.schema-header{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;font-size:12px}
.schema-row{display:grid;grid-template-columns:2fr 1.2fr .8fr 2fr;gap:8px;padding:4px 12px;border-bottom:1px solid #f5f5f5;min-height:32px;align-items:center}
.schema-field{padding:1px 6px;background:#e6f4ff;color:#1677ff;border-radius:4px;font-size:12px}
`

// ── helpers ──


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
    const rows = buildSchemaRows(schema, undefined, { resolveRefs: false })
    const example = buildSchemaExample(schema, undefined)
    const exampleJson = JSON.stringify(example, null, 2)

    const rowHtml = rows.map(r => `
      <div class="schema-row">
        <span style="padding-left:${r.depth * 16}px"><span class="schema-field">${esc(r.name)}</span></span>
        <span style="font-size:12px;opacity:.7;font-family:monospace">${esc(r.typeLabel)}</span>
        <span style="font-size:12px;opacity:.5">可选</span>
        <span style="font-size:12px;opacity:.5">${esc(r.description ?? '-')}</span>
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

  return `<span style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px">${schema ? esc(getTypeLabel(schema)) : 'unknown'}</span>`
}

function renderApiDetail(item: { id: string; name: string; data: ApiDetails }): string {
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
        <pre style="margin:0;border:1px solid #f0f0f0;border-radius:4px;padding:12px;background:#fafafa;overflow:auto">${esc(JSON.stringify(buildSchemaExample(reqBody.jsonSchema, undefined), null, 2))}</pre></div>`
    }
  }

  let responseHtml = ''
  if (hasResponses) {
    responseHtml += '<h3>返回响应</h3>'
    responses.forEach(resp => {
      const resSchema = resp.jsonSchema
      const resExample = JSON.stringify(buildSchemaExample(resSchema, undefined), null, 2)
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

  return `<div class="api-section api-detail-${esc(item.id)}" id="api-${esc(item.id)}">
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

// ── tree-structured data types & sidebar ──

interface ExportApi {
  id: string
  name: string
  data: ApiDetails
}

interface ExportFolder {
  name: string
  children: ExportApi[]
}

function renderSidebarTree(folders: ExportFolder[], ungrouped: ExportApi[]): string {
  let html = ''

  for (const folder of folders) {
    html += `<details class="folder-group" open>
      <summary>
        <span class="folder-arrow">&#9654;</span>
        <span>${esc(folder.name)}</span>
        <span class="folder-count">${folder.children.length}</span>
      </summary>`
    for (const api of folder.children) {
      html += `<label class="doc-sidebar-item" for="r-${esc(api.id)}">
        ${renderMethodTag((api.data as any).method ?? 'GET')}
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(api.name)}</span>
      </label>`
    }
    html += '</details>'
  }

  // ungrouped (root-level) APIs
  if (ungrouped.length > 0) {
    html += `<div class="folder-group">
      <div style="display:flex;align-items:center;gap:4px;padding:8px 12px;font-size:13px;font-weight:500;color:#555;background:#fafafa">
        <span style="width:14px;flex-shrink:0"></span>
        <span>未分组</span>
        <span class="folder-count">${ungrouped.length}</span>
      </div>`
    for (const api of ungrouped) {
      html += `<label class="doc-sidebar-item" for="r-${esc(api.id)}">
        ${renderMethodTag((api.data as any).method ?? 'GET')}
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(api.name)}</span>
      </label>`
    }
    html += '</div>'
  }

  return html
}

export function generateApiDocHtml(
  projectName: string,
  folders: ExportFolder[],
  ungrouped: ExportApi[],
  totalCount: number,
): string {
  const sidebar = renderSidebarTree(folders, ungrouped)

  const allApis = [...ungrouped, ...folders.flatMap(f => f.children)]
  const mainContent = allApis.length > 0
    ? allApis.map(item => renderApiDetail(item)).join('')
    : '<div class="placeholder">暂无接口数据</div>'

  // Pure CSS radio-button navigation: each API has a hidden radio; sidebar
  // labels toggle which API is visible via the sibling combinator.
  const radioInputs = allApis.length > 0
    ? allApis.map((api, i) =>
        `<input type="radio" name="api-nav" id="r-${esc(api.id)}" class="api-radio"${i === 0 ? ' checked' : ''}>`,
      ).join('')
    : ''

  // Per-API CSS: #r-{id}:checked ~ .doc-body .api-detail-{id} { display:block }
  const dynamicCss = allApis.length > 0
    ? allApis.map(api =>
        `#r-${esc(api.id)}:checked~.doc-body .api-detail-${esc(api.id)}{display:block;border-color:#1677ff;box-shadow:0 0 0 2px rgba(22,119,255,.15)}` +
        `body:has(#r-${esc(api.id)}:checked) .doc-sidebar label[for="r-${esc(api.id)}"]{background:#e6f4ff;color:#1677ff}`,
      ).join('')
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(projectName)} - API 文档</title>
<style>${CSS}${dynamicCss}</style>
</head>
<body>
${radioInputs}
<div class="doc-header">
  <h1>${esc(projectName)} - API 文档</h1>
  <span style="font-size:12px;color:#999">${totalCount} 个接口</span>
</div>
<div class="doc-body">
  <div class="doc-sidebar">
    <div class="doc-sidebar-title">接口目录 (${totalCount})</div>
    ${sidebar}
  </div>
  <div class="doc-main">${mainContent}</div>
</div>
</body>
</html>`
}

export interface ExportTreeInput {
  folders: ExportFolder[]
  ungrouped: ExportApi[]
  totalCount: number
}

export function generateMhtml(projectName: string, tree: ExportTreeInput): string {
  const html = generateApiDocHtml(projectName, tree.folders, tree.ungrouped, tree.totalCount)
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

export async function downloadMhtml(projectName: string, tree: ExportTreeInput): Promise<boolean> {
  const mhtml = generateMhtml(projectName, tree)
  const filename = `${projectName.replace(/[\\/:*?"<>|]/g, '_')}_API文档.mhtml`

  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: 'MHTML 文档', extensions: ['mhtml'] }],
  })

  if (!filePath) return false

  await invoke('write_export_file', { path: filePath, content: mhtml })
  return true
}
