import { useCallback, useEffect, useState } from 'react'

import { Alert, Button, Form, Input, message, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd'
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

/** AI 提示词模板：JS 语法 + 内置函数签名 + 参数用法，复制给 AI 生成脚本 */
function buildAiPrompt(): string {
  return [
    '你是 ApiMocktle 动态变量脚本专家。请根据我的需求，生成 {{$变量名}} 的 JavaScript 脚本，只输出代码，不要解释。',
    '',
    '## 脚本语法（JavaScript）',
    '- 脚本最后一条表达式的值作为变量结果；不要在脚本顶层写 return（会报语法错误）',
    '- 结果会被转成字符串（数字/布尔自动转；对象会变成 [object Object]，请返回字符串或数字）',
    '- console.log(...) / print(...) 输出调试信息（多参数自动拼接；console.log 后请用最后一条表达式作为结果）',
    '- 不要使用 async/await/Promise（无法同步返回结果）',
    '- 优先使用下方内置函数（Math.random 等 JS 原生 API 可用，但与内置函数行为不统一，不建议）',
    '- 模板参数：{{$myScript(1,100)}} 的括号参数注入为预置数组 args（args[0]、args[1]…）；无参时 args 为空数组，可用 args.length 判断',
    '- 脚本返回值中的 {{$xxx}} 不会被二次解析（保持字面）',
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
    '- {{$randomInt(1,100)}}：脚本 `args.length >= 2 ? random_int(args[0], args[1]) : random_int()`（有参用 args，无参回退默认）',
    '- 需求「生成带前缀的订单号，可传前缀，无前缀用 ORD」→ 脚本：',
    '  const tag = args.length >= 1 ? args[0] : "ORD"',
    '  console.log(`tag=${tag}`)',
    '  `${tag}-${timestamp()}-${random_string(6)}`',
    '  （{{$orderNo(ORD)}} → ORD-1750000000-AbCdEf；{{$orderNo}} → ORD-1750000000-AbCdEf）',
    '',
    '## 我的需求',
    '（在这里写你的需求，如：生成 30 天后过期的时间）',
    '',
    '请直接输出脚本代码（可直接填入变量值），不要输出变量名、不要任何解释或代码块标记。',
  ].join('\n')
}

export function DynamicVariablePanel() {
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
          <Typography.Title className="!my-0" level={5}>动态变量</Typography.Title>
          <Typography.Text className="text-xs" type="secondary">
            {'{{$xxx}}'} 求值统一在 Rust 侧（QuickJS 引擎）；内置变量仅可修改说明与开关，自定义变量为 JavaScript 脚本——支持模板参数（
            {'{{$myScript(1,2)}}'}
            → 脚本内 args 数组），试运行可调试输出。
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
            <Form.Item
              label="变量名"
              name="name"
              rules={[
                { required: true, message: '请输入变量名' },
                { pattern: /^\$[\w:.]+$/, message: '需以 $ 开头，仅含字母/数字/_/:/.' },
              ]}
            >
              <Input disabled={editing?.isBuiltin} placeholder="$myToken" />
            </Form.Item>
            <Form.Item label="说明" name="description">
              <Input placeholder="变量用途说明（补全弹窗展示）" />
            </Form.Item>
            <Form.Item
              className="!mb-0"
              label={(
                <span className="inline-flex items-center gap-1">
                  脚本源码
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
              rules={[{ required: true, message: '请输入脚本' }]}
            >
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 12 }}
                disabled={editing?.isBuiltin}
                placeholder={'args.length >= 1 ? args[0] : "默认值"'}
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              />
            </Form.Item>
          </Form>

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
            <Input
              allowClear
              className="!mb-2"
              placeholder="可选参数，逗号分隔（如 ORD,123 → 脚本内 args[0]=ORD, args[1]=123）；留空 = 无参"
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

      <Modal
        footer={null}
        open={helpOpen}
        styles={{
          header: { padding: '16px 24px', marginBottom: 0 },
          body: { padding: '16px 24px' },
        }}
        title="脚本语法说明"
        width={560}
        onCancel={() => { setHelpOpen(false) }}
      >
        <div className="flex flex-col gap-3 text-sm">
          <div>
            脚本为 JavaScript（QuickJS 引擎）：console.log() / print() 输出调试，脚本最后一条表达式的值作为变量结果。
          </div>
          <div>
            模板参数写法
            {'{{$myScript(1,100)}}'}
            → 括号内参数注入为预置数组 args（脚本内用 args[0] / args[1]；无参时 args 为空数组，可用 args.length 判断是否有参数）
          </div>
          <div className="mb-1 opacity-70">示例（调用 {'{{$orderNo(ORD)}}'}，无参调用 {'{{$orderNo}}'} 回退默认前缀）：</div>
          <pre
            className="m-0 overflow-auto rounded p-3 text-xs leading-relaxed"
            style={{ backgroundColor: 'var(--ant-color-fill-tertiary, #f5f5f5)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {`const tag = args.length >= 1 ? args[0] : "ORD"
console.log(\`tag=\${tag}\`)
\`\${tag}-\${timestamp()}-\${random_string(6)}\``}
          </pre>
          <div className="opacity-70">
            输出：console.log 显示 tag=ORD，变量值形如
            ORD-1750000000-AbCdEf
            ——示例同时覆盖 args 条件消费、内置函数组合与调试输出
          </div>
        </div>
      </Modal>
    </div>
  )
}
