import type { ScriptExecutionResult } from '@/types'

import type { PmContext, ScriptWorkerRequest, ScriptWorkerResponse } from './pm-types'

export type { PmContext }

const DEFAULT_TIMEOUT_MS = 5000

let workerInstance: Worker | null = null

function getWorker(): Worker {
  workerInstance ??= new Worker(new URL('./script-worker.ts', import.meta.url), { type: 'module' })

  return workerInstance
}

/** 重建 Worker（执行出错后） */
function resetWorker() {
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
  }
}

/**
 * 在沙箱中执行脚本
 * @param code 用户脚本代码
 * @param context pm 上下文数据
 * @param timeoutMs 超时毫秒数（默认 5000）
 */
export async function executeScript(
  code: string,
  context: PmContext,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ScriptExecutionResult> {
  if (!code.trim()) {
    return {
      success: true,
      consoleEntries: [],
      testResults: [],
      variableDeltas: {},
    }
  }

  const worker = getWorker()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resetWorker()
      resolve({
        success: false,
        consoleEntries: [{ level: 'error', args: [`脚本执行超时（${timeoutMs}ms）`], timestamp: Date.now() }],
        testResults: [],
        variableDeltas: {},
        error: `脚本执行超时（${timeoutMs}ms）`,
      })
    }, timeoutMs)

    const onMessage = (e: MessageEvent<ScriptWorkerResponse>) => {
      if (e.data.type === 'result') {
        clearTimeout(timer)
        worker.removeEventListener('message', onMessage)
        resolve(e.data.result)
      }
    }

    const onError = (e: ErrorEvent) => {
      clearTimeout(timer)
      worker.removeEventListener('error', onError)
      resetWorker()
      resolve({
        success: false,
        consoleEntries: [{ level: 'error', args: [e.message], timestamp: Date.now() }],
        testResults: [],
        variableDeltas: {},
        error: e.message,
      })
    }

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)

    const request: ScriptWorkerRequest = { type: 'execute', code, context }
    worker.postMessage(request)
  })
}
