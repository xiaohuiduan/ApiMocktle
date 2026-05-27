import { useCallback, useMemo, useState } from 'react'

import { Badge, Button, Collapse, Empty, Modal, Tabs, Tag, Typography, theme } from 'antd'
import { CheckCircleIcon, XCircleIcon, AlertTriangleIcon, InfoIcon, HelpCircleIcon } from 'lucide-react'

import { MonacoEditor } from '@/components/MonacoEditor'
import type { ScriptConsoleEntry, ScriptTestResult } from '@/types'

import { PM_TYPE_DEFS } from './pm-type-defs'

export interface ScriptEditorProps {
  value?: string
  onChange?: (value: string) => void
  consoleEntries?: ScriptConsoleEntry[]
  testResults?: ScriptTestResult[]
  running?: boolean
  language?: string
  placeholder?: string
}

const MAX_CONSOLE_ENTRIES = 500

function ConsolePanel({ entries }: { entries: ScriptConsoleEntry[] }) {
  const { token } = theme.useToken()

  if (entries.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无输出" className="py-4" />
  }

  const iconMap = {
    log: null,
    info: <InfoIcon size={12} style={{ color: token.colorInfo }} />,
    warn: <AlertTriangleIcon size={12} style={{ color: token.colorWarning }} />,
    error: <XCircleIcon size={12} style={{ color: token.colorError }} />,
  }

  const colorMap = {
    log: token.colorText,
    info: token.colorInfo,
    warn: token.colorWarning,
    error: token.colorError,
  }

  return (
    <div className="max-h-[200px] overflow-auto font-mono text-xs">
      {entries.slice(0, MAX_CONSOLE_ENTRIES).map((entry, i) => (
        <div key={i} className="flex items-start gap-1.5 px-3 py-0.5 hover:bg-black/[.03] dark:hover:bg-white/[.03]">
          {iconMap[entry.level]}
          <span className="opacity-50 shrink-0">
            {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
          </span>
          <span style={{ color: colorMap[entry.level] }} className="break-all">
            {entry.args.join(' ')}
          </span>
        </div>
      ))}
      {entries.length > MAX_CONSOLE_ENTRIES && (
        <div className="px-3 py-1 text-center opacity-50">
          ... 还有 {entries.length - MAX_CONSOLE_ENTRIES} 条日志未显示
        </div>
      )}
    </div>
  )
}

function TestResultsPanel({ results }: { results: ScriptTestResult[] }) {
  const { token } = theme.useToken()

  if (results.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无测试结果" className="py-4" />
  }

  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed

  return (
    <div className="max-h-[200px] overflow-auto text-xs">
      <div className="flex items-center gap-3 px-3 py-1.5 border-b" style={{ borderColor: token.colorBorderSecondary }}>
        <span style={{ color: token.colorSuccess }}>
          <CheckCircleIcon size={12} className="inline mr-1" />
          通过 {passed}
        </span>
        {failed > 0 && (
          <span style={{ color: token.colorError }}>
            <XCircleIcon size={12} className="inline mr-1" />
            失败 {failed}
          </span>
        )}
      </div>
      {results.map((r, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-1 border-b last:border-b-0" style={{ borderColor: token.colorBorderSecondary }}>
          {r.passed
            ? <CheckCircleIcon size={14} className="shrink-0 mt-0.5" style={{ color: token.colorSuccess }} />
            : <XCircleIcon size={14} className="shrink-0 mt-0.5" style={{ color: token.colorError }} />}
          <div>
            <div>{r.name}</div>
            {r.error && <div style={{ color: token.colorError }} className="mt-0.5">{r.error}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

const HELP_ITEMS = [
  {
    category: '环境变量',
    items: [
      { api: 'pm.env.get(key)', desc: '获取环境变量值' },
      { api: 'pm.env.set(key, value)', desc: '设置环境变量（会话级共享，可跨请求使用）' },
      { api: 'pm.env.unset(key)', desc: '删除环境变量' },
      { api: 'pm.env.has(key)', desc: '检查环境变量是否存在' },
    ],
  },
  {
    category: '全局变量',
    items: [
      { api: 'pm.globals.get(key)', desc: '获取全局变量值' },
      { api: 'pm.globals.set(key, value)', desc: '设置全局变量' },
      { api: 'pm.globals.unset(key)', desc: '删除全局变量' },
    ],
  },
  {
    category: '临时变量',
    items: [
      { api: 'pm.variables.get(key)', desc: '获取临时变量值（仅本次请求生命周期）' },
      { api: 'pm.variables.set(key, value)', desc: '设置临时变量' },
    ],
  },
  {
    category: '请求操作（前置脚本）',
    items: [
      { api: 'pm.request.url', desc: '当前请求 URL' },
      { api: 'pm.request.method', desc: '当前请求方法' },
      { api: 'pm.request.headers.upsert({ key, value })', desc: '添加或修改请求头' },
      { api: 'pm.request.headers.remove(key)', desc: '删除请求头' },
      { api: 'pm.request.headers.get(key)', desc: '获取请求头值' },
      { api: 'pm.request.body.update(newBody)', desc: '更新请求体内容' },
    ],
  },
  {
    category: '响应操作（后置脚本）',
    items: [
      { api: 'pm.response.code', desc: 'HTTP 状态码' },
      { api: 'pm.response.status', desc: '状态文本' },
      { api: 'pm.response.json()', desc: '解析响应体为 JSON 对象' },
      { api: 'pm.response.text()', desc: '获取响应体原始文本' },
      { api: 'pm.response.responseTime', desc: '响应时间（毫秒）' },
      { api: 'pm.response.headers.get(key)', desc: '获取响应头值' },
    ],
  },
  {
    category: '测试断言',
    items: [
      { api: 'pm.test(name, fn)', desc: '声明测试用例，fn 中使用 pm.expect 断言' },
      { api: 'pm.expect(value).to.equal(expected)', desc: '断言值相等' },
      { api: 'pm.expect(value).to.deep.equal(obj)', desc: '断言深度相等' },
      { api: 'pm.expect(obj).to.have.property(key)', desc: '断言对象包含属性' },
      { api: 'pm.expect(value).to.be.true', desc: '断言为 true' },
      { api: 'pm.expect(value).to.not.equal(val)', desc: '断言不相等' },
    ],
  },
  {
    category: '控制台输出',
    items: [
      { api: 'console.log(...args)', desc: '输出日志' },
      { api: 'console.warn(...args)', desc: '输出警告' },
      { api: 'console.error(...args)', desc: '输出错误' },
    ],
  },
]

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      title="脚本使用说明"
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
    >
      <div className="max-h-[60vh] overflow-auto">
        <Typography.Paragraph type="secondary" className="mb-4">
          在脚本中使用 <code>pm</code> 对象操作变量、修改请求、读取响应、运行断言。
        </Typography.Paragraph>
        {HELP_ITEMS.map((group) => (
          <div key={group.category} className="mb-4">
            <Typography.Text strong className="mb-2 block">{group.category}</Typography.Text>
            <div className="rounded border" style={{ borderColor: 'var(--ant-color-border-secondary)' }}>
              {group.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-3 py-1.5"
                  style={{ borderBottom: i < group.items.length - 1 ? '1px solid var(--ant-color-border-secondary)' : undefined }}
                >
                  <code className="shrink-0 text-xs" style={{ color: 'var(--ant-color-primary)' }}>{item.api}</code>
                  <span className="text-xs opacity-70">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function ScriptEditor(props: ScriptEditorProps) {
  const { value, onChange, consoleEntries = [], testResults = [], language = 'javascript' } = props
  const { token } = theme.useToken()
  const [helpOpen, setHelpOpen] = useState(false)

  const failedTestCount = testResults.filter(r => !r.passed).length
  const errorCount = consoleEntries.filter(e => e.level === 'error').length

  const handleEditorMount = useCallback((editor: unknown, monaco: unknown) => {
    const m = monaco as {
      languages: {
        typescript: {
          javascriptDefaults: { addExtraLib: (content: string, filePath: string) => void }
        }
      }
    }
    m.languages.typescript.javascriptDefaults.addExtraLib(PM_TYPE_DEFS, 'ts:types/pm.d.ts')
  }, [])

  const consoleTabLabel = useMemo(() => (
    <span>
      Console
      {errorCount > 0 && (
        <Badge count={errorCount} size="small" className="ml-1" />
      )}
    </span>
  ), [errorCount])

  const testTabLabel = useMemo(() => (
    <span>
      测试结果
      {failedTestCount > 0 && (
        <Badge count={failedTestCount} size="small" className="ml-1" />
      )}
    </span>
  ), [failedTestCount])

  const hasOutput = consoleEntries.length > 0 || testResults.length > 0

  return (
    <div className="flex flex-col min-h-0">
      <div className="mb-2 flex items-center justify-between">
        <div />
        <Button
          type="link"
          size="small"
          icon={<HelpCircleIcon size={14} />}
          onClick={() => setHelpOpen(true)}
        >
          使用说明
        </Button>
      </div>
      <div className="rounded border" style={{ borderColor: token.colorBorderSecondary }}>
        <MonacoEditor
          height="200px"
          language={language}
          value={value ?? ''}
          onChange={(val) => onChange?.(typeof val === 'string' ? val : '')}
          deserializeOnChange={false}
          options={{
            minimap: { enabled: false },
            tabSize: 2,
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
          onMount={handleEditorMount}
        />
      </div>

      {hasOutput && (
        <div className="mt-2 rounded border overflow-hidden" style={{ borderColor: token.colorBorderSecondary }}>
          <Tabs
            animated={false}
            size="small"
            className="script-output-tabs"
            items={[
              {
                key: 'console',
                label: consoleTabLabel,
                children: <ConsolePanel entries={consoleEntries} />,
              },
              {
                key: 'tests',
                label: testTabLabel,
                children: <TestResultsPanel results={testResults} />,
              },
            ]}
          />
        </div>
      )}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
