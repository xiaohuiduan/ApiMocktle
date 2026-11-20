import { useTranslation } from 'react-i18next'

import { Tag, theme, Typography } from 'antd'

import type { ApiEnvironmentValue } from '@/types'

/** 参数值展示元信息；文案在渲染期翻译。 */
function getEntryValue(entry: ApiEnvironmentValue, t: (key: 'api.params.configured' | 'api.params.notConfigured') => string) {
  if (entry.value) {
    return { label: t('api.params.configured'), value: entry.value }
  }

  return { label: t('api.params.notConfigured'), value: '-' }
}

export function GlobalParametersNotice(props: {
  title: string
  rows?: ApiEnvironmentValue[]
  overriddenNames?: Set<string>
  description?: string
  normalizeName?: (name: string) => string
}) {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const {
    title,
    rows = [],
    overriddenNames = new Set<string>(),
    description,
    normalizeName = (name) => name,
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
          <Typography.Text type="secondary">{description ?? t('api.params.globalActive')}</Typography.Text>
        </div>
      </div>

      <div className="grid gap-2">
        {rows.map((row) => {
          const valueMeta = getEntryValue(row, t)
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
              <Tag color={overridden ? 'default' : 'blue'}>
                {overridden ? t('api.params.overridden') : t('api.params.globalEffective')}
              </Tag>
              <Typography.Text code className="truncate">{row.name}</Typography.Text>
              <Typography.Text className="break-all">{valueMeta.value}</Typography.Text>
              <Typography.Text type="secondary">{valueMeta.label}</Typography.Text>
            </div>
          )
        })}
      </div>
    </div>
  )
}
