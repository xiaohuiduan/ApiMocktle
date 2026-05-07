import { Switch, Tabs, Tag, theme, Typography } from 'antd'

import type { ApiEnvironmentValue, ApiDetails, ProjectEnvironmentConfig } from '@/types'

import { ParamsEditableTable } from '../components/ParamsEditableTable'

function TabLabel(props: React.PropsWithChildren<{ count?: number, hasContent?: boolean }>) {
  const { token } = theme.useToken()
  const { children, count, hasContent } = props

  return (
    <span>
      {children}

      {typeof count === 'number' && count > 0
        ? (
            <span
              className="ml-1 inline-flex size-4 items-center justify-center rounded-full text-xs"
              style={{ backgroundColor: token.colorFillContent, color: token.colorSuccessActive }}
            >
              {count}
            </span>
          )
        : hasContent
          ? (
              <span className="ml-0.5 text-xs" style={{ color: token.colorSuccess }}>*</span>
            )
          : null}
    </span>
  )
}

interface ParamsTabProps {
  value?: ApiDetails['parameters']
  onChange?: (value: ParamsTabProps['value']) => void
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  envParameters?: ProjectEnvironmentConfig['globalParameters']
  varMap?: Map<string, string>
  disabledInheritedNames?: { query: Set<string>; header: Set<string>; cookie: Set<string> }
  onToggleInheritedParam?: (section: 'query' | 'header' | 'cookie', name: string, enabled: boolean) => void
}

/**
 * 环境/全局参数参考条（只读，带启用/禁用开关）。
 * 切换开关时通过 disabledNames Set 控制，不影响用户参数列表。
 */
function InheritedParamsBar(props: {
  globalRows?: ApiEnvironmentValue[]
  envRows?: ApiEnvironmentValue[]
  localParams?: { name?: string; enable?: boolean }[]
  sourceLabel: string
  disabledNames?: Set<string>
  onToggle: (name: string, enabled: boolean) => void
}) {
  const { token } = theme.useToken()
  const { globalRows, envRows, localParams, sourceLabel, disabledNames, onToggle } = props

  const localNames = new Set((localParams ?? []).map(p => p.name).filter(Boolean))

  const allRows: { name: string; value?: string; enable?: boolean; source: 'global' | 'env' }[] = []
  for (const g of (globalRows ?? [])) {
    if (g.name && !allRows.some(r => r.name === g.name)) {
      allRows.push({ name: g.name, value: g.value, enable: g.enable, source: 'global' })
    }
  }
  for (const e of (envRows ?? [])) {
    if (e.name && !allRows.some(r => r.name === e.name)) {
      // env overrides global by replacing it
      const existing = allRows.findIndex(r => r.name === e.name)
      if (existing >= 0) allRows[existing] = { name: e.name, value: e.value, enable: e.enable, source: 'env' }
      else allRows.push({ name: e.name, value: e.value, enable: e.enable, source: 'env' })
    }
  }

  if (allRows.length === 0) return null

  return (
    <div
      className="mb-3 rounded-lg border px-4 py-3"
      style={{ borderColor: token.colorBorderSecondary, backgroundColor: token.colorFillQuaternary }}
    >
      <Typography.Text strong>{sourceLabel}</Typography.Text>
      <Typography.Paragraph type="secondary" className="!mb-2 mt-1">
        这些参数来自全局/环境配置，同名接口参数优先。
      </Typography.Paragraph>
      <div className="grid gap-2">
        {allRows.map((r) => {
          const overridden = localNames.has(r.name)
          const disabled = disabledNames?.has(r.name) ?? false
          const enabled = r.enable !== false && !overridden && !disabled

          return (
            <div
              key={r.name}
              className="grid items-center gap-3 rounded-md px-3 py-2"
              style={{
                backgroundColor: token.colorBgContainer,
                gridTemplateColumns: '72px minmax(0,1fr) minmax(0,1fr) 48px',
              }}
            >
              <Tag color={overridden ? 'default' : r.source === 'env' ? 'purple' : 'blue'}>
                {r.source === 'env' ? '环境' : '全局'}
                {overridden ? ' (已覆盖)' : ''}
              </Tag>
              <Typography.Text code className="truncate">{r.name}</Typography.Text>
              <Typography.Text type="secondary" className="truncate">
                {r.value || '—'}
              </Typography.Text>
              <div className="flex justify-center">
                <Switch
                  checked={enabled}
                  disabled={overridden}
                  size="small"
                  onChange={(checked) => {
                    onToggle(r.name, checked)
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 请求参数及 Headers/Cookie 页签。
 * 全局/环境参数在独立参考区展示，本地参数在可编辑表格中。
 */
export function ParamsTab(props: ParamsTabProps) {
  const { value: parameters, onChange, globalParameters, envParameters, varMap, disabledInheritedNames, onToggleInheritedParam } = props

  const queryCount = (parameters?.query?.length ?? 0) + (parameters?.path?.length ?? 0)
    + (globalParameters?.query?.length ?? 0) + (envParameters?.query?.length ?? 0)
  const hasAnyHeader = (parameters?.header?.length ?? 0) + (globalParameters?.header?.length ?? 0) + (envParameters?.header?.length ?? 0) > 0
  const hasAnyCookie = (parameters?.cookie?.length ?? 0) + (globalParameters?.cookie?.length ?? 0) + (envParameters?.cookie?.length ?? 0) > 0

  return (
    <Tabs
      animated={false}
      items={[
        {
          key: 'params',
          label: (
            <TabLabel count={queryCount}>
              Params
            </TabLabel>
          ),
          children: (
            <div>
              <InheritedParamsBar
                globalRows={globalParameters?.query}
                envRows={envParameters?.query}
                localParams={parameters?.query}
                sourceLabel="当前全局/环境 Query 参数"
                disabledNames={disabledInheritedNames?.query}
                onToggle={(name, enabled) => onToggleInheritedParam?.('query', name, enabled)}
              />
              <div className="py-2">
                <Typography.Text type="secondary">Query 参数</Typography.Text>
              </div>
              <ParamsEditableTable
                varMap={varMap}
                value={parameters?.query}
                onChange={(query) => {
                  onChange?.({ ...parameters, query })
                }}
              />

              {parameters?.path && parameters.path.length > 0
                ? (
                    <>
                      <div className="py-2">
                        <Typography.Text type="secondary">Path 参数</Typography.Text>
                      </div>
                      <ParamsEditableTable
                        isPathParamsTable
                        autoNewRow={false}
                        removable={false}
                        value={parameters.path}
                        onChange={(path) => {
                          onChange?.({ ...parameters, path })
                        }}
                      />
                    </>
                  )
                : null}
            </div>
          ),
        },

        {
          key: 'headers',
          label: (
            <TabLabel hasContent={hasAnyHeader}>
              Headers
            </TabLabel>
          ),
          children: (
            <div className="pt-2">
              <InheritedParamsBar
                globalRows={globalParameters?.header}
                envRows={envParameters?.header}
                localParams={parameters?.header}
                sourceLabel="当前全局/环境 Header 参数"
                disabledNames={disabledInheritedNames?.header}
                onToggle={(name, enabled) => onToggleInheritedParam?.('header', name, enabled)}
              />
              <ParamsEditableTable
                varMap={varMap}
                value={parameters?.header}
                onChange={(header) => {
                  onChange?.({ ...parameters, header })
                }}
              />
            </div>
          ),
        },

        {
          key: 'cookie',
          label: (
            <TabLabel hasContent={hasAnyCookie}>
              Cookie
            </TabLabel>
          ),
          children: (
            <div className="pt-2">
              <InheritedParamsBar
                globalRows={globalParameters?.cookie}
                envRows={envParameters?.cookie}
                localParams={parameters?.cookie}
                sourceLabel="当前全局/环境 Cookie 参数"
                disabledNames={disabledInheritedNames?.cookie}
                onToggle={(name, enabled) => onToggleInheritedParam?.('cookie', name, enabled)}
              />
              <ParamsEditableTable
                varMap={varMap}
                value={parameters?.cookie}
                onChange={(cookie) => {
                  onChange?.({ ...parameters, cookie })
                }}
              />
            </div>
          ),
        },
      ]}
    />
  )
}
