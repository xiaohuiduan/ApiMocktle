import { Tag, theme } from 'antd'

import type { ApiMenuData } from '@/components/ApiMenu'
import type { ApiDetails } from '@/types'

// HTTP 方法 -> antd Tag 预设色（浅色标签）
const METHOD_COLORS: Record<string, string | undefined> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
}

export function ApiTreeTitle({ item }: { item: ApiMenuData }) {
  const { token } = theme.useToken()
  const apiData = item.data as ApiDetails | undefined
  const method = apiData?.method.toUpperCase() ?? 'GET'
  const path = apiData?.path ?? item.name

  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5">
      <Tag
        color={METHOD_COLORS[method] ?? 'default'}
        style={{ fontSize: 11, margin: 0, minWidth: 48, textAlign: 'center' }}
      >
        {method}
      </Tag>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]" style={{ color: token.colorText }}>
          {item.name}
        </div>
        <div className="truncate text-[11px]" style={{ color: token.colorTextSecondary }}>
          {path}
        </div>
      </div>
    </div>
  )
}
