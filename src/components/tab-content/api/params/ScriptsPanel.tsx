import { ScriptTab } from '../scripts'
import type { ScriptConsoleEntry, ScriptTestResult } from '@/types'

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
    <div className="px-2 pb-1.5 h-full">
      <ScriptTab
        preScript={preScript}
        postScript={postScript}
        onPreScriptChange={onPreScriptChange}
        onPostScriptChange={onPostScriptChange}
        preScriptConsole={preScriptConsole}
        preScriptTests={preScriptTests}
        postScriptConsole={postScriptConsole}
        postScriptTests={postScriptTests}
      />
    </div>
  )
}
