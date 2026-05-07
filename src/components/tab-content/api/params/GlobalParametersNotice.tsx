import { Tag, Typography, theme } from 'antd'

import type { ApiEnvironmentValue } from '@/types'

function getEntryValue(entry: ApiEnvironmentValue) {
  if (entry.value) {
    return { label: '已配置', value: entry.value }
  }
  return { label: '未配置', value: '-' }
}

export function GlobalParametersNotice(props: {
  title: string
  rows?: ApiEnvironmentValue[]
  overriddenNames?: Set<string>
  description?: string
  normalizeName?: (name: string) => string
}) {
  const { token } = theme.useToken()
  const {
    title,
    rows = [],
    overriddenNames = new Set<string>(),
    description = '运行时会自动带入这些全局参数；同名接口参数优先。',
    normalizeName = name => name,
  } = props

  if (rows.length === 0) {
    return null
  }

  return (
    <div
      className="mb-3 rounded-lg border px-4 py-3"
      style={{ borderColor: token.colorBorderSecondary, backgroundColor: token.colorFillQuaternary }}
    >
      <div className="mb-2">
        <Typography.Text strong>{title}</Typography.Text>
        <div className="mt-1">
          <Typography.Text type="secondary">{description}</Typography.Text>
        </div>
      </div>

      <div className="grid gap-2">
        {rows.map((row) => {
          const valueMeta = getEntryValue(row)
          const overridden = overriddenNames.has(normalizeName(row.name))

          return (
            <div
              key={row.id}
              className="grid items-center gap-2 rounded-md px-3 py-2.5"
              style={{
                backgroundColor: token.colorBgContainer,
                gridTemplateColumns: '80px minmax(0,1fr) minmax(0,1fr) 72px',
              }}
            >
              <Tag color={overridden ? 'default' : 'blue'}>{overridden ? '已覆盖' : '全局生效'}</Tag>
              <Typography.Text className="truncate" code>{row.name}</Typography.Text>
              <Typography.Text className="break-all">{valueMeta.value}</Typography.Text>
              <Typography.Text type="secondary">{valueMeta.label}</Typography.Text>
            </div>
          )
        })}
      </div>
    </div>
  )
}
