import { useMemo } from 'react'

import { Button, Modal, Switch, theme, Typography } from 'antd'

import { MonacoEditor } from '@/components/MonacoEditor'
import { BodyType } from '@/enums'
import { useDynamicVariableDefs } from '@/hooks/useDynamicVariableDefs'
import type { ApiRequestBody, Parameter } from '@/types'

import { type BodySlot, BodyTypeSelect } from '../components/BodyTypeSelect'
import { DynamicVariablesHelp } from '../components/DynamicVariablesHelp'
import { ParamsEditableTable } from '../components/ParamsEditableTable'

/**
 * 计算哪些内容槽位有「将被发送」的内容。
 *
 * 运行态只认真正会被 `buildRequest` 读取的载体：`parameters` 表格与 `rawText` 正文。
 * 刻意不计入 `jsonSchema`——json 发送时只读 `rawText`，文档里的 schema 不参与发送，
 * 把它算作「有内容」会造成「编辑器空白却标着有内容」。
 */
function getFilledSlots(requestBody: ApiRequestBody | undefined): BodySlot[] {
  if (!requestBody) { return [] }

  const slots: BodySlot[] = []

  if ((requestBody.parameters ?? []).some((p) => p.name && p.enable !== false)) {
    slots.push('parameters')
  }

  if (requestBody.rawText?.trim()) {
    slots.push('raw')
  }

  return slots
}

interface BodyPanelProps {
  requestBody?: ApiRequestBody
  bodyRawText?: string
  onBodyTypeChange?: (type: BodyType) => void
  onBodyRawTextChange?: (text: string) => void
  onBodyParametersChange?: (params: Parameter[]) => void
  onFillBody?: () => void
  fillWithComments?: boolean
  onFillWithCommentsChange?: (value: boolean) => void
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
    varMap,
  } = props

  const { token } = theme.useToken()

  // 快捷请求的数据可能没有 requestBody 字段（cURL 导入无请求体、历史数据、示例数据），
  // 此时仍要渲染类型选择器，否则用户永远无法切到 json / form-data。
  const body: ApiRequestBody = requestBody ?? { type: BodyType.None }

  const filledSlots = useMemo(() => getFilledSlots(requestBody), [requestBody])

  // 变量补全项：内置动态变量 + 已定义用户变量
  const dynamicDefs = useDynamicVariableDefs()
  const completionItems = useMemo(() => {
    const dyn = dynamicDefs.map((d) => ({ label: d.name, detail: d.desc }))
    const users = varMap
      ? Array.from(varMap.entries())
          .filter(([k]) => !k.startsWith('$'))
          .map(([k, v]) => ({ label: k, detail: v }))
      : []

    return [...dyn, ...users]
  }, [dynamicDefs, varMap])

  const showBodyEditor = body.type === BodyType.Json
    || body.type === BodyType.Xml
    || body.type === BodyType.Raw
    || body.type === BodyType.Binary

  // 「一键填充」按钮仅在 json/xml/raw 下显示（不含 binary），与 QuickRequestRun 对齐
  const showFillButton = body.type === BodyType.Json
    || body.type === BodyType.Xml
    || body.type === BodyType.Raw

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

  if (!requestBody && !onBodyTypeChange) {
    return <Typography.Text className="px-3 pt-2" type="secondary">无 Body</Typography.Text>
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-2 pb-1.5">
      {/* Body Type 选择器 - 固定高度 */}
      <div className="shrink-0">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: token.colorTextSecondary }}>Body 类型</span>
            <BodyTypeSelect
              filledSlots={filledSlots}
              value={body.type}
              onChange={(type) => { onBodyTypeChange?.(type) }}
            />
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
                body.type === BodyType.Xml
                  ? 'xml'
                  : body.type === BodyType.Raw
                    ? 'plaintext'
                    : 'json'
              }
              options={{
                readOnly: false,
                automaticLayout: true,
              }}
              value={bodyRawText ?? ''}
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

        {(body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) && (
          <div className="h-full overflow-auto">
            <Typography.Text className="mb-2 block text-xs" type="secondary">
              {body.type === BodyType.FormData ? 'form-data' : 'x-www-form-urlencoded'} 参数
            </Typography.Text>
            <ParamsEditableTable
              showDescriptionColumn={false}
              showRequiredColumn={false}
              value={body.parameters}
              varMap={varMap}
              onChange={(params) => onBodyParametersChange?.(params ?? [])}
            />
          </div>
        )}

        {body.type === BodyType.None && (
          <Typography.Text className="text-xs" type="secondary">无请求体</Typography.Text>
        )}
      </div>
    </div>
  )
}
