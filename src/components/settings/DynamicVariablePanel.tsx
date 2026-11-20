import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, Button, Form, Input, message, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd'
import type { TFunction } from 'i18next'
import { Code2Icon, CopyIcon, HelpCircleIcon, PlayIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { invalidateDynamicVariableDefs } from '@/utils/dynamic-variables'

interface DynamicVariableDef {
  id: string
  name: string
  /** 仅 script（单类型）；保留字段与后端兼容 */
  type: 'script'
  value: string
  description: string
  isBuiltin: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface SavePayload {
  id?: string
  name: string
  type: 'script'
  value: string
  description: string
  enabled: boolean
}

interface ScriptTestResult {
  output: string
  result: string
  error?: string
}

/** 内置可带参变量的调用示例（seed 中仅这两个函数支持参数） */
const USAGE_EXAMPLES: Record<string, string> = {
  $randomInt: '{{$randomInt(1,100)}}',
  $randomString: '{{$randomString(16)}}',
}

function usageExample(item: DynamicVariableDef): string {
  return USAGE_EXAMPLES[item.name] ?? `{{${item.name}}}`
}

/** 试运行默认脚本：编辑 = 脚本原文；新建 = 打印示例 */
function defaultTestScript(value: string): string {
  return value || 'print(timestamp())'
}

/**
 * AI 提示词模板：JS 语法 + 内置函数签名 + 参数用法，复制给 AI 生成脚本。
 *
 * 模板里的 `{{$xxx}}` 这类字面量通过插值参数注入，避免被 i18next 当作占位符解析；
 * 文案本身放在 `settings.dynamicVar.aiPromptTemplate`。
 */
function buildAiPrompt(t: TFunction): string {
  return t('settings.dynamicVar.aiPromptTemplate', {
    varName: t('settings.dynamicVar.aiPromptVarName'),
    myScriptSample: '{{$myScript(1,100)}}',
    xxxSample: '{{$xxx}}',
    randomIntSample: '{{$randomInt(1,100)}}',
    orderNoSample: '{{$orderNo(ORD)}}',
    orderNoBare: '{{$orderNo}}',
  })
}

export function DynamicVariablePanel() {
  const { t: translate } = useTranslation()
  const { sessionId } = useAuth()
  const [list, setList] = useState<DynamicVariableDef[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<DynamicVariableDef | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<SavePayload>()
  const [testScript, setTestScript] = useState('')
  const [testArgs, setTestArgs] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<ScriptTestResult | null>(null)

  const load = useCallback(async () => {
    if (!sessionId) { return }

    setLoading(true)

    try {
      setList(await api<DynamicVariableDef[]>('list_dynamic_variables', { sessionId }))
    }
    catch (err) {
      message.error((err as Error).message)
    }
    finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ name: '$', type: 'script', value: '', description: '', enabled: true })
    setTestResult(null)
    setTestScript(defaultTestScript(''))
    setModalOpen(true)
  }

  const openEdit = (item: DynamicVariableDef) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      type: item.type,
      value: item.value,
      description: item.description,
      enabled: item.enabled,
    })
    setTestResult(null)
    setTestScript(defaultTestScript(item.value))
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!sessionId) { return }

    const values = await form.validateFields()

    setSaving(true)

    try {
      await api('save_dynamic_variable', {
        sessionId,
        payload: { id: editing?.id ?? '', ...values },
      })
      message.success(editing ? translate('settings.action.saved') : translate('settings.action.created'))
      invalidateDynamicVariableDefs()
      setModalOpen(false)
      await load()
    }
    catch (err) {
      message.error((err as Error).message)
    }
    finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: DynamicVariableDef) => {
    if (!sessionId) { return }

    try {
      await api('delete_dynamic_variable', { sessionId, id: item.id })
      message.success(translate('settings.action.deleted'))
      invalidateDynamicVariableDefs()
      await load()
    }
    catch (err) {
      message.error((err as Error).message)
    }
  }

  const handleToggleEnabled = async (item: DynamicVariableDef, enabled: boolean) => {
    if (!sessionId) { return }

    try {
      await api('save_dynamic_variable', {
        sessionId,
        payload: {
          id: item.id,
          name: item.name,
          type: item.type,
          value: item.value,
          description: item.description,
          enabled,
        },
      })
      await load()
    }
    catch (err) {
      message.error((err as Error).message)
    }
  }

  const handleRunTest = async () => {
    setTestRunning(true)
    setTestResult(null)

    try {
      // args 传逗号分隔串；留空/空串 → Rust 注入空数组（args.length = 0）
      setTestResult(await api<ScriptTestResult>('test_script', { script: testScript, args: testArgs.trim() || null }))
    }
    catch (err) {
      message.error((err as Error).message)
    }
    finally {
      setTestRunning(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="flex items-center justify-between">
        <div>
          <Typography.Title className="!my-0" level={5}>{translate('settings.dynamicVar.title')}</Typography.Title>
          <Typography.Text className="text-xs" type="secondary">
            {translate('settings.dynamicVar.description', {
              autoVar: '{{$xxx}}',
              withArgsVar: '{{$myScript(1,2)}}',
            })}
          </Typography.Text>
        </div>
        <Space>
          <Button
            icon={<CopyIcon size={14} />}
            onClick={() => {
              void navigator.clipboard.writeText(buildAiPrompt(translate)).then(() => message.success(translate('settings.dynamicVar.aiPromptCopied')))
            }}
          >
            {translate('settings.dynamicVar.aiPrompt')}
          </Button>
          <Button icon={<PlusIcon size={14} />} type="primary" onClick={openCreate}>{translate('settings.dynamicVar.create')}</Button>
        </Space>
      </div>

      <Table
        columns={[
          {
            title: translate('common.name'),
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            width: 180,
            render: (name: string, item) => (
              <Space size={4}>
                <span className="font-mono">{name}</span>
                {item.isBuiltin && <Tag>{translate('settings.dynamicVar.builtin')}</Tag>}
              </Space>
            ),
          },
          {
            title: translate('settings.dynamicVar.usage'),
            key: 'usage',
            ellipsis: true,
            width: 190,
            render: (_, item) => <Typography.Text code>{usageExample(item)}</Typography.Text>,
          },
          { title: translate('common.description'), dataIndex: 'description', key: 'description', ellipsis: true },
          {
            title: translate('settings.valueTable.enable'),
            dataIndex: 'enabled',
            key: 'enabled',
            width: 70,
            render: (enabled: boolean, item) => (
              <Switch checked={enabled} size="small" onChange={(v) => { void handleToggleEnabled(item, v) }} />
            ),
          },
          {
            title: translate('common.action'),
            key: 'actions',
            width: 150,
            render: (_, item) => (
              <Space size={4}>
                <Button size="small" type="text" onClick={() => { openEdit(item) }}>{translate('common.edit')}</Button>
                {!item.isBuiltin && (
                  <Popconfirm title={translate('settings.dynamicVar.confirmDelete')} onConfirm={() => { void handleDelete(item) }}>
                    <Button danger icon={<TrashIcon size={13} />} size="small" type="text" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
        dataSource={list}
        loading={loading}
        pagination={false}
        rowKey="id"
        size="small"
      />

      <Modal
        destroyOnClose
        confirmLoading={saving}
        open={modalOpen}
        styles={{
          // 显式内边距：不受主题/密度算法影响，标题/内容/按钮与弹窗边缘留白
          header: { padding: '16px 24px', marginBottom: 0 },
          body: { padding: '16px 24px' },
          footer: { padding: '12px 24px', marginTop: 0 },
        }}
        title={editing ? translate('settings.dynamicVar.editTitle', { name: editing.name }) : translate('settings.dynamicVar.create')}
        width={640}
        onCancel={() => { setModalOpen(false) }}
        onOk={() => { void handleSave() }}
      >
        <div className="flex flex-col gap-5">
          <Form className="!mt-0" form={form} layout="vertical">
            <Form.Item
              label={translate('settings.dynamicVar.nameLabel')}
              name="name"
              rules={[
                { required: true, message: translate('settings.dynamicVar.nameRequired') },
                { pattern: /^\$[\w:.]+$/, message: translate('settings.dynamicVar.namePattern') },
              ]}
            >
              <Input disabled={editing?.isBuiltin} placeholder="$myToken" />
            </Form.Item>
            <Form.Item label={translate('common.description')} name="description">
              <Input placeholder={translate('settings.dynamicVar.descriptionPlaceholder')} />
            </Form.Item>
            <Form.Item
              className="!mb-0"
              label={(
                <span className="inline-flex items-center gap-1">
                  {translate('settings.dynamicVar.scriptSource')}
                  <HelpCircleIcon
                    className="cursor-pointer opacity-50 transition-opacity hover:opacity-100"
                    size={14}
                    onClick={(e) => {
                      e.stopPropagation()
                      setHelpOpen(true)
                    }}
                  />
                </span>
              )}
              name="value"
              rules={[{ required: true, message: translate('settings.dynamicVar.scriptRequired') }]}
            >
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 12 }}
                disabled={editing?.isBuiltin}
                placeholder={translate('settings.dynamicVar.scriptPlaceholder')}
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              />
            </Form.Item>
          </Form>

          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--ant-color-border-secondary, #d9d9d9)' }}>
            <div className="mb-3 flex items-center justify-between">
              <Typography.Text strong className="text-sm">
                <Code2Icon className="mr-1 inline" size={14} />
                {translate('settings.dynamicVar.testTitle')}
              </Typography.Text>
              <Button icon={<PlayIcon size={13} />} loading={testRunning} size="small" type="primary" onClick={() => { void handleRunTest() }}>
                {translate('settings.dynamicVar.run')}
              </Button>
            </div>
            <Input
              allowClear
              className="!mb-2"
              placeholder={translate('settings.dynamicVar.testArgsPlaceholder')}
              size="small"
              value={testArgs}
              onChange={(e) => { setTestArgs(e.target.value) }}
            />
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 6 }}
              className="!mb-3"
              placeholder="print(timestamp())"
              style={{ fontFamily: 'var(--font-mono, monospace)' }}
              value={testScript}
              onChange={(e) => { setTestScript(e.target.value) }}
            />
            {testResult?.error && (
              <Alert showIcon message={testResult.error} type="error" />
            )}
            {testResult && !testResult.error && (
              <div className="mt-2 flex flex-col gap-1 text-xs" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                <div>
                  <span className="opacity-60">{translate('settings.dynamicVar.outputLabel')}</span>
                  {testResult.output || translate('settings.dynamicVar.noOutput')}
                </div>
                <div>
                  <span className="opacity-60">{translate('settings.dynamicVar.resultLabel')}</span>
                  {testResult.result || translate('settings.dynamicVar.noResult')}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        footer={null}
        open={helpOpen}
        styles={{
          header: { padding: '16px 24px', marginBottom: 0 },
          body: { padding: '16px 24px' },
        }}
        title={translate('settings.dynamicVar.helpTitle')}
        width={560}
        onCancel={() => { setHelpOpen(false) }}
      >
        <div className="flex flex-col gap-3 text-sm">
          <div>
            {translate('settings.dynamicVar.helpIntro')}
          </div>
          <div>
            {translate('settings.dynamicVar.helpTemplate', { myScriptSample: '{{$myScript(1,100)}}' })}
          </div>
          <div className="mb-1 opacity-70">
            {translate('settings.dynamicVar.helpExample', {
              orderNoSample: '{{$orderNo(ORD)}}',
              orderNoBare: '{{$orderNo}}',
            })}
          </div>
          <pre
            className="m-0 overflow-auto rounded p-3 text-xs leading-relaxed"
            style={{ backgroundColor: 'var(--ant-color-fill-tertiary, #f5f5f5)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {`const tag = args.length >= 1 ? args[0] : "ORD"
console.log(\`tag=\${tag}\`)
\`\${tag}-\${timestamp()}-\${random_string(6)}\``}
          </pre>
          <div className="opacity-70">
            {translate('settings.dynamicVar.helpOutput')}
          </div>
        </div>
      </Modal>
    </div>
  )
}
