import type { ScriptWorkerRequest, ScriptWorkerResponse } from './pm-types'
import { executeScriptCore } from './script-executor'

// Worker 消息处理
self.onmessage = async (e: MessageEvent<ScriptWorkerRequest>) => {
  const { type, code, context } = e.data
  if (type !== 'execute') return

  try {
    const result = await executeScriptCore(code, context)
    const response: ScriptWorkerResponse = { type: 'result', result }
    self.postMessage(response)
  } catch (err) {
    const errorResult = {
      success: false,
      consoleEntries: [{ level: 'error' as const, args: [String(err)], timestamp: Date.now() }],
      testResults: [],
      variableDeltas: {},
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage({ type: 'result', result: errorResult })
  }
}
