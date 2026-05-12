export function getStatusColor(code: number): string {
  if (code >= 500) return 'error'
  if (code >= 400) return 'warning'
  if (code >= 300) return 'processing'
  return 'success'
}

export function detectLanguage(contentType?: string): string {
  if (!contentType) return 'plaintext'
  const ct = contentType.toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml')) return 'xml'
  if (ct.includes('javascript')) return 'javascript'
  if (ct.includes('css')) return 'css'
  return 'plaintext'
}

export function calcBodySize(body?: string): string {
  if (!body) return ''
  const bytes = new Blob([body]).size
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

export const headerTableColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name', width: 200 },
  { title: 'Value', dataIndex: 'value', key: 'value' },
]
