import { useMemo } from 'react'

import { Button, Modal, Switch, Tag, theme, Typography } from 'antd'

import { MonacoEditor } from '@/components/MonacoEditor'
import { BodyType } from '@/enums'
import type { ApiRequestBody, Parameter } from '@/types'
import { DYNAMIC_VARIABLE_DEFS } from '@/utils/dynamic-variables'

import { DynamicVariablesHelp } from '../components/DynamicVariablesHelp'
import { ParamsEditableTable } from '../components/ParamsEditableTable'

/** 判断某个 body 类型是否已有内容（用于类型标签的绿标） */
function bodyTypeHasContent(requestBody: ApiRequestBody | undefined, t: BodyType): boolean {
  if (!requestBody) {
    return false
  }

  if (t === BodyType.FormData || t === BodyType.UrlEncoded) {
    return (requestBody.parameters ?? []).some((p) => p.name && p.enable !== false)
  }

  if (t === BodyType.Json) {
    const schema = requestBody.jsonSchema as { properties?: unknown[] } | undefined

    return !!(schema?.properties?.length) || !!(requestBody.rawText?.trim())
  }

  if (t === BodyType.Xml || t === BodyType.Raw || t === BodyType.Binary) {
    return !!(requestBody.rawText?.trim())
  }

  return false
}

const bodyTypeOptions = [
  { n: 'none', t: BodyType.None },
  { n: 'form-data', t: BodyType.FormData },
  { n: 'url-encoded', t: BodyType.UrlEncoded },
  { n: 'json', t: BodyType.Json },
  { n: 'xml', t: BodyType.Xml },
  { n: 'raw', t: BodyType.Raw },
  { n: 'binary', t: BodyType.Binary },
]

interface BodyPanelProps {
  requestBody?: ApiRequestBody
  bodyRawText?: string
  onBodyTypeChange?: (type: BodyType) => void
  onBodyRawTextChange?: (text: string) => void
  onBodyParametersChange?: (params: Parameter[]) => void
  onFillBody?: () => void
  fillWithComments?: boolean
  onFillWithCommentsChange?: (value: boolean) => void
  buildBodyExample?: () => string
  /** 已定义变量映射（环境/全局/会话），用于补全与 form-data 表格变量提示 */
  varMap?: Map<string, string>
}

export function BodyPanel(props: BodyPanelProps) {
  const {
    requestBody,
    bodyRawText,
    onBodyTypeChange,
    onBodyRawTextChange,
    onBodyParametersChange,
    onFillBody,
    fillWithComments = true,
    onFillWithCommentsChange,
    buildBodyExample,
    varMap,
  } = props

  const { token } = theme.useToken()

  // 变量补全项：内置动态变量 + 已定义用户变量
  const completionItems = useMemo(() => {
    const dyn = DYNAMIC_VARIABLE_DEFS.map((d) => ({ label: d.name, detail: d.desc }))
    const users = varMap
      ? Array.from(varMap.entries())
          .filter(([k]) => !k.startsWith('$'))
          .map(([k, v]) => ({ label: k, detail: v }))
      : []

    return [...dyn, ...users]
  }, [varMap])

  const showBodyEditor = requestBody
    && (requestBody.type === BodyType.Json
      || requestBody.type === BodyType.Xml
      || requestBody.type === BodyType.Raw
      || requestBody.type === BodyType.Binary)

  // 「一键填充」按钮仅在 json/xml/raw 下显示（不含 binary），与 QuickRequestRun 对齐
  const showFillButton = requestBody
    && (requestBody.type === BodyType.Json
      || requestBody.type === BodyType.Xml
      || requestBody.type === BodyType.Raw)

  const handleFillClick = () => {
    if (!onFillBody) { return }

    if (!bodyRawText?.trim()) {
      onFillBody()

      return
    }

    Modal.confirm({
      title: '一键填充 Body？',
      content: '将覆盖当前已输入的内容，填充后不可撤销。',
      okText: '填充',
      cancelText: '取消',
      onOk: onFillBody,
    })
  }

  if (!requestBody) {
    return <Typography.Text className="px-3 pt-2" type="secondary">无 Body</Typography.Text>
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-2 pb-1.5">
      {/* Body Type 选择器 - 固定高度 */}
      <div className="shrink-0">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {bodyTypeOptions.map(({ n, t }) => {
              const hasContent = bodyTypeHasContent(requestBody, t)

              return (
                <Tag.CheckableTag
                  key={t}
                  checked={requestBody.type === t}
                  onChange={(checked) => {
                    if (checked && onBodyTypeChange) {
                      onBodyTypeChange(t)
                    }
                  }}
                >
                  {n}
                  {hasContent && <span style={{ color: token.colorSuccess, marginLeft: 1 }}>*</span>}
                </Tag.CheckableTag>
              )
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {showFillButton && onFillBody && (
              <>
                <Switch
                  checked={fillWithComments}
                  size="small"
                  onChange={onFillWithCommentsChange}
                />
                <span className="text-xs" style={{ color: token.colorTextSecondary }}>注释</span>
                <Button size="small" onClick={handleFillClick}>一键填充</Button>
              </>
            )}
            <DynamicVariablesHelp />
          </div>
        </div>
      </div>

      {/* Body 编辑器 - 填满剩余空间 */}
      <div className="min-h-0 flex-1">
        {showBodyEditor && (
          <div className="h-full rounded border-solid" style={{ borderWidth: 1, borderColor: token.colorBorderSecondary }}>
            <MonacoEditor
              completionItems={completionItems}
              deserializeOnChange={false}
              height="100%"
              language={
                requestBody.type === BodyType.Xml
                  ? 'xml'
                  : requestBody.type === BodyType.Raw
                    ? 'plaintext'
                    : 'json'
              }
              options={{
                readOnly: false,
                automaticLayout: true,
              }}
              value={bodyRawText ?? (requestBody.type === BodyType.Json ? (buildBodyExample?.() ?? '') : '')}
              onChange={(val) => {
                if (onBodyRawTextChange) {
                  onBodyRawTextChange(typeof val === 'string' ? val : '')
                }
              }}
              onMount={(editor, monaco) => {
                monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
              }}
            />
          </div>
        )}

        {(requestBody.type === BodyType.FormData || requestBody.type === BodyType.UrlEncoded) && (
          <div className="h-full overflow-auto">
            <Typography.Text className="mb-2 block text-xs" type="secondary">
              {requestBody.type === BodyType.FormData ? 'form-data' : 'x-www-form-urlencoded'} 参数
            </Typography.Text>
            <ParamsEditableTable
              showDescriptionColumn={false}
              showRequiredColumn={false}
              value={requestBody.parameters}
              varMap={varMap}
              onChange={(params) => onBodyParametersChange?.(params ?? [])}
            />
          </div>
        )}

        {requestBody.type === BodyType.None && (
          <Typography.Text className="text-xs" type="secondary">无请求体</Typography.Text>
        )}
      </div>
    </div>
  )
}
