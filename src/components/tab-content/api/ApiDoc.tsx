import { useMemo } from 'react'

import { Viewer } from '@bytemd/react'
import { Button, Card, Select, type SelectProps, Space, Tabs, theme, Tooltip } from 'antd'
import dayjs from 'dayjs'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { ApiRemoveButton } from '@/components/tab-content/api/ApiRemoveButton'
import { API_STATUS_CONFIG, HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { creator } from '@/data/remote'
import { useStyles } from '@/hooks/useStyle'
import { BodyType } from '@/enums'
import type { JsonSchema } from '@/components/JsonSchema'
import { buildSchemaExample, buildSchemaRows, denormalizeJsonSchema, type SchemaFieldRow } from '@/components/JsonSchema/schema-normalizer'
import type { ApiDetails, Parameter } from '@/types'

import { css } from '@emotion/css'


const statusOptions: SelectProps['options'] = Object.entries(API_STATUS_CONFIG).map(
  ([method, { text, color }]) => {
    return {
      value: method,
      label: (
        <span className="flex items-center">
          <span
            className="mr-2 inline-block size-[6px] rounded-full"
            style={{ backgroundColor: `var(${color})` }}
          />
          <span>{text}</span>
        </span>
      ),
    }
  },
)

function GroupTitle(props: React.PropsWithChildren<{ className?: string }>) {
  return (
    <h2 className={`text-base font-semibold opacity-80 ${props.className ?? ''}`}>
      {props.children}
    </h2>
  )
}

function BaseInfoItem({ label, value }: { label: string, value?: string }) {
  const { token } = theme.useToken()

  return (
    <div>
      <span style={{ color: token.colorTextTertiary }}>{label}</span>
      <span className="ml-2" style={{ color: token.colorTextSecondary }}>
        {value ?? '-'}
      </span>
    </div>
  )
}

function ApiParameter({ param }: { param: Parameter }) {
  const { token } = theme.useToken()

  const isLongDesc = param.description?.includes('\n')

  return (
    <div>
      <Space>
        <span
          className="inline-flex items-center text-xs font-semibold"
          style={{
            padding: `${token.paddingXXS}px ${token.paddingXS}px`,
            color: token.colorPrimary,
            backgroundColor: token.colorPrimaryBg,
            borderRadius: token.borderRadiusSM,
          }}
        >
          {param.name}
        </span>

        <span
          className="font-semibold"
          style={{
            color: token.colorTextSecondary,
          }}
        >
          {param.type}
        </span>

        {!isLongDesc && (
          <span
            className="text-xs"
            style={{
              color: token.colorTextDescription,
            }}
          >
            {param.description}
          </span>
        )}
      </Space>

      {isLongDesc && (
        <div
          className="mt-2 text-xs"
          style={{
            color: token.colorTextDescription,
          }}
        >
          <Viewer value={param.description ?? ''} />
        </div>
      )}

      <div className="ml-1 mt-2">
        <span className="text-xs">示例值：</span>
        <span
          className="text-xs"
          style={{
            padding: `0 ${token.paddingXXS}px`,
            color: token.colorTextDescription,
            backgroundColor: token.colorFillQuaternary,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusSM,
          }}
        >
          {param.example}
        </span>
      </div>
    </div>
  )
}

function stringifyParameterExample(example: Parameter['example']): string {
  if (Array.isArray(example)) {
    return example.join(',')
  }

  if (typeof example === 'string') {
    return example
  }

  return ''
}

function buildQueryStringForCopy(params?: Parameter[]): string {
  const queryText = (params ?? [])
    .filter(param => param.enable !== false && param.name)
    .map((param) => {
      const key = encodeURIComponent(param.name ?? '')
      const value = encodeURIComponent(stringifyParameterExample(param.example))
      return `${key}=${value}`
    })
    .join('&')

  return queryText ? `?${queryText}` : ''
}

export function ApiDoc() {
  const { token } = theme.useToken()

  const { messageApi } = useGlobalContext()
  const { menuRawList } = useMenuHelpersContext()
  const { tabData } = useTabContentContext()

  const { docValue, methodConfig } = useMemo(() => {
    const apiDetails = menuRawList?.find(({ id }) => id === tabData.key)?.data as
      | ApiDetails
      | undefined

    let methodConfig

    if (apiDetails) {
      methodConfig = HTTP_METHOD_CONFIG[apiDetails.method]
    }

    return { docValue: apiDetails, methodConfig }
  }, [menuRawList, tabData.key])

  const { styles } = useStyles(({ token }) => {
    return {
      card: css({
        '&.ant-card': {
          '> .ant-card-head': {
            minHeight: 'unset',
            fontWeight: 'normal',
            padding: `0 ${token.paddingSM}px`,
            fontSize: token.fontSize,

            '.ant-card-head-title': {
              padding: `${token.paddingXS}px 0`,
            },
          },
        },
      }),

      tabWithBorder: css({
        '.ant-tabs-content-holder': {
          border: `1px solid ${token.colorBorderSecondary}`,
          borderTop: 'none',
          borderBottomLeftRadius: token.borderRadius,
          borderBottomRightRadius: token.borderRadius,
        },
      }),

      requestBodySchema: css({
        marginTop: token.marginSM,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        overflow: 'hidden',

        '.schema-header': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${token.paddingXS}px ${token.paddingSM}px`,
          background: token.colorFillSecondary,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          fontSize: token.fontSizeSM,
          color: token.colorTextSecondary,
        },

        '.schema-layout': {
          display: 'grid',
          gridTemplateColumns: 'minmax(440px, 1fr) minmax(280px, 0.9fr)',
          minHeight: 380,
          background: token.colorBgContainer,
        },

        '.schema-panel': {
          minWidth: 0,
        },

        '.schema-panel + .schema-panel': {
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
        },

        '.schema-sub-title': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${token.paddingXS}px ${token.paddingSM}px`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          color: token.colorTextSecondary,
          fontSize: token.fontSizeSM,
          background: token.colorFillTertiary,
        },

        '.schema-table-head, .schema-row': {
          display: 'grid',
          gridTemplateColumns: '2.2fr 1.3fr 0.8fr 2fr',
          gap: token.paddingXS,
          padding: `${token.paddingXXS}px ${token.paddingSM}px`,
          alignItems: 'center',
        },

        '.schema-table-head': {
          position: 'sticky',
          top: 0,
          zIndex: 1,
          background: token.colorFillSecondary,
          color: token.colorTextSecondary,
          fontSize: 12,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        },

        '.schema-rows': {
          maxHeight: 335,
          overflow: 'auto',
        },

        '.schema-row': {
          color: token.colorText,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          minHeight: 36,
        },

        '.schema-field-name': {
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: token.borderRadius,
          background: token.colorPrimaryBg,
          color: token.colorPrimary,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },

        '.schema-type-text': {
          color: token.colorTextSecondary,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        },

        '.schema-required': {
          color: token.colorTextTertiary,
          fontSize: 12,
        },

        '.schema-required.is-required': {
          color: token.colorError,
        },

        '.schema-desc': {
          color: token.colorTextDescription,
          fontSize: 12,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },

        '.schema-empty': {
          color: token.colorTextTertiary,
          padding: token.paddingSM,
          fontSize: 12,
        },

        '.schema-code': {
          margin: 0,
          padding: token.paddingSM,
          background: token.colorBgLayout,
          color: token.colorText,
          fontSize: 12,
          lineHeight: 1.7,
          maxHeight: 335,
          overflow: 'auto',
        },
      }),
    }
  })

  if (!docValue || !methodConfig) {
    return null
  }

  const hasPathParams
    = Array.isArray(docValue.parameters?.path) && docValue.parameters.path.length > 0
  const hasQueryParams
    = Array.isArray(docValue.parameters?.query) && docValue.parameters.query.length > 0
  const hasHeaderParams
    = Array.isArray(docValue.parameters?.header) && docValue.parameters.header.length > 0
  const hasCookieParams
    = Array.isArray(docValue.parameters?.cookie) && docValue.parameters.cookie.length > 0
  const hasParams = hasPathParams || hasQueryParams || hasHeaderParams || hasCookieParams

  const pathParams = docValue.parameters?.path
  const queryParams = docValue.parameters?.query
  const headerParams = docValue.parameters?.header
  const cookieParams = docValue.parameters?.cookie
  const queryStringForCopy = buildQueryStringForCopy(queryParams)
  const requestBodyJsonSchema = docValue.requestBody?.jsonSchema
  const displayRequestSchema = requestBodyJsonSchema
    ? denormalizeJsonSchema(requestBodyJsonSchema)
    : undefined
  const requestSchemaRows = buildSchemaRows(requestBodyJsonSchema, menuRawList)
  const requestSchemaExample = buildSchemaExample(requestBodyJsonSchema, menuRawList)

  return (
    <div className="h-full overflow-auto p-tabContent">
      <div className="flex items-center">
        <Space className="group/action">
          <h2 className="text-base font-semibold">{docValue.name}</h2>

          <Space className="opacity-0 group-hover/action:opacity-100" size="small">
            <Tooltip title="复制 ID">
              <Button
                size="small"
                type="link"
                onClick={() => {
                  void navigator.clipboard.writeText(docValue.id).then(() => {
                    messageApi.success('已复制')
                  })
                }}
              >
                #{docValue.id}
              </Button>
            </Tooltip>
          </Space>
        </Space>

        <Space className="ml-auto pl-2">
          <ApiRemoveButton tabKey={tabData.key} />
        </Space>
      </div>

      <div className="mb-3">
        <span
          className="mr-2 px-2 py-1 text-xs/6 font-bold text-white"
          style={{
            backgroundColor: `var(${methodConfig.color})`,
            borderRadius: token.borderRadiusOuter,
          }}
        >
          {docValue.method}
        </span>
        <Tooltip title="点击复制接口地址">
          <span
            className="mr-2 cursor-pointer underline-offset-2 hover:underline"
            onClick={() => {
              if (!docValue.path) {
                return
              }

              void navigator.clipboard.writeText(docValue.path).then(() => {
                messageApi.success('接口地址已复制')
              })
            }}
          >
            {docValue.path}
          </span>
        </Tooltip>
        <Select options={statusOptions} value={docValue.status} variant="borderless" />
      </div>

      <div className="mb-3">
        <Space>
          {docValue.tags?.map((tag) => {
            return (
              <span
                key={tag}
                className="px-2 py-1 text-xs"
                style={{
                  color: token.colorPrimary,
                  backgroundColor: token.colorPrimaryBg,
                  borderRadius: token.borderRadiusXS,
                }}
              >
                {tag}
              </span>
            )
          })}
        </Space>
      </div>

      <div>
        <Space wrap size="large">
          <BaseInfoItem label="创建时间" value={dayjs(docValue.createdAt).format('YYYY年M月D日')} />
          <BaseInfoItem label="修改时间" value={dayjs(docValue.updatedAt).format('YYYY年M月D日')} />
          <BaseInfoItem label="修改者" value={creator.name} />
          <BaseInfoItem label="创建者" value={creator.name} />
          <BaseInfoItem label="责任人" value={creator.name} />
        </Space>
      </div>

      {docValue.description
        ? (
            <div>
              <GroupTitle>接口说明</GroupTitle>
              <Viewer value={docValue.description} />
            </div>
          )
        : null}

      <div>
        <GroupTitle>请求参数</GroupTitle>
        {hasParams
          ? (
              <div className="flex flex-col gap-y-4">
                {hasPathParams && (
                  <Card className={styles.card} title="Path 参数">
                    <div className="flex flex-col gap-3">
                      {pathParams?.map((param) => <ApiParameter key={param.id} param={param} />)}
                    </div>
                  </Card>
                )}

                {hasQueryParams && (
                  <Card className={styles.card} title="Query 参数">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <code className="overflow-auto rounded border px-2 py-1 text-xs">
                        {queryStringForCopy || '?'}
                      </code>
                      <Button
                        size="small"
                        type="link"
                        onClick={() => {
                          if (!queryStringForCopy) {
                            messageApi.warning('暂无可复制的 Query 参数')
                            return
                          }
                          void navigator.clipboard.writeText(queryStringForCopy).then(() => {
                            messageApi.success('Query 参数已复制')
                          })
                        }}
                      >
                        复制 Query
                      </Button>
                    </div>
                    <div className="flex flex-col gap-3">
                      {queryParams?.map((param) => <ApiParameter key={param.id} param={param} />)}
                    </div>
                  </Card>
                )}

                {hasHeaderParams && (
                  <Card className={styles.card} title="Header 参数">
                    <div className="flex flex-col gap-3">
                      {headerParams?.map((param) => <ApiParameter key={param.id} param={param} />)}
                    </div>
                  </Card>
                )}

                {hasCookieParams && (
                  <Card className={styles.card} title="Cookie 参数">
                    <div className="flex flex-col gap-3">
                      {cookieParams?.map((param) => <ApiParameter key={param.id} param={param} />)}
                    </div>
                  </Card>
                )}
              </div>
            )
          : (
              '无'
            )}
      </div>

      <div>
        <GroupTitle>请求 Body</GroupTitle>
        {!docValue.requestBody || docValue.requestBody.type === BodyType.None
          ? (
              '无'
            )
          : (
              <Card className={styles.card} title={docValue.requestBody.type}>
                {docValue.requestBody.parameters && docValue.requestBody.parameters.length > 0 && (
                  <div className="mb-3 flex flex-col gap-3">
                    {docValue.requestBody.parameters.map((param) => (
                      <ApiParameter key={param.id} param={param} />
                    ))}
                  </div>
                )}

                {displayRequestSchema !== undefined && displayRequestSchema !== null && (
                  <div className={styles.requestBodySchema}>
                    <div className="schema-header">
                      <span>application/json</span>
                      <span>Body 参数</span>
                    </div>
                    <div className="schema-layout">
                      <div className="schema-panel">
                        <div className="schema-sub-title">
                          <span>参数结构</span>
                          <span>{requestSchemaRows.length} fields</span>
                        </div>
                        <div className="schema-table-head">
                          <span>字段名</span>
                          <span>类型</span>
                          <span>必填</span>
                          <span>说明</span>
                        </div>
                        <div className="schema-rows">
                          {requestSchemaRows.length > 0
                            ? requestSchemaRows.map((row) => (
                                <div key={row.key} className="schema-row">
                                  <span style={{ paddingLeft: row.depth * 16 }}>
                                    <span className="schema-field-name">{row.name}</span>
                                  </span>
                                  <span className="schema-type-text">{row.typeLabel}</span>
                                  <span className={`schema-required${row.required ? ' is-required' : ''}`}>{row.required ? '必填' : '可选'}</span>
                                  <span className="schema-desc">{row.description ?? '-'}</span>
                                </div>
                              ))
                            : <div className="schema-empty">暂无字段定义</div>}
                        </div>
                      </div>

                      <div className="schema-panel">
                        <div className="schema-sub-title">
                          <span>示例</span>
                          <Space size={8}>
                            <span>JSON</span>
                            <Button
                              size="small"
                              type="link"
                              onClick={() => {
                                const bodyExample = JSON.stringify(
                                  requestSchemaExample ?? displayRequestSchema,
                                  null,
                                  2,
                                )
                                void navigator.clipboard.writeText(bodyExample).then(() => {
                                  messageApi.success('Body 示例已复制')
                                })
                              }}
                            >
                              复制
                            </Button>
                          </Space>
                        </div>
                        <pre className="schema-code">
                          {JSON.stringify(requestSchemaExample ?? displayRequestSchema, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )}
      </div>

      {!!docValue.responses && (
        <div>
          <GroupTitle>返回响应</GroupTitle>
          <Tabs
            className={styles.tabWithBorder}
            items={docValue.responses.map((res) => {
              const displayResSchema = res.jsonSchema
                ? denormalizeJsonSchema(res.jsonSchema)
                : undefined
              const resSchemaRows = buildSchemaRows(res.jsonSchema, menuRawList)
              const resSchemaExample = buildSchemaExample(res.jsonSchema, menuRawList)

              return {
                key: res.id,
                label: `${res.name}(${res.code})`,
                children: (
                  <div>
                    <div className="flex flex-wrap items-center gap-4 p-3">
                      <span>
                        <span style={{ color: token.colorTextSecondary }}>HTTP 状态码：</span>
                        <span>{res.code}</span>
                      </span>

                      <span>
                        <span style={{ color: token.colorTextSecondary }}>内容格式：</span>
                        <span>{res.contentType}</span>
                      </span>
                    </div>

                    {displayResSchema !== undefined && displayResSchema !== null && (
                      <div className={styles.requestBodySchema}>
                        <div className="schema-header">
                          <span>{res.contentType}</span>
                          <span>Body 参数</span>
                        </div>
                        <div className="schema-layout">
                          <div className="schema-panel">
                            <div className="schema-sub-title">
                              <span>参数结构</span>
                              <span>{resSchemaRows.length} fields</span>
                            </div>
                            <div className="schema-table-head">
                              <span>字段名</span>
                              <span>类型</span>
                              <span>必填</span>
                              <span>说明</span>
                            </div>
                            <div className="schema-rows">
                              {resSchemaRows.length > 0
                                ? resSchemaRows.map((row) => (
                                    <div key={row.key} className="schema-row">
                                      <span style={{ paddingLeft: row.depth * 16 }}>
                                        <span className="schema-field-name">{row.name}</span>
                                      </span>
                                      <span className="schema-type-text">{row.typeLabel}</span>
                                      <span className={`schema-required${row.required ? ' is-required' : ''}`}>{row.required ? '必填' : '可选'}</span>
                                      <span className="schema-desc">{row.description ?? '-'}</span>
                                    </div>
                                  ))
                                : <div className="schema-empty">暂无字段定义</div>}
                            </div>
                          </div>

                          <div className="schema-panel">
                            <div className="schema-sub-title">
                              <span>示例</span>
                              <Space size={8}>
                                <span>JSON</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    const bodyExample = JSON.stringify(
                                      resSchemaExample ?? displayResSchema,
                                      null,
                                      2,
                                    )
                                    void navigator.clipboard.writeText(bodyExample).then(() => {
                                      messageApi.success('Body 示例已复制')
                                    })
                                  }}
                                >
                                  复制
                                </Button>
                              </Space>
                            </div>
                            <pre className="schema-code">
                              {JSON.stringify(resSchemaExample ?? displayResSchema, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ),
              }
            })}
            type="card"
          />
        </div>
      )}
    </div>
  )
}
