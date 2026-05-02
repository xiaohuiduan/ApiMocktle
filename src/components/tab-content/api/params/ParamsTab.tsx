import { Tabs, theme, Typography } from 'antd'

import type { ApiDetails, ProjectEnvironmentConfig } from '@/types'

import { ParamsEditableTable } from '../components/ParamsEditableTable'

import { GlobalParametersNotice } from './GlobalParametersNotice'

function BadgeLabel(props: React.PropsWithChildren<{ count?: number }>) {
  const { token } = theme.useToken()

  const { children, count } = props

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
        : null}
    </span>
  )
}

interface ParamsTabProps {
  value?: ApiDetails['parameters']
  onChange?: (value: ParamsTabProps['value']) => void
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
}

function getParamNameSet(params?: Array<{ name?: string, enable?: boolean }>) {
  return new Set(
    (params ?? [])
      .filter((item) => item.name && item.enable !== false)
      .map((item) => item.name as string),
  )
}

/**
 * 请求参数及 Headers/Cookie 页签。
 * Body 和 Auth 在 ApiDocEditing / RunTab 中独立渲染。
 */
export function ParamsTab(props: ParamsTabProps) {
  const { value: parameters, onChange, globalParameters } = props
  const queryNames = getParamNameSet(parameters?.query)
  const headerNames = new Set(Array.from(getParamNameSet(parameters?.header)).map(name => name.toLowerCase()))
  const cookieNames = getParamNameSet(parameters?.cookie)

  return (
    <Tabs
      animated={false}
      items={[
        {
          key: 'params',
          label: (
            <BadgeLabel count={(parameters?.query?.length ?? 0) + (parameters?.path?.length ?? 0)}>
              Params
            </BadgeLabel>
          ),
          children: (
            <div>
              <GlobalParametersNotice
                overriddenNames={queryNames}
                rows={globalParameters?.query}
                title="当前全局 Query 参数"
              />
              <div className="py-2">
                <Typography.Text type="secondary">Query 参数</Typography.Text>
              </div>
              <ParamsEditableTable
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
          label: 'Headers',
          children: (
            <div className="pt-2">
              <GlobalParametersNotice
                overriddenNames={headerNames}
                normalizeName={name => name.toLowerCase()}
                rows={globalParameters?.header}
                title="当前全局 Header 参数"
              />
              <ParamsEditableTable
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
          label: 'Cookie',
          children: (
            <div className="pt-2">
              <GlobalParametersNotice
                overriddenNames={cookieNames}
                rows={globalParameters?.cookie}
                title="当前全局 Cookie 参数"
              />
              <ParamsEditableTable
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
