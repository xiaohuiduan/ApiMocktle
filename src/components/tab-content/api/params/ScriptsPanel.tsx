import type { ScriptConsoleEntry, ScriptTestResult } from '@/types'

import { ScriptTab } from '../scripts'

interface ScriptsPanelProps {
  preScript?: string
  postScript?: string
  onPreScriptChange?: (value: string) => void
  onPostScriptChange?: (value: string) => void
  preScriptConsole?: ScriptConsoleEntry[]
  preScriptTests?: ScriptTestResult[]
  postScriptConsole?: ScriptConsoleEntry[]
  postScriptTests?: ScriptTestResult[]
}

export function ScriptsPanel(props: ScriptsPanelProps) {
  const {
    preScript,
    postScript,
    onPreScriptChange,
    onPostScriptChange,
    preScriptConsole,
    preScriptTests,
    postScriptConsole,
    postScriptTests,
  } = props

  return (
    <div className="h-full px-2 pb-1.5">
      <ScriptTab
        postScript={postScript}
        postScriptConsole={postScriptConsole}
        postScriptTests={postScriptTests}
        preScript={preScript}
        preScriptConsole={preScriptConsole}
        preScriptTests={preScriptTests}
        onPostScriptChange={onPostScriptChange}
        onPreScriptChange={onPreScriptChange}
      />
    </div>
  )
}
