import { useTranslation } from 'react-i18next'

import { Tabs } from 'antd'

import type { ScriptConsoleEntry, ScriptTestResult } from '@/types'

import { ScriptEditor } from './ScriptEditor'

export interface ScriptTabProps {
  preScript?: string
  postScript?: string
  onPreScriptChange?: (value: string) => void
  onPostScriptChange?: (value: string) => void
  preScriptConsole?: ScriptConsoleEntry[]
  preScriptTests?: ScriptTestResult[]
  postScriptConsole?: ScriptConsoleEntry[]
  postScriptTests?: ScriptTestResult[]
}

export function ScriptTab(props: ScriptTabProps) {
  const { t } = useTranslation()
  const {
    preScript, postScript,
    onPreScriptChange, onPostScriptChange,
    preScriptConsole = [], preScriptTests = [],
    postScriptConsole = [], postScriptTests = [],
  } = props

  return (
    <Tabs
      animated={false}
      className="min-w-0"
      items={[
        {
          key: 'pre',
          label: t('api.script.preScript'),
          children: (
            <ScriptEditor
              consoleEntries={preScriptConsole}
              testResults={preScriptTests}
              value={preScript}
              onChange={onPreScriptChange}
            />
          ),
        },
        {
          key: 'post',
          label: t('api.script.postScript'),
          children: (
            <ScriptEditor
              consoleEntries={postScriptConsole}
              testResults={postScriptTests}
              value={postScript}
              onChange={onPostScriptChange}
            />
          ),
        },
      ]}
    />
  )
}
