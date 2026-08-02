import { useCallback, useEffect, useState } from 'react'

import { Alert, Button, Form, Input, message, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { Code2Icon, CopyIcon, PlayIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { invalidateDynamicVariableDefs } from '@/utils/dynamic-variables'

interface DynamicVariableDef {
  id: string
  name: string
  type: 'static' | 'expression' | 'script'
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
  type: 'static' | 'expression' | 'script'
  value: string
  description: string
  enabled: boolean
}

interface ScriptTestResult {
  output: string
  result: string
  error?: string
}

type VarType = DynamicVariableDef['type']

const TYPE_LABELS: Record<VarType, string> = {
  static: '静态值',
  expression: '表达式',
  script: '脚本',
}

/** 类型元数据：求值原理 + 值字段说明 + 试运行默认脚本生成 */
const TYPE_META: Record<VarType, { valueLabel: string, principle: string, valueExtra: string }> = {
  static: {
    valueLabel: '模板内容',
    principle: '作为文本模板，其中 {{$xxx}} 会被递归替换成实际值（如 hello {{$timestamp}}）',
    valueExtra: '模板文本，可引用其他变量：hello {{$timestamp}}',
  },
  expression: {
    valueLabel: '函数名',
    principle: '值为函数名，使用时写成 {{$函数名(参数)}}，由引擎调用该函数求值（无参可省略括号）',
    valueExtra: '函数名，调用时拼成 函数名(参数)：{{$randomInt(1,100)}}；无参直接 {{$xxx}}',
  },
  script: {
    valueLabel: '脚本源码',
    principle: 'Rhai 脚本：求值时执行完整脚本，最后一行表达式的值作为结果；print() 输出调试信息',
    valueExtra: 'Rhai 脚本：字符串用双引号，print() 输出调试，最后一行表达式为返回值',
  },
}

/** 内置可带参变量的调用示例（seed 中仅这两个函数支持参数） */
const USAGE_EXAMPLES: Record<string, string> = {
  $randomInt: '{{$randomInt(1,100)}}',
  $randomString: '{{$randomString(16)}}',
}

function usageExample(item: DynamicVariableDef): string {
  return USAGE_EXAMPLES[item.name] ?? `{{${item.name}}}`
}

/** 试运行默认脚本：打印当前变量的求值结果 */
function defaultTestScript(type: VarType, value: string): string {
  if (type === 'expression') {
    return `print(${value || 'timestamp'}())`
  }

  if (type === 'script') { return value }

  return `print(${JSON.stringify(value)})`
}

/** AI 提示词模板：内置函数签名与语法规则，复制给 AI 生成表达式/脚本 */
function buildAiPrompt(): string {
  return [
    '你是 ApiMocktle 动态变量脚本专家。请根据我的需求，生成 {{$变量名}} 的表达式或脚本，只输出代码，不要解释。',
    '',
    '## 三种变量类型',
    '- static 静态值：值为文本模板，可引用其他变量 {{$xxx}}，求值时递归替换',
    '- expression 表达式：值为函数名，使用时写 {{$函数名(参数)}}，无参可省略括号',
    '- script 脚本：值为 Rhai 完整脚本，最后一行表达式的值作为结果；字符串必须用双引号；print() 输出调试信息',
    '',
    '## 内置函数',
    '- timestamp()：秒级时间戳',
    '- timestamp_iso()：ISO 8601 时间（UTC 毫秒 Z 格式）',
    '- guid()：UUID（带横线）',
    '- random_uuid()：UUID（无横线）',
    '- random_int(min, max)：随机整数（无参 0-1000）',
    '- random_email()：随机邮箱',
    '- random_ip()：随机 IPv4 地址',
    '- random_mobile()：11 位随机手机号',
    '- random_string(len)：随机字母串（无参 8 位）',
    '- env(key)：读取系统环境变量',
    '',
    '## 示例',
    '- {{$randomInt(1,100)}}：1-100 随机整数（expression，函数名 random_int）',
    '- 需求「生成下月 1 号的时间戳」→ expression，函数名 timestamp_iso 无法满足时用 script：let d = timestamp_iso(); d',
    '',
    '## 我的需求',
    '（在这里写你的需求，如：生成 30 天后过期的时间）',
    '',
    '请直接输出：',
    '1. 变量名（$ 开头）',
    '2. 类型（static / expression / script）',
    '3. 值（代码）',
  ].join('\n')
}

function typeTag(type: VarType) {
  const color = type === 'static' ? 'blue' : type === 'expression' ? 'purple' : 'green'

  return <Tag color={color}>{TYPE_LABELS[type]}</Tag>
}

export function DynamicVariablePanel() {
  const { sessionId } = useAuth()
  const [list, setList] = useState<DynamicVariableDef[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<DynamicVariableDef | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<SavePayload>()
  // 当前选中类型（state 同步，避开 useWatch 类型/运行时不一致的坑）
  const [watchType, setWatchType] = useState<VarType>('static')
  const typeMeta = TYPE_META[watchType]
  const [testScript, setTestScript] = useState('')
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
    form.setFieldsValue({ name: '$', type: 'static', value: '', description: '', enabled: true })
    setWatchType('static')
    setTestResult(null)
    setTestScript(defaultTestScript('static', ''))
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
    setWatchType(item.type)
    setTestResult(null)
    setTestScript(defaultTestScript(item.type, item.value))
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
      message.success(editing ? '已保存' : '已创建')
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
      message.success('已删除')
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
      setTestResult(await api<ScriptTestResult>('test_script', { script: testScript }))
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
          <Typography.Title className="!my-0" level={5}>动态变量</Typography.Title>
          <Typography.Text className="text-xs" type="secondary">
            {'{{$xxx}}'} 求值统一在 Rust 侧（Rhai 引擎）；内置变量仅可修改说明与开关，自定义变量支持三类：静态值 / 表达式 / 脚本。
          </Typography.Text>
        </div>
        <Space>
          <Button
            icon={<CopyIcon size={14} />}
            onClick={() => {
              void navigator.clipboard.writeText(buildAiPrompt()).then(() => message.success('AI 提示词已复制，粘贴给 AI 生成表达式/脚本'))
            }}
          >
            AI 提示词
          </Button>
          <Button icon={<PlusIcon size={14} />} type="primary" onClick={openCreate}>新建变量</Button>
        </Space>
      </div>

      <Table
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            width: 180,
            render: (name: string, item) => (
              <Space size={4}>
                <span className="font-mono">{name}</span>
                {item.isBuiltin && <Tag>内置</Tag>}
              </Space>
            ),
          },
          { title: '类型', dataIndex: 'type', key: 'type', width: 90, render: typeTag },
          {
            title: '调用示例',
            key: 'usage',
            ellipsis: true,
            width: 190,
            render: (_, item) => <Typography.Text code>{usageExample(item)}</Typography.Text>,
          },
          { title: '说明', dataIndex: 'description', key: 'description', ellipsis: true },
          {
            title: '启用',
            dataIndex: 'enabled',
            key: 'enabled',
            width: 70,
            render: (enabled: boolean, item) => (
              <Switch checked={enabled} size="small" onChange={(v) => { void handleToggleEnabled(item, v) }} />
            ),
          },
          {
            title: '操作',
            key: 'actions',
            width: 150,
            render: (_, item) => (
              <Space size={4}>
                <Button size="small" type="text" onClick={() => { openEdit(item) }}>编辑</Button>
                {!item.isBuiltin && (
                  <Popconfirm title="确认删除该变量？" onConfirm={() => { void handleDelete(item) }}>
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
        title={editing ? `编辑变量 ${editing.name}` : '新建变量'}
        width={640}
        onCancel={() => { setModalOpen(false) }}
        onOk={() => { void handleSave() }}
      >
        <div className="flex flex-col gap-5">
          <Form className="!mt-0" form={form} layout="vertical">
            {/* 第一行：变量名 + 类型（两列固定比例，不挤压） */}
            <div className="flex gap-3">
              <Form.Item
                className="min-w-0 flex-1"
                label="变量名"
                name="name"
                rules={[
                  { required: true, message: '请输入变量名' },
                  { pattern: /^\$[\w:.]+$/, message: '需以 $ 开头，仅含字母/数字/_/:/.' },
                ]}
              >
                <Input disabled={editing?.isBuiltin} placeholder="$myToken" />
              </Form.Item>
              <Form.Item className="w-44 shrink-0" label="类型" name="type">
                <Select
                  disabled={editing?.isBuiltin}
                  options={[
                    { value: 'static', label: '静态值' },
                    { value: 'expression', label: '表达式' },
                    { value: 'script', label: '脚本' },
                  ]}
                  onChange={(v) => { setWatchType(v as VarType) }}
                />
              </Form.Item>
            </div>
            {/* 第二行：说明（独占一行，全宽） */}
            <Form.Item label="说明" name="description">
              <Input placeholder="变量用途说明（补全弹窗展示）" />
            </Form.Item>
            <Form.Item
              className="!mb-0"
              extra={typeMeta.valueExtra}
              label={typeMeta.valueLabel}
              name="value"
              rules={[{ required: true, message: '请输入值' }]}
            >
              <Input.TextArea
                autoSize={{ minRows: 2, maxRows: 10 }}
                disabled={editing?.isBuiltin}
                placeholder={watchType === 'expression' ? 'timestamp' : watchType === 'script' ? 'let x = 1; x * 2' : 'hello {{$timestamp}}'}
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              />
            </Form.Item>
          </Form>

          <Alert
            showIcon
            className="!mb-0"
            description={(
              <span className="text-xs">
                请求发送时，Rust 引擎把 {'{{$xxx}}'} 替换为实际值。当前类型：{TYPE_LABELS[watchType]} —— {typeMeta.principle}
              </span>
            )}
            message="求值原理"
            type="info"
          />

          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--ant-color-border-secondary, #d9d9d9)' }}>
            <div className="mb-3 flex items-center justify-between">
              <Typography.Text strong className="text-sm">
                <Code2Icon className="mr-1 inline" size={14} />
                试运行（默认已填充「打印当前变量」）
              </Typography.Text>
              <Button icon={<PlayIcon size={13} />} loading={testRunning} size="small" type="primary" onClick={() => { void handleRunTest() }}>
                运行
              </Button>
            </div>
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
                  <span className="opacity-60">输出：</span>
                  {testResult.output || '（无 print 输出）'}
                </div>
                <div>
                  <span className="opacity-60">返回值：</span>
                  {testResult.result || '（无返回值）'}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
