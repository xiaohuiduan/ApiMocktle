import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'

import { Viewer } from '@bytemd/react'
import { Button, Card, Select, type SelectProps, Space, Tabs, theme, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { buildSchemaExample, buildSchemaRows, denormalizeJsonSchema, type SchemaFieldRow } from '@/components/JsonSchema/schema-normalizer'
import { ApiRemoveButton } from '@/components/tab-content/api/ApiRemoveButton'
import { API_STATUS_CONFIG, HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { BodyType } from '@/enums'
import { useStyles } from '@/hooks/useStyle'
import { translateKey } from '@/i18n/translate'
import type { ApiDetails, Parameter } from '@/types'

import { css } from '@emotion/css'

/**
 * 接口状态下拉选项。
 *
 * 函数化而非模块顶层常量：文案随语言变化，模块顶层只会求值一次。
 */
function createStatusOptions(): SelectProps['options'] {
  return Object.entries(API_STATUS_CONFIG).map(
    ([status, { textKey, color }]) => {
      return {
        value: status,
        label: (
          <span className="flex items-center">
            <span
              className="mr-2 inline-block size-[6px] rounded-full"
              style={{ backgroundColor: `var(${color})` }}
            />
            <span>{translateKey(textKey)}</span>
          </span>
        ),
      }
    },
  )
}

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
  const { t } = useTranslation()

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
        <span className="text-xs">{t('api.doc.exampleValueLabel')}</span>
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
    .filter((param) => param.enable !== false && param.name)
    .map((param) => {
      const key = encodeURIComponent(param.name ?? '')
      const value = encodeURIComponent(stringifyParameterExample(param.example))

      return `${key}=${value}`
    })
    .join('&')

  return queryText ? `?${queryText}` : ''
}

interface SchemaLayoutProps {
  leftPanel: React.ReactNode
  rightPanel: React.ReactNode
  autoSaveId: string
}

function SchemaLayout({ leftPanel, rightPanel, autoSaveId }: SchemaLayoutProps) {
  const { token } = theme.useToken()
  const leftPanelRef = useRef<ImperativePanelHandle>(null)
  const rightPanelRef = useRef<ImperativePanelHandle>(null)
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
  const [isRightCollapsed, setIsRightCollapsed] = useState(false)

  return (
    <div className="relative flex">
      {isLeftCollapsed && (
        <div
          className={`absolute left-0 top-1/2 z-50 flex h-12 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-lg ${css({
            backgroundColor: token.colorFillAlter,
            boxShadow: '1px 0 4px rgba(16 24 40 / 0.08)',
            color: token.colorPrimary,
            '&:hover': {
              backgroundColor: token.colorFillSecondary,
            },
          })}`}
          onClick={() => leftPanelRef.current?.expand()}
        >
          <ChevronRightIcon size={12} strokeWidth={3} />
        </div>
      )}

      <PanelGroup
        autoSaveId={autoSaveId}
        className="schema-layout"
        direction="horizontal"
      >
        <Panel
          ref={leftPanelRef}
          collapsible
          className="schema-panel"
          defaultSize={58}
          minSize={15}
          onCollapse={() => { setIsLeftCollapsed(true) }}
          onExpand={() => { setIsLeftCollapsed(false) }}
        >
          {leftPanel}
        </Panel>

        <PanelResizeHandle className="schema-resize-handle" />

        <Panel
          ref={rightPanelRef}
          collapsible
          className="schema-panel"
          defaultSize={42}
          minSize={15}
          onCollapse={() => { setIsRightCollapsed(true) }}
          onExpand={() => { setIsRightCollapsed(false) }}
        >
          {rightPanel}
        </Panel>
      </PanelGroup>

      {isRightCollapsed && (
        <div
          className={`absolute right-0 top-1/2 z-50 flex h-12 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-lg ${css({
            backgroundColor: token.colorFillAlter,
            boxShadow: '-1px 0 4px rgba(16 24 40 / 0.08)',
            color: token.colorPrimary,
            '&:hover': {
              backgroundColor: token.colorFillSecondary,
            },
          })}`}
          onClick={() => rightPanelRef.current?.expand()}
        >
          <ChevronLeftIcon size={12} strokeWidth={3} />
        </div>
      )}
    </div>
  )
}

/** 请求/响应 Body 参数结构表：整列共享宽度（字段名/类型/必填按最宽内容自适应，说明占剩余）。 */
function SchemaFieldTable({ rows }: { rows: SchemaFieldRow[] }) {
  const { t } = useTranslation()

  return (
    <div className="schema-rows">
      <table className="schema-table">
        <thead>
          <tr>
            <th>{t('api.doc.fieldName')}</th>
            <th>{t('common.type')}</th>
            <th>{t('common.required')}</th>
            <th>{t('common.description')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0
            ? rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <span style={{ paddingLeft: row.depth * 16 }}>
                      <Tooltip title={row.name}>
                        <span className="schema-field-name">{row.name}</span>
                      </Tooltip>
                    </span>
                  </td>
                  <td>
                    <span className="schema-type-text">{row.typeLabel}</span>
                  </td>
                  <td>
                    <span className={`schema-required${row.required ? ' is-required' : ''}`}>
                      {row.required ? t('common.required') : t('common.optional')}
                    </span>
                  </td>
                  <td>
                    <Tooltip title={row.description ?? '-'}>
                      <span className="schema-desc">{row.description ?? '-'}</span>
                    </Tooltip>
                  </td>
                </tr>
              ))
            : (
                <tr>
                  <td className="schema-empty" colSpan={4}>{t('api.doc.noFieldDef')}</td>
                </tr>
              )}
        </tbody>
      </table>
    </div>
  )
}

export function ApiDoc() {
  const { token } = theme.useToken()
  const { t } = useTranslation()

  const { messageApi } = useGlobalContext()
  const { menuRawList } = useMenuHelpersContext()
  const { tabData } = useTabContentContext()

  // t 作为依赖：语言切换时重新生成选项
  const statusOptions = useMemo(() => createStatusOptions(), [t])

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
          display: 'flex',
          minHeight: 380,
          background: token.colorBgContainer,
        },

        '.schema-panel': {
          minWidth: 0,
          overflow: 'auto',
        },

        '.schema-resize-handle': {
          width: 3,
          background: token.colorBorderSecondary,
          cursor: 'col-resize',
          transition: 'background-color 0.2s',
          '&:hover, &[data-resize-handle-state="hover"], &[data-resize-handle-state="drag"]': {
            background: token.colorPrimary,
          },
        },

        '.schema-expand-trigger': {
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 48,
          backgroundColor: token.colorFillAlter,
          boxShadow: '-1px 0 4px rgba(16 24 40 / 0.08)',
          borderRadius: token.borderRadius,
          cursor: 'pointer',
          color: token.colorPrimary,
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: token.colorFillSecondary,
          },
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

        '.schema-rows': {
          maxHeight: 335,
          overflow: 'auto',
        },

        '.schema-table': {
          width: '100%',
          tableLayout: 'auto',
          // 注意：border-collapse 不能为 collapse——sticky 表头在 collapse 模式下
          // 背景会被滚动上来的行内容穿透覆盖（列名与字段名重叠的 Chromium bug），
          // separate + spacing 0 外观一致且 sticky 背景完整
          borderCollapse: 'separate',
          borderSpacing: 0,
          color: token.colorText,

          'th, td': {
            textAlign: 'left',
            verticalAlign: 'middle',
            padding: `${token.paddingXS}px ${token.padding}px`,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          },

          th: {
            position: 'sticky',
            top: 0,
            zIndex: 1,
            // 表头背景必须不透明：colorFillSecondary 是半透明 rgba，滚动时行内容
            // 会从表头背景透出（列名与字段名视觉重叠）
            background: 'var(--color-bg-hover, #eef0f4)',
            color: token.colorTextSecondary,
            fontSize: 12,
          },

          // 字段名/类型/必填按内容自适应，说明列吃满剩余宽度
          'th:nth-child(4), td:nth-child(4)': {
            width: '100%',
          },

          td: {
            minWidth: 0,
          },
        },

        '.schema-table td:first-child': {
          whiteSpace: 'nowrap',
        },

        '.schema-table .schema-field-name': {
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

        '.schema-table .schema-type-text': {
          color: token.colorTextSecondary,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          whiteSpace: 'nowrap',
        },

        '.schema-table .schema-required': {
          color: token.colorTextTertiary,
          fontSize: 12,
          whiteSpace: 'nowrap',
        },

        '.schema-table .schema-required.is-required': {
          color: token.colorError,
        },

        '.schema-table .schema-desc': {
          display: 'block',
          color: token.colorTextDescription,
          fontSize: 12,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },

        '.schema-table .schema-empty': {
          color: token.colorTextTertiary,
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

          <Space className="opacity-60 transition-opacity hover:opacity-100" size="small">
            <Tooltip title={t('api.doc.copyId')}>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  void navigator.clipboard.writeText(docValue.id).then(() => {
                    messageApi.success(t('common.copied'))
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
        <Tooltip title={t('api.doc.clickCopyPath')}>
          <span
            className="mr-2 cursor-pointer underline-offset-2 hover:underline"
            onClick={() => {
              if (!docValue.path) {
                return
              }

              void navigator.clipboard.writeText(docValue.path).then(() => {
                messageApi.success(t('api.doc.pathCopied'))
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
          <BaseInfoItem label={t('common.createdAt')} value={dayjs(docValue.createdAt).format(t('api.doc.dateFormat'))} />
          <BaseInfoItem label={t('common.updatedAt')} value={dayjs(docValue.updatedAt).format(t('api.doc.dateFormat'))} />
        </Space>
      </div>

      {docValue.description
        ? (
            <div>
              <GroupTitle>{t('api.doc.apiDescription')}</GroupTitle>
              <Viewer value={docValue.description} />
            </div>
          )
        : null}

      <div>
        <GroupTitle>{t('api.doc.requestParams')}</GroupTitle>
        {hasParams
          ? (
              <div className="flex flex-col gap-y-4">
                {hasPathParams && (
                  <Card className={styles.card} title={t('api.doc.pathParams')}>
                    <div className="flex flex-col gap-3">
                      {pathParams?.map((param) => <ApiParameter key={param.id} param={param} />)}
                    </div>
                  </Card>
                )}

                {hasQueryParams && (
                  <Card className={styles.card} title={t('api.doc.queryParams')}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <code className="overflow-auto rounded border px-2 py-1 text-xs">
                        {queryStringForCopy || '?'}
                      </code>
                      <Button
                        size="small"
                        type="link"
                        onClick={() => {
                          if (!queryStringForCopy) {
                            messageApi.warning(t('api.doc.noQueryToCopy'))

                            return
                          }

                          void navigator.clipboard.writeText(queryStringForCopy).then(() => {
                            messageApi.success(t('api.doc.queryCopied'))
                          })
                        }}
                      >
                        {t('api.doc.copyQuery')}
                      </Button>
                    </div>
                    <div className="flex flex-col gap-3">
                      {queryParams?.map((param) => <ApiParameter key={param.id} param={param} />)}
                    </div>
                  </Card>
                )}

                {hasHeaderParams && (
                  <Card className={styles.card} title={t('api.doc.headerParams')}>
                    <div className="flex flex-col gap-3">
                      {headerParams?.map((param) => <ApiParameter key={param.id} param={param} />)}
                    </div>
                  </Card>
                )}

                {hasCookieParams && (
                  <Card className={styles.card} title={t('api.doc.cookieParams')}>
                    <div className="flex flex-col gap-3">
                      {cookieParams?.map((param) => <ApiParameter key={param.id} param={param} />)}
                    </div>
                  </Card>
                )}
              </div>
            )
          : (
              t('common.none')
            )}
      </div>

      <div>
        <GroupTitle>{t('api.doc.requestBody')}</GroupTitle>
        {!docValue.requestBody || docValue.requestBody.type === BodyType.None
          ? (
              t('common.none')
            )
          : (
              <Card
                className={styles.card}
                title={(
                  <span>
                    {docValue.requestBody.type}
                    {docValue.requestBody.required && (
                      <span style={{ marginLeft: 6, color: token.colorError }}>{t('common.required')}</span>
                    )}
                  </span>
                )}
              >
                {docValue.requestBody.parameters && docValue.requestBody.parameters.length > 0 && (
                  <div className="mb-3 flex flex-col gap-3">
                    {docValue.requestBody.parameters.map((param) => (
                      <ApiParameter key={param.id} param={param} />
                    ))}
                  </div>
                )}

                {docValue.requestBody.examples && docValue.requestBody.examples.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 text-xs" style={{ color: token.colorTextSecondary }}>
                      {t('api.doc.bodyExample')}
                    </div>
                    {docValue.requestBody.examples.map((example, idx) => {
                      return (
                        <div key={idx} className="mb-2">
                          {example.name && (
                            <div className="text-xs" style={{ color: token.colorTextTertiary }}>
                              {example.name}
                            </div>
                          )}
                          <pre className="schema-code">
                            {typeof example.value === 'string'
                              ? example.value
                              : JSON.stringify(example.value, null, 2)}
                          </pre>
                        </div>
                      )
                    })}
                  </div>
                )}

                {displayRequestSchema !== undefined && displayRequestSchema !== null && (
                  <div className={styles.requestBodySchema}>
                    <div className="schema-header">
                      <span>application/json</span>
                      <span>{t('api.doc.bodyParams')}</span>
                    </div>
                    <SchemaLayout
                      autoSaveId="api-doc-req-body"
                      leftPanel={(
                        <>
                          <div className="schema-sub-title">
                            <span>{t('api.doc.schemaStructure')}</span>
                            <span>{requestSchemaRows.length} fields</span>
                          </div>
                          <SchemaFieldTable rows={requestSchemaRows} />
                        </>
                      )}
                      rightPanel={(
                        <>
                          <div className="schema-sub-title">
                            <span>{t('api.doc.example')}</span>
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
                                    messageApi.success(t('api.doc.bodyExampleCopied'))
                                  })
                                }}
                              >
                                {t('common.copy')}
                              </Button>
                            </Space>
                          </div>
                          <pre className="schema-code">
                            {JSON.stringify(requestSchemaExample ?? displayRequestSchema, null, 2)}
                          </pre>
                        </>
                      )}
                    />
                  </div>
                )}
              </Card>
            )}
      </div>

      {!!docValue.responses && (
        <div>
          <GroupTitle>{t('api.doc.responses')}</GroupTitle>
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
                        <span style={{ color: token.colorTextSecondary }}>{t('api.doc.httpStatusLabel')}</span>
                        <span>{res.code}</span>
                      </span>

                      <span>
                        <span style={{ color: token.colorTextSecondary }}>{t('api.doc.contentTypeLabel')}</span>
                        <span>{res.contentType}</span>
                      </span>
                    </div>

                    {res.description && (
                      <div className="px-3 pb-3 text-xs" style={{ color: token.colorTextSecondary }}>
                        <span>{t('api.doc.responseDescLabel')}</span>
                        <span>{res.description}</span>
                      </div>
                    )}

                    {res.example !== undefined && res.example !== null && (
                      <div className="px-3 pb-3">
                        <div className="mb-1 text-xs" style={{ color: token.colorTextSecondary }}>
                          {t('api.doc.responseExample')}
                        </div>
                        <pre className="schema-code">
                          {typeof res.example === 'string'
                            ? res.example
                            : JSON.stringify(res.example, null, 2)}
                        </pre>
                      </div>
                    )}

                    {displayResSchema !== undefined && displayResSchema !== null && (
                      <div className={styles.requestBodySchema}>
                        <div className="schema-header">
                          <span>{res.contentType}</span>
                          <span>{t('api.doc.bodyParams')}</span>
                        </div>
                        <SchemaLayout
                          autoSaveId={`api-doc-res-body-${res.id}`}
                          leftPanel={(
                            <>
                              <div className="schema-sub-title">
                                <span>{t('api.doc.schemaStructure')}</span>
                                <span>{resSchemaRows.length} fields</span>
                              </div>
                              <SchemaFieldTable rows={resSchemaRows} />
                            </>
                          )}
                          rightPanel={(
                            <>
                              <div className="schema-sub-title">
                                <span>{t('api.doc.example')}</span>
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
                                        messageApi.success(t('api.doc.bodyExampleCopied'))
                                      })
                                    }}
                                  >
                                    {t('common.copy')}
                                  </Button>
                                </Space>
                              </div>
                              <pre className="schema-code">
                                {JSON.stringify(resSchemaExample ?? displayResSchema, null, 2)}
                              </pre>
                            </>
                          )}
                        />
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
