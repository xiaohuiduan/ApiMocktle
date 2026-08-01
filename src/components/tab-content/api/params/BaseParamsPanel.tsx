import { Switch, Tag, theme, Typography } from 'antd'

import type { ApiEnvironmentValue, ApiDetails, Parameter, ProjectEnvironmentConfig } from '@/types'

import { ParamsEditableTable } from '../components/ParamsEditableTable'

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
      className="mb-1 rounded-lg border px-2 py-1.5 min-w-0 overflow-hidden"
      style={{ borderColor: token.colorBorderSecondary, backgroundColor: token.colorFillQuaternary }}
    >
      <Typography.Text strong>{sourceLabel}</Typography.Text>
      <Typography.Paragraph type="secondary" className="!mb-1 mt-0.5">
        这些参数来自全局/环境配置，同名接口参数优先。
      </Typography.Paragraph>
      <div className="grid gap-1.5">
        {allRows.map((r) => {
          const overridden = localNames.has(r.name)
          const disabled = disabledNames?.has(r.name) ?? false
          const enabled = r.enable !== false && !overridden && !disabled

          return (
            <div
              key={r.name}
              className="grid items-center gap-2 rounded-md px-1.5 py-1"
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

interface BaseParamsPanelProps {
  type: 'query' | 'header' | 'cookie'
  value?: ApiDetails['parameters']
  onChange?: (value: BaseParamsPanelProps['value']) => void
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  envParameters?: ProjectEnvironmentConfig['globalParameters']
  varMap?: Map<string, string>
  disabledInheritedNames?: { query: Set<string>; header: Set<string>; cookie: Set<string> }
  onToggleInheritedParam?: (section: 'query' | 'header' | 'cookie', name: string, enabled: boolean) => void
  exampleColumnTitle?: string
  showPathParams?: boolean
}

/**
 * 基础参数面板组件，用于 Query/Headers/Cookie 三个独立 tab
 */
export function BaseParamsPanel(props: BaseParamsPanelProps) {
  const {
    type,
    value: parameters,
    onChange,
    globalParameters,
    envParameters,
    varMap,
    disabledInheritedNames,
    onToggleInheritedParam,
    exampleColumnTitle,
    showPathParams = false,
  } = props

  const getParamsByType = () => {
    switch (type) {
      case 'query':
        return parameters?.query
      case 'header':
        return parameters?.header
      case 'cookie':
        return parameters?.cookie
    }
  }

  const getGlobalParamsByType = () => {
    switch (type) {
      case 'query':
        return globalParameters?.query
      case 'header':
        return globalParameters?.header
      case 'cookie':
        return globalParameters?.cookie
    }
  }

  const getEnvParamsByType = () => {
    switch (type) {
      case 'query':
        return envParameters?.query
      case 'header':
        return envParameters?.header
      case 'cookie':
        return envParameters?.cookie
    }
  }

  const getSourceLabel = () => {
    switch (type) {
      case 'query':
        return '当前全局/环境 Query 参数'
      case 'header':
        return '当前全局/环境 Header 参数'
      case 'cookie':
        return '当前全局/环境 Cookie 参数'
    }
  }

  const handleChange = (newParams: Parameter[] | undefined) => {
    const updated = { ...parameters }
    switch (type) {
      case 'query':
        updated.query = newParams
        break
      case 'header':
        updated.header = newParams
        break
      case 'cookie':
        updated.cookie = newParams
        break
    }
    onChange?.(updated)
  }

  return (
    <div className={type === 'query' ? '' : 'pt-2'}>
      <InheritedParamsBar
        globalRows={getGlobalParamsByType()}
        envRows={getEnvParamsByType()}
        localParams={getParamsByType()}
        sourceLabel={getSourceLabel()}
        disabledNames={disabledInheritedNames?.[type]}
        onToggle={(name, enabled) => onToggleInheritedParam?.(type, name, enabled)}
      />

      <ParamsEditableTable
        showDescriptionColumn={false}
        showRequiredColumn={false}
        varMap={varMap}
        exampleColumnTitle={exampleColumnTitle}
        value={getParamsByType()}
        onChange={handleChange}
      />

      {type === 'query' && showPathParams && parameters?.path && parameters.path.length > 0 && (
        <>
          <div className="py-1">
            <Typography.Text type="secondary">Path 参数</Typography.Text>
          </div>
          <ParamsEditableTable
            isPathParamsTable
            showDescriptionColumn={false}
            showRequiredColumn={false}
            removable={false}
            exampleColumnTitle={exampleColumnTitle}
            value={parameters.path}
            onChange={(path) => {
              onChange?.({ ...parameters, path })
            }}
          />
        </>
      )}
    </div>
  )
}
