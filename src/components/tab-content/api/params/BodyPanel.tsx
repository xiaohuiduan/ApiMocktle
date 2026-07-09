import { Button, Tag, Typography, theme } from 'antd'
import { MonacoEditor } from '@/components/MonacoEditor'
import { ParamsEditableTable } from '../components/ParamsEditableTable'
import { BodyType } from '@/enums'
import type { ApiRequestBody, ApiEnvironmentValue } from '@/types'

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
  onBodyParametersChange?: (params: ApiEnvironmentValue[]) => void
  onFillBody?: () => void
  buildBodyExample?: () => string
}

export function BodyPanel(props: BodyPanelProps) {
  const {
    requestBody,
    bodyRawText,
    onBodyTypeChange,
    onBodyRawTextChange,
    onBodyParametersChange,
    onFillBody,
    buildBodyExample,
  } = props

  const { token } = theme.useToken()

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

  if (!requestBody) {
    return <Typography.Text type="secondary" className="px-3 pt-2">无 Body</Typography.Text>
  }

  return (
    <div className="flex flex-col h-full min-h-0 px-2 pb-1.5">
      {/* Body Type 选择器 - 固定高度 */}
      <div className="flex-shrink-0">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {bodyTypeOptions.map(({ n, t }) => {
            const hasContent = requestBody
              ? t === BodyType.FormData || t === BodyType.UrlEncoded
                ? (requestBody.parameters ?? []).some(p => p.name && p.enable !== false)
                : t === BodyType.Json || t === BodyType.Xml
                  ? !!((requestBody.jsonSchema as { properties?: unknown[] })?.properties?.length)
                  : t === BodyType.Raw || t === BodyType.Binary
                    ? !!(requestBody.rawText?.trim())
                    : false
              : false

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
          {showFillButton && onFillBody && (
            <Button size="small" className="shrink-0" onClick={onFillBody}>一键填充</Button>
          )}
        </div>
      </div>

      {/* Body 编辑器 - 填满剩余空间 */}
      <div className="flex-1 min-h-0">
        {showBodyEditor && (
          <div className="rounded border-solid h-full" style={{ borderWidth: 1, borderColor: token.colorBorderSecondary }}>
            <MonacoEditor
              height="100%"
              language={
                requestBody.type === BodyType.Xml ? 'xml'
                  : requestBody.type === BodyType.Raw ? 'plaintext'
                  : 'json'
              }
              deserializeOnChange={false}
              value={bodyRawText !== undefined ? bodyRawText : (buildBodyExample?.() ?? '')}
              onChange={(val) => {
                if (onBodyRawTextChange) {
                  onBodyRawTextChange(typeof val === 'string' ? val : '')
                }
              }}
              options={{
                readOnly: false,
                automaticLayout: true,
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
            <Typography.Text type="secondary" className="mb-2 block text-xs">
              {requestBody.type === BodyType.FormData ? 'form-data' : 'x-www-form-urlencoded'} 参数
            </Typography.Text>
            <ParamsEditableTable
              value={requestBody.parameters}
              onChange={onBodyParametersChange}
            />
          </div>
        )}

        {requestBody.type === BodyType.None && (
          <Typography.Text type="secondary" className="text-xs">无请求体</Typography.Text>
        )}
      </div>
    </div>
  )
}
