import { useState } from 'react'

import { Modal, Space, Tabs, theme } from 'antd'
import { CopyIcon, EyeIcon, SparklesIcon } from 'lucide-react'

import {
  type JsonSchema,
  JsonSchemaEditor,
  type JsonSchemaEditorProps,
} from '@/components/JsonSchema'
import {
  buildSchemaExample,
  denormalizeJsonSchema,
  inferSchemaFromExample,
  normalizeJsonSchema,
} from '@/components/JsonSchema/schema-normalizer'
import { MonacoEditor } from '@/components/MonacoEditor'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'

import { UIButton } from './UIBtn'

interface JsonSchemaCardProps
  extends Pick<JsonSchemaEditorProps, 'value' | 'onChange' | 'defaultValue'> {
  editorProps?: JsonSchemaEditorProps
}

export function JsonSchemaCard(props: JsonSchemaCardProps) {
  const { token } = theme.useToken()

  const { defaultValue, value = defaultValue, onChange, editorProps } = props

  const { messageApi } = useGlobalContext()
  const { menuRawList } = useMenuHelpersContext()

  // ── 生成模态框 ──────────────────────────────────────────────────────────────

  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [genTab, setGenTab] = useState<'json-to-schema' | 'schema-to-json'>('json-to-schema')
  const [genKey, setGenKey] = useState(0)

  // Tab: JSON → Schema
  const [genJsonInput, setGenJsonInput] = useState('')
  const [genSchemaPreview, setGenSchemaPreview] = useState<JsonSchema | null>(null)

  // Tab: Schema → JSON
  const [genSchemaInput, setGenSchemaInput] = useState('')
  const [genExamplePreview, setGenExamplePreview] = useState('')

  // ── 查看模态框 ──────────────────────────────────────────────────────────────

  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [viewSchemaStr, setViewSchemaStr] = useState('')
  const [viewExampleStr, setViewExampleStr] = useState('')

  return (
    <>
      <div
        style={{
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadius,
          marginBottom: token.marginSM,
        }}
      >
        <div
          className="flex gap-2"
          style={{
            padding: token.paddingSM,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <UIButton
            primary
            className="inline-flex items-center"
            onClick={() => {
              setGenSchemaInput(JSON.stringify(denormalizeJsonSchema(value), null, 2))
              setGenJsonInput('')
              setGenSchemaPreview(null)
              setGenExamplePreview('')
              setGenTab('json-to-schema')
              setGenKey(k => k + 1)
              setGenerateModalOpen(true)
            }}
          >
            <SparklesIcon size={14} />
            <span className="ml-1">生成</span>
          </UIButton>

          <div className="ml-auto">
            <Space>
              <UIButton
                className="inline-flex items-center"
                onClick={() => {
                  setViewModalOpen(true)
                }}
              >
                <EyeIcon size={14} />
                <span className="ml-1">查看</span>
              </UIButton>
            </Space>
          </div>
        </div>

        <div style={{ padding: token.paddingSM }}>
          <JsonSchemaEditor value={value} onChange={onChange} {...editorProps} />
        </div>
      </div>

      {/* ── 生成模态框 ──────────────────────────────────────────────────────── */}
      <Modal
        destroyOnClose
        footer={null}
        maskClosable={false}
        open={generateModalOpen}
        title="生成"
        width={800}
        onCancel={() => {
          setGenerateModalOpen(false)
        }}
      >
        <Tabs
          activeKey={genTab}
          onChange={(key) => {
            setGenTab(key as 'json-to-schema' | 'schema-to-json')
          }}
          items={[
            {
              key: 'json-to-schema',
              label: 'JSON → Schema',
              children: (
                <>
                  <div
                    style={{
                      borderRadius: token.borderRadius,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <div
                      style={{
                        padding: `${token.paddingXS}px ${token.paddingSM}px`,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      输入 JSON
                    </div>

                    <MonacoEditor
                      key={`json-input-${genKey}`}
                      className="h-[250px]"
                      deserializeOnChange={false}
                      language="json"
                      options={{ readOnly: false }}
                      path="gen-json-input"
                      value={genJsonInput}
                      onChange={(val) => {
                        if (typeof val === 'string') {
                          setGenJsonInput(val)
                        }
                        else {
                          setGenJsonInput(JSON.stringify(val, null, 2))
                        }
                      }}
                    />
                  </div>

                  <div className="mt-2 flex justify-end">
                    <UIButton
                      primary
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(genJsonInput || '{}')
                          const schema = inferSchemaFromExample(parsed)
                          setGenSchemaPreview(schema)
                        }
                        catch {
                          messageApi.error('JSON 格式不正确，请检查！')
                        }
                      }}
                    >
                      生成 Schema
                    </UIButton>
                  </div>

                  {genSchemaPreview && (
                    <div
                      className="mt-2"
                      style={{
                        borderRadius: token.borderRadius,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <div
                        style={{
                          padding: `${token.paddingXS}px ${token.paddingSM}px`,
                          borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        }}
                      >
                        生成的 Schema 预览
                      </div>

                      <MonacoEditor
                        className="h-[250px]"
                        language="json"
                        options={{ readOnly: true }}
                        path="gen-schema-preview"
                        value={JSON.stringify(denormalizeJsonSchema(genSchemaPreview), null, 2)}
                      />

                      <div
                        className="flex justify-end"
                        style={{
                          padding: token.paddingXS,
                          borderTop: `1px solid ${token.colorBorderSecondary}`,
                        }}
                      >
                        <UIButton
                          primary
                          onClick={() => {
                            onChange?.(genSchemaPreview)
                            messageApi.success('Schema 已应用')
                            setGenerateModalOpen(false)
                          }}
                        >
                          应用
                        </UIButton>
                      </div>
                    </div>
                  )}
                </>
              ),
            },
            {
              key: 'schema-to-json',
              label: 'Schema → JSON',
              children: (
                <>
                  <div
                    style={{
                      borderRadius: token.borderRadius,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <div
                      style={{
                        padding: `${token.paddingXS}px ${token.paddingSM}px`,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      输入 JSON Schema
                    </div>

                    <MonacoEditor
                      key={`schema-input-${genKey}`}
                      className="h-[250px]"
                      deserializeOnChange={false}
                      language="json"
                      options={{ readOnly: false }}
                      path="gen-schema-input"
                      value={genSchemaInput}
                      onChange={(val) => {
                        if (typeof val === 'string') {
                          setGenSchemaInput(val)
                        }
                        else {
                          setGenSchemaInput(JSON.stringify(val, null, 2))
                        }
                      }}
                    />
                  </div>

                  <div className="mt-2 flex justify-end">
                    <UIButton
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(genSchemaInput || '{}')
                          const normalized = normalizeJsonSchema(parsed)
                          const example = buildSchemaExample(normalized as JsonSchema, menuRawList)
                          setGenExamplePreview(JSON.stringify(example, null, 2))
                        }
                        catch {
                          messageApi.error('JSON Schema 格式不正确，请检查！')
                        }
                      }}
                    >
                      生成示例
                    </UIButton>
                  </div>

                  {genExamplePreview && (
                    <div
                      className="mt-2"
                      style={{
                        borderRadius: token.borderRadius,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <div
                        style={{
                          padding: `${token.paddingXS}px ${token.paddingSM}px`,
                          borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        }}
                      >
                        生成的 JSON 示例
                      </div>

                      <MonacoEditor
                        className="h-[250px]"
                        language="json"
                        options={{ readOnly: true }}
                        path="gen-example-preview"
                        value={genExamplePreview}
                      />

                      <div
                        className="flex justify-end gap-2"
                        style={{
                          padding: token.paddingXS,
                          borderTop: `1px solid ${token.colorBorderSecondary}`,
                        }}
                      >
                        <UIButton
                          onClick={() => {
                            void navigator.clipboard.writeText(genExamplePreview).then(() => {
                              messageApi.success('已复制')
                            })
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            <CopyIcon size={12} />
                            复制
                          </span>
                        </UIButton>

                        <UIButton
                          primary
                          onClick={() => {
                            try {
                              const parsed = JSON.parse(genSchemaInput || '{}')
                              const normalized = normalizeJsonSchema(parsed)
                              onChange?.(normalized as JsonSchema)
                              messageApi.success('Schema 已应用')
                              setGenerateModalOpen(false)
                            }
                            catch {
                              messageApi.error('JSON Schema 格式不正确，请检查！')
                            }
                          }}
                        >
                          应用
                        </UIButton>
                      </div>
                    </div>
                  )}
                </>
              ),
            },
          ]}
        />
      </Modal>

      {/* ── 查看模态框 ──────────────────────────────────────────────────────── */}
      <Modal
        destroyOnClose
        afterOpenChange={(opened) => {
          if (opened) {
            const denormalized = denormalizeJsonSchema(value)
            setViewSchemaStr(JSON.stringify(denormalized, null, 2))

            const example = buildSchemaExample(value, menuRawList)
            setViewExampleStr(JSON.stringify(example, null, 2))
          }
          else {
            setViewSchemaStr('')
            setViewExampleStr('')
          }
        }}
        footer={null}
        maskClosable={false}
        open={viewModalOpen}
        title="查看"
        width={800}
        onCancel={() => {
          setViewModalOpen(false)
        }}
      >
        <Tabs
          items={[
            {
              key: 'view-schema',
              label: 'JSON Schema',
              children: (
                <>
                  <div
                    className="flex justify-end"
                    style={{
                      padding: `${token.paddingXS}px ${token.paddingSM}px`,
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <UIButton
                      onClick={() => {
                        void navigator.clipboard.writeText(viewSchemaStr).then(() => {
                          messageApi.success('已复制')
                        })
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <CopyIcon size={12} />
                        复制代码
                      </span>
                    </UIButton>
                  </div>

                  <MonacoEditor
                    className="h-[400px]"
                    language="json"
                    options={{ readOnly: true }}
                    path="view-schema"
                    value={viewSchemaStr}
                  />
                </>
              ),
            },
            {
              key: 'view-example',
              label: 'JSON 示例',
              children: (
                <>
                  <div
                    className="flex justify-end"
                    style={{
                      padding: `${token.paddingXS}px ${token.paddingSM}px`,
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <UIButton
                      onClick={() => {
                        void navigator.clipboard.writeText(viewExampleStr).then(() => {
                          messageApi.success('已复制')
                        })
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <CopyIcon size={12} />
                        复制代码
                      </span>
                    </UIButton>
                  </div>

                  <MonacoEditor
                    className="h-[400px]"
                    language="json"
                    options={{ readOnly: true }}
                    path="view-example"
                    value={viewExampleStr}
                  />
                </>
              ),
            },
          ]}
        />
      </Modal>
    </>
  )
}
