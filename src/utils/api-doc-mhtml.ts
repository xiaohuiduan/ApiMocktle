import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

import { type JsonSchema, SchemaType } from '@/components/JsonSchema'
import {
  buildSchemaExample,
  buildSchemaRows,
  getTypeLabel,
} from '@/components/JsonSchema/schema-normalizer'
import { BodyType } from '@/enums'
import type { ApiDetailsResponse, Parameter } from '@/types'

import type { ExportApi, ExportFolder, ExportTreeInput } from './api-doc-markdown'

// ── helpers ──

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const METHOD_CLASS: Record<string, string> = {
  GET: 'method-get',
  POST: 'method-post',
  PUT: 'method-put',
  DELETE: 'method-delete',
  PATCH: 'method-patch',
}

function methodClass(method: string): string {
  return `method ${METHOD_CLASS[method.toUpperCase()] ?? 'method-default'}`
}

// ── HTML 生成 ──

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #1f2328;
  line-height: 1.6;
}
.wrap { max-width: 960px; margin: 0 auto; padding: 32px 28px 80px; }
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 20px; margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
h3 { font-size: 17px; margin: 18px 0 6px; }
h4 { font-size: 15px; margin: 20px 0 8px; }
h5 { font-size: 14px; margin: 16px 0 4px; }
.summary { color: #57606a; margin: 0 0 28px; }
.desc { color: #444; margin: 4px 0 12px; }
.meta { color: #57606a; font-size: 13px; margin: 2px 0 10px; }
.empty { color: #8b949e; font-size: 13px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 13px; }
th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #f6f8fa; font-weight: 600; white-space: nowrap; }
code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace; }
code { background: #f6f8fa; border-radius: 4px; padding: 1px 5px; font-size: 12.5px; }
pre { background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; overflow-x: auto; font-size: 12.5px; line-height: 1.55; }
.api { margin-bottom: 12px; }
.api-head { display: flex; align-items: center; gap: 10px; margin-top: 28px; }
.path { font-size: 15px; font-weight: 600; background: none; padding: 0; }
.method { display: inline-block; min-width: 56px; padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 12px; font-weight: 700; text-align: center; }
.method-get { background: #1a7f37; }
.method-post { background: #1f6feb; }
.method-put { background: #bc4c00; }
.method-delete { background: #cf222e; }
.method-patch { background: #8250df; }
.method-default { background: #57606a; }
.req { color: #cf222e; }
.label { font-weight: 600; font-size: 13px; margin: 12px 0 4px; }
.toc { padding-left: 0; list-style: none; }
.toc ul { list-style: none; padding-left: 20px; }
.toc a { color: #0969da; text-decoration: none; }
.toc a:hover { text-decoration: underline; }
.toc .method { min-width: 44px; margin-right: 8px; font-size: 11px; padding: 1px 6px; }
.toc .folder { font-weight: 600; }
@media print { .wrap { max-width: none; padding: 0; } }
`

function renderParamsTable(params: Parameter[] | undefined, title: string): string {
  if (!params?.length) {
    return ''
  }

  const rows = params
    .filter(p => p.name)
    .map((p) => {
      const example = Array.isArray(p.example) ? p.example.join(', ') : p.example

      return `<tr>
        <td>${esc(p.name)}</td>
        <td><code>${esc(String(p.type))}</code></td>
        <td>${p.required ? '<span class="req">必填</span>' : '可选'}</td>
        <td>${esc(p.description ?? '-')}</td>
        <td>${esc(example ?? '-')}</td>
      </tr>`
    })
    .join('')

  return `<h4>${esc(title)}</h4>
<table>
  <thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th><th>示例</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
`
}

function renderSchemaHtml(schema?: JsonSchema): string {
  if (!schema) {
    return ''
  }

  if (schema.type === SchemaType.Object && Array.isArray(schema.properties) && schema.properties.length > 0) {
    const rows = buildSchemaRows(schema, undefined, { resolveRefs: false })
    const rowHtml = rows
      .map((r) => `<tr>
        <td style="padding-left:${12 + r.depth * 18}px">${esc(r.name)}</td>
        <td><code>${esc(r.typeLabel)}</code></td>
        <td>${r.required ? '<span class="req">必填</span>' : '可选'}</td>
        <td>${esc(r.description ?? '-')}</td>
      </tr>`)
      .join('')
    const example = JSON.stringify(buildSchemaExample(schema), null, 2)

    return `<table>
  <thead><tr><th>字段名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
  <tbody>${rowHtml}</tbody>
</table>
<p class="label">示例</p>
<pre>${esc(example)}</pre>
`
  }

  if (schema.type === SchemaType.Array) {
    return `<p><code>array</code></p>
${renderSchemaHtml(schema.items)}
`
  }

  return `<p><code>${esc(getTypeLabel(schema))}</code></p>
`
}

function renderApiHtml(item: ExportApi, index: number): string {
  const d = item.data
  const method = String(d.method).toUpperCase()
  const path = d.path ?? '/'
  const params = d.parameters
  const reqBody = d.requestBody
  const responses: ApiDetailsResponse[] = d.responses ?? []

  const hasParams = !!params?.path?.length
    || !!params?.query?.length
    || !!params?.header?.length
    || !!params?.cookie?.length
  const hasBody = reqBody && reqBody.type !== BodyType.None
  const hasResponses = responses.length > 0

  let html = `<section class="api" id="api-${index}">
<div class="api-head"><span class="${methodClass(method)}">${esc(method)}</span><code class="path">${esc(path)}</code></div>
<h3>${esc(item.name)}</h3>
`

  if (d.description) {
    html += `<p class="desc">${esc(d.description)}</p>
`
  }

  if (hasParams) {
    html += `<h4>请求参数</h4>
`
    html += renderParamsTable(params.path, 'Path 参数')
    html += renderParamsTable(params.query, 'Query 参数')
    html += renderParamsTable(params.header, 'Header 参数')
    html += renderParamsTable(params.cookie, 'Cookie 参数')
  }

  if (hasBody) {
    const bodyLabel = reqBody.type === BodyType.Json
      ? 'JSON'
      : reqBody.type === BodyType.FormData ? 'Form Data' : 'Raw'
    html += `<h4>请求体（${esc(bodyLabel)}）</h4>
`

    if (reqBody.jsonSchema) {
      html += renderSchemaHtml(reqBody.jsonSchema)
    }
  }

  if (hasResponses) {
    html += `<h4>返回响应</h4>
`
    responses.forEach((resp) => {
      html += `<h5>${esc(resp.code)} ${esc(resp.name)}</h5>
<p class="meta">状态码 <code>${esc(resp.code)}</code> · 内容格式 <code>${esc(resp.contentType ?? 'json')}</code></p>
`

      if (resp.jsonSchema) {
        html += renderSchemaHtml(resp.jsonSchema)
      }
      else {
        html += `<p class="empty">无 Schema 信息</p>
`
      }
    })
  }

  return html + '</section>\n'
}

function renderToc(
  folders: ExportFolder[],
  ungrouped: ExportApi[],
  indexById: Map<string, number>,
): string {
  let html = '<h2>目录</h2>\n<ul class="toc">\n'

  for (const folder of folders) {
    html += `<li><span class="folder">${esc(folder.name)}</span>
<ul>
`

    for (const api of folder.children) {
      const d = api.data
      const method = String(d.method).toUpperCase()
      const path = d.path ?? '/'
      html += `<li><a href="#api-${indexById.get(api.id) ?? 0}"><span class="${methodClass(method)}">${esc(method)}</span>${esc(path)} ${esc(api.name)}</a></li>
`
    }

    html += '</ul>\n</li>\n'
  }

  if (ungrouped.length > 0) {
    html += `<li><span class="folder">未分组</span>
<ul>
`

    for (const api of ungrouped) {
      const d = api.data
      const method = String(d.method).toUpperCase()
      const path = d.path ?? '/'
      html += `<li><a href="#api-${indexById.get(api.id) ?? 0}"><span class="${methodClass(method)}">${esc(method)}</span>${esc(path)} ${esc(api.name)}</a></li>
`
    }

    html += '</ul>\n</li>\n'
  }

  return html + '</ul>\n'
}

export function generateApiDocHtml(
  projectName: string,
  folders: ExportFolder[],
  ungrouped: ExportApi[],
  totalCount: number,
): string {
  let index = 0
  const indexById = new Map<string, number>()

  for (const folder of folders) {
    for (const api of folder.children) {
      indexById.set(api.id, index++)
    }
  }

  for (const api of ungrouped) {
    indexById.set(api.id, index++)
  }

  const bodyParts: string[] = []
  let apiIndex = 0

  for (const folder of folders) {
    bodyParts.push(`<h2>${esc(folder.name)}</h2>
`)

    for (const api of folder.children) {
      bodyParts.push(renderApiHtml(api, apiIndex++))
    }
  }

  if (ungrouped.length > 0) {
    bodyParts.push('<h2>未分组</h2>\n')

    for (const api of ungrouped) {
      bodyParts.push(renderApiHtml(api, apiIndex++))
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(projectName)} - API 文档</title>
<style>
${CSS}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>${esc(projectName)} - API 文档</h1>
<p class="summary">共 ${totalCount} 个接口</p>
</header>
${renderToc(folders, ungrouped, indexById)}
<main>
${bodyParts.join('')}
</main>
</div>
</body>
</html>
`
}

// ── MHTML 封装 ──

function base64Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined
    out += alphabet[b0 >> 2]
    out += alphabet[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : alphabet[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : alphabet[b2 & 63]
  }

  return out
}

function encodeHeaderValue(text: string): string {
  return `=?UTF-8?B?${base64Encode(new TextEncoder().encode(text))}?=`
}

/** 将 HTML 按 UTF-8 字节编码为 quoted-printable,每行不超过 76 字符 */
export function quotedPrintable(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const out: string[] = []
  let line = ''

  const flush = (softBreak: boolean) => {
    if (line) {
      out.push(line)
    }

    if (softBreak) {
      out.push('=')
    }

    out.push('\r\n')
    line = ''
  }

  for (const b of bytes) {
    let token: string

    if (b === 0x3d) {
      token = '=3D'
    }
    else if (b === 0x20) {
      // 空格统一编码,避免行首/行尾空格被解码器剥掉
      token = '=20'
    }
    else if (b >= 0x21 && b <= 0x7e) {
      token = String.fromCharCode(b)
    }
    else {
      token = `=${b.toString(16).toUpperCase().padStart(2, '0')}`
    }

    if (line.length + token.length > 75) {
      flush(true)
    }

    line += token
  }

  flush(false)

  return out.join('')
}

export function generateApiDocMhtml(
  projectName: string,
  folders: ExportFolder[],
  ungrouped: ExportApi[],
  totalCount: number,
): string {
  const html = generateApiDocHtml(projectName, folders, ungrouped, totalCount)
  const boundary = `----=_ApiMocktle_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

  return [
    'MIME-Version: 1.0',
    'From: <ApiMocktle>',
    'Snapshot-Content-Location: about:blank',
    `Subject: ${encodeHeaderValue(`${projectName} - API 文档`)}`,
    'Content-Type: multipart/related;',
    `\tboundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    'Content-Location: api-doc.html',
    '',
    quotedPrintable(html),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

export async function downloadMhtml(projectName: string, tree: ExportTreeInput): Promise<boolean> {
  const mhtml = generateApiDocMhtml(projectName, tree.folders, tree.ungrouped, tree.totalCount)
  const filename = `${projectName.replace(/[\\/:*?"<>|]/g, '_')}_API文档.mhtml`

  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: 'MHTML 网页文件', extensions: ['mhtml'] }],
  })

  if (!filePath) {
    return false
  }

  await invoke('write_export_file', { path: filePath, content: mhtml })

  return true
}
