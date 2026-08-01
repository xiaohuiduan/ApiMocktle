import type { CSSProperties } from 'react'

const METHOD_COLORS: Record<string, string> = {
  GET: '#4caf50',
  POST: '#fa8c16',
  PUT: '#1890ff',
  DELETE: '#fa541c',
  PATCH: '#1890ff',
  HEAD: '#1890ff',
  OPTIONS: '#722ed1',
}

const METHOD_TEXT: Record<string, string> = {
  DELETE: 'DEL',
  OPTIONS: 'OPT',
}

export function MethodBadge({ method }: { method: string }) {
  const upper = method.toUpperCase()
  const style: CSSProperties = {
    backgroundColor: METHOD_COLORS[upper] ?? '#8c8c8c',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: '20px',
    padding: '0 8px',
    borderRadius: 4,
    display: 'inline-block',
    minWidth: 48,
    textAlign: 'center',
  }

  return <span style={style}>{METHOD_TEXT[upper] ?? upper}</span>
}
