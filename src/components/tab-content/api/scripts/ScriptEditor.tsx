import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Empty, message, Modal, Tabs, theme, Typography } from 'antd'
import { AlertTriangleIcon, CheckCircleIcon, CopyIcon, HelpCircleIcon, InfoIcon, XCircleIcon } from 'lucide-react'

import { translateKey } from '@/i18n/translate'
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
  const { t } = useTranslation()

  if (entries.length === 0) {
    return <Empty className="py-4" description={t('api.script.noOutput')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
          <span className="shrink-0 opacity-50">
            {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
          </span>
          <span className="break-all" style={{ color: colorMap[entry.level] }}>
            {entry.args.join(' ')}
          </span>
        </div>
      ))}
      {entries.length > MAX_CONSOLE_ENTRIES && (
        <div className="px-3 py-1 text-center opacity-50">
          {t('api.script.consoleTruncated', { count: entries.length - MAX_CONSOLE_ENTRIES })}
        </div>
      )}
    </div>
  )
}

function TestResultsPanel({ results }: { results: ScriptTestResult[] }) {
  const { token } = theme.useToken()
  const { t } = useTranslation()

  if (results.length === 0) {
    return <Empty className="py-4" description={t('api.script.noTestResults')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed

  return (
    <div className="max-h-[200px] overflow-auto text-xs">
      <div className="flex items-center gap-3 border-b px-3 py-1.5" style={{ borderColor: token.colorBorderSecondary }}>
        <span style={{ color: token.colorSuccess }}>
          <CheckCircleIcon className="mr-1 inline" size={12} />
          {t('api.script.passed')}
          {' '}
          {passed}
        </span>
        {failed > 0 && (
          <span style={{ color: token.colorError }}>
            <XCircleIcon className="mr-1 inline" size={12} />
            {t('api.script.failed')}
            {' '}
            {failed}
          </span>
        )}
      </div>
      {results.map((r, i) => (
        <div key={i} className="flex items-start gap-2 border-b px-3 py-1 last:border-b-0" style={{ borderColor: token.colorBorderSecondary }}>
          {r.passed
            ? <CheckCircleIcon className="mt-0.5 shrink-0" size={14} style={{ color: token.colorSuccess }} />
            : <XCircleIcon className="mt-0.5 shrink-0" size={14} style={{ color: token.colorError }} />}
          <div>
            <div>{r.name}</div>
            {r.error && <div className="mt-0.5" style={{ color: token.colorError }}>{r.error}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** API 帮助表的分组定义；`category` / `desc` 是 i18n key，渲染期翻译。 */
interface HelpItem {
  api: string
  descKey: string
}

interface HelpGroup {
  categoryKey: string
  items: HelpItem[]
}

const HELP_GROUPS: HelpGroup[] = [
  {
    categoryKey: 'api.script.help.envVariables',
    items: [
      { api: 'pm.env.get(key)', descKey: 'api.script.help.envGet' },
      { api: 'pm.env.set(key, value)', descKey: 'api.script.help.envSet' },
      { api: 'pm.env.unset(key)', descKey: 'api.script.help.envUnset' },
      { api: 'pm.env.has(key)', descKey: 'api.script.help.envHas' },
    ],
  },
  {
    categoryKey: 'api.script.help.globals',
    items: [
      { api: 'pm.globals.get(key)', descKey: 'api.script.help.globalsGet' },
      { api: 'pm.globals.set(key, value)', descKey: 'api.script.help.globalsSet' },
      { api: 'pm.globals.unset(key)', descKey: 'api.script.help.globalsUnset' },
    ],
  },
  {
    categoryKey: 'api.script.help.variables',
    items: [
      { api: 'pm.variables.get(key)', descKey: 'api.script.help.variablesGet' },
      { api: 'pm.variables.set(key, value)', descKey: 'api.script.help.variablesSet' },
    ],
  },
  {
    categoryKey: 'api.script.help.requestOps',
    items: [
      { api: 'pm.request.url', descKey: 'api.script.help.requestUrl' },
      { api: 'pm.request.method', descKey: 'api.script.help.requestMethod' },
      { api: 'pm.request.headers.upsert({ key, value })', descKey: 'api.script.help.requestHeadersUpsert' },
      { api: 'pm.request.headers.remove(key)', descKey: 'api.script.help.requestHeadersRemove' },
      { api: 'pm.request.headers.get(key)', descKey: 'api.script.help.requestHeadersGet' },
      { api: 'pm.request.body.update(newBody)', descKey: 'api.script.help.requestBodyUpdate' },
    ],
  },
  {
    categoryKey: 'api.script.help.responseOps',
    items: [
      { api: 'pm.response.code', descKey: 'api.script.help.responseCode' },
      { api: 'pm.response.status', descKey: 'api.script.help.responseStatus' },
      { api: 'pm.response.json()', descKey: 'api.script.help.responseJson' },
      { api: 'pm.response.text()', descKey: 'api.script.help.responseText' },
      { api: 'pm.response.responseTime', descKey: 'api.script.help.responseTime' },
      { api: 'pm.response.headers.get(key)', descKey: 'api.script.help.responseHeadersGet' },
    ],
  },
  {
    categoryKey: 'api.script.help.assertions',
    items: [
      { api: 'pm.test(name, fn)', descKey: 'api.script.help.testDeclare' },
      { api: 'pm.expect(value).to.equal(expected)', descKey: 'api.script.help.expectEqual' },
      { api: 'pm.expect(value).to.deep.equal(obj)', descKey: 'api.script.help.expectDeepEqual' },
      { api: 'pm.expect(obj).to.have.property(key)', descKey: 'api.script.help.expectProperty' },
      { api: 'pm.expect(value).to.be.true', descKey: 'api.script.help.expectTrue' },
      { api: 'pm.expect(value).to.not.equal(val)', descKey: 'api.script.help.expectNotEqual' },
    ],
  },
  {
    categoryKey: 'api.script.help.console',
    items: [
      { api: 'console.log(...args)', descKey: 'api.script.help.consoleLog' },
      { api: 'console.warn(...args)', descKey: 'api.script.help.consoleWarn' },
      { api: 'console.error(...args)', descKey: 'api.script.help.consoleError' },
    ],
  },
]

function HelpModal({ open, onClose }: { open: boolean, onClose: () => void }) {
  const { t } = useTranslation()
  const [messageApi, contextHolder] = message.useMessage()

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(t('api.script.aiPrompt'))
      messageApi.success(t('api.script.promptCopied'))
    }
    catch {
      messageApi.error(t('api.script.copyFailed'))
    }
  }

  return (
    <Modal
      footer={null}
      open={open}
      title={t('api.script.helpTitle')}
      width={640}
      onCancel={onClose}
    >
      {contextHolder}
      <div className="max-h-[60vh] overflow-auto">
        <div className="mb-4 rounded-lg border p-3" style={{ borderColor: 'var(--ant-color-primary-border)', backgroundColor: 'var(--ant-color-primary-bg)' }}>
          <div className="flex items-center justify-between">
            <div>
              <Typography.Text strong>{t('api.script.aiTitle')}</Typography.Text>
              <Typography.Text className="mt-0.5 block text-xs" type="secondary">
                {t('api.script.aiDesc')}
              </Typography.Text>
            </div>
            <Button
              icon={<CopyIcon size={14} />}
              type="primary"
              onClick={() => void handleCopyPrompt()}
            >
              {t('api.script.copyPrompt')}
            </Button>
          </div>
        </div>
        <Typography.Paragraph className="mb-4" type="secondary">
          {t('api.script.introPrefix')}
          {' '}
          <code>pm</code>
          {' '}
          {t('api.script.introSuffix')}
        </Typography.Paragraph>
        {HELP_GROUPS.map((group) => (
          <div key={group.categoryKey} className="mb-4">
            <Typography.Text strong className="mb-2 block">{translateKey(group.categoryKey)}</Typography.Text>
            <div className="rounded border" style={{ borderColor: 'var(--ant-color-border-secondary)' }}>
              {group.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-3 py-1.5"
                  style={{ borderBottom: i < group.items.length - 1 ? '1px solid var(--ant-color-border-secondary)' : undefined }}
                >
                  <code className="shrink-0 text-xs" style={{ color: 'var(--ant-color-primary)' }}>{item.api}</code>
                  <span className="text-xs opacity-70">{translateKey(item.descKey)}</span>
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
  const { t } = useTranslation()
  const [helpOpen, setHelpOpen] = useState(false)

  const failedTestCount = testResults.filter((r) => !r.passed).length
  const errorCount = consoleEntries.filter((e) => e.level === 'error').length

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
        <Badge className="ml-1" count={errorCount} size="small" />
      )}
    </span>
  ), [errorCount])

  const testTabLabel = useMemo(() => (
    <span>
      {t('api.script.testResults')}
      {failedTestCount > 0 && (
        <Badge className="ml-1" count={failedTestCount} size="small" />
      )}
    </span>
  ), [failedTestCount, t])

  const hasOutput = consoleEntries.length > 0 || testResults.length > 0

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-1 flex items-center justify-between">
        <div />
        <Button
          icon={<HelpCircleIcon size={14} />}
          size="small"
          type="link"
          onClick={() => { setHelpOpen(true) }}
        >
          {t('api.script.helpButton')}
        </Button>
      </div>
      <div className="flex flex-col rounded border" style={{ borderColor: token.colorBorderSecondary, height: 200 }}>
        <MonacoEditor
          deserializeOnChange={false}
          height="100%"
          language={language}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            tabSize: 2,
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
          value={value ?? ''}
          onChange={(val) => onChange?.(typeof val === 'string' ? val : '')}
          onMount={handleEditorMount}
        />
      </div>

      {hasOutput && (
        <div className="mt-1.5 overflow-hidden rounded border" style={{ borderColor: token.colorBorderSecondary }}>
          <Tabs
            animated={false}
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
            size="small"
          />
        </div>
      )}

      <HelpModal open={helpOpen} onClose={() => { setHelpOpen(false) }} />
    </div>
  )
}
