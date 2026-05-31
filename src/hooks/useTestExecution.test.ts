import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTestExecution, useSaveExecution } from './useTestExecution'
import type { TestStep, ScriptExecutionResult, AssertionResult } from '@/types'

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock script-executor
vi.mock('@/components/tab-content/api/scripts/script-executor', () => ({
  executeScriptCore: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { executeScriptCore } from '@/components/tab-content/api/scripts/script-executor'

const mockInvoke = vi.mocked(invoke)
const mockExecuteScript = vi.mocked(executeScriptCore)

// ==================== 测试数据 ====================

const TASK_ID = 'task-1'
const PROJECT_ID = 'project-1'

function makeStep(overrides: Partial<TestStep> = {}): TestStep {
  return {
    id: 'step-1',
    taskId: TASK_ID,
    sortOrder: 0,
    name: '测试步骤',
    menuItemId: 'menu-1',
    enabled: true,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  }
}

function makeSuccessRequestResponse() {
  return {
    ok: true,
    data: {
      request: { url: '/api/test', method: 'GET', headers: [], body: '' },
      step: { name: '测试步骤' },
      response: { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: '{"ok":true}', responseTime: 50 },
    },
  }
}

// ==================== useTestExecution ====================

describe('useTestExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('初始状态为 idle', () => {
      const { result } = renderHook(() => useTestExecution())

      expect(result.current.progress.status).toBe('idle')
      expect(result.current.progress.stepResults).toEqual([])
      expect(result.current.progress.variables).toEqual({})
      expect(result.current.progress.currentStepIndex).toBe(0)
      expect(result.current.progress.totalSteps).toBe(0)
    })
  })

  describe('reset', () => {
    it('重置后恢复初始 idle 状态', async () => {
      mockInvoke.mockResolvedValue(makeSuccessRequestResponse())

      const { result } = renderHook(() => useTestExecution())

      // 先执行一次使状态变化
      await act(async () => {
        await result.current.executeTask(TASK_ID, PROJECT_ID, [makeStep()])
      })

      expect(result.current.progress.status).toBe('passed')

      // reset
      act(() => {
        result.current.reset()
      })

      expect(result.current.progress.status).toBe('idle')
      expect(result.current.progress.stepResults).toEqual([])
    })
  })

  describe('executeTask — 正常执行', () => {
    it('单个步骤执行成功 → passed', async () => {
      mockInvoke.mockResolvedValue(makeSuccessRequestResponse())

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(TASK_ID, PROJECT_ID, [makeStep()])
      })

      expect(progress.status).toBe('passed')
      expect(progress.stepResults).toHaveLength(1)
      expect(progress.stepResults[0].status).toBe('passed')
      expect(progress.totalSteps).toBe(1)
    })

    it('多个步骤全部成功 → passed', async () => {
      mockInvoke.mockResolvedValue(makeSuccessRequestResponse())

      const steps = [
        makeStep({ id: 'step-1', name: '步骤一' }),
        makeStep({ id: 'step-2', name: '步骤二' }),
        makeStep({ id: 'step-3', name: '步骤三' }),
      ]

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(TASK_ID, PROJECT_ID, steps)
      })

      expect(progress.status).toBe('passed')
      expect(progress.stepResults).toHaveLength(3)
      expect(progress.stepResults.every((r: any) => r.status === 'passed')).toBe(true)
    })
  })

  describe('executeTask — 失败与 failFast', () => {
    it('某步骤断言失败 + failFast=true → 后续步骤 skipped', async () => {
      // 第一个步骤返回失败断言
      mockInvoke.mockResolvedValueOnce(makeSuccessRequestResponse()) // step-1 request
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        data: [{ assertion: { type: 'status', operator: 'equals', expected: 200 }, passed: false, actual: 500 }],
      }) // step-1 assertions

      const steps = [
        makeStep({ id: 'step-1', name: '步骤一', assertionsJson: [{ type: 'status', operator: 'equals', expected: 200 }] }),
        makeStep({ id: 'step-2', name: '步骤二' }),
        makeStep({ id: 'step-3', name: '步骤三' }),
      ]

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(TASK_ID, PROJECT_ID, steps, {}, true)
      })

      expect(progress.status).toBe('failed')
      expect(progress.stepResults).toHaveLength(3)
      expect(progress.stepResults[0].status).toBe('failed')
      expect(progress.stepResults[1].status).toBe('skipped')
      expect(progress.stepResults[2].status).toBe('skipped')
    })

    it('某步骤断言失败 + failFast=false → 后续步骤继续执行', async () => {
      // step-1 失败
      mockInvoke.mockResolvedValueOnce(makeSuccessRequestResponse()) // step-1 request
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        data: [{ assertion: { type: 'status', operator: 'equals', expected: 200 }, passed: false, actual: 500 }],
      }) // step-1 assertions
      // step-2 成功
      mockInvoke.mockResolvedValueOnce(makeSuccessRequestResponse()) // step-2 request

      const steps = [
        makeStep({ id: 'step-1', name: '步骤一', assertionsJson: [{ type: 'status', operator: 'equals', expected: 200 }] }),
        makeStep({ id: 'step-2', name: '步骤二' }),
      ]

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(TASK_ID, PROJECT_ID, steps, {}, false)
      })

      expect(progress.status).toBe('failed')
      expect(progress.stepResults).toHaveLength(2)
      expect(progress.stepResults[0].status).toBe('failed')
      expect(progress.stepResults[1].status).toBe('passed')
    })

    it('步骤抛异常 → status=error + failFast 跳过后续', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('网络超时'))

      const steps = [
        makeStep({ id: 'step-1', name: '步骤一' }),
        makeStep({ id: 'step-2', name: '步骤二' }),
      ]

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(TASK_ID, PROJECT_ID, steps, {}, true)
      })

      expect(progress.status).toBe('failed')
      expect(progress.stepResults[0].status).toBe('error')
      expect(progress.stepResults[0].errorMessage).toContain('网络超时')
      expect(progress.stepResults[1].status).toBe('skipped')
    })
  })

  describe('executeTask — abort', () => {
    it('中途中止 → 剩余步骤全部 skipped', async () => {
      // 让 invoke 调用时可以被 abort
      let resolveFirst: (v: any) => void
      const firstStepPromise = new Promise((resolve) => { resolveFirst = resolve })
      mockInvoke.mockReturnValueOnce(firstStepPromise as any)

      const steps = [
        makeStep({ id: 'step-1', name: '步骤一' }),
        makeStep({ id: 'step-2', name: '步骤二' }),
      ]

      const { result } = renderHook(() => useTestExecution())

      // 开始执行（不 await，以便中途 abort）
      const execPromise = act(async () => {
        return result.current.executeTask(TASK_ID, PROJECT_ID, steps)
      })

      // 等一下让循环进入第一步
      await new Promise((r) => setTimeout(r, 10))

      // 中止
      result.current.abort()

      // 完成第一步的 promise
      resolveFirst!(makeSuccessRequestResponse())

      const progress = await execPromise

      // step-1 可能是 skipped（abort 在 request 之前）或正常完成
      // step-2 应该是 skipped
      expect(progress.stepResults).toHaveLength(2)
      expect(progress.stepResults[1].status).toBe('skipped')
    })
  })

  describe('executeTask — 跳过 disabled 步骤', () => {
    it('enabled=false 的步骤被过滤', async () => {
      mockInvoke.mockResolvedValue(makeSuccessRequestResponse())

      const steps = [
        makeStep({ id: 'step-1', name: '启用步骤', enabled: true }),
        makeStep({ id: 'step-2', name: '禁用步骤', enabled: false }),
        makeStep({ id: 'step-3', name: '启用步骤2', enabled: true }),
      ]

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(TASK_ID, PROJECT_ID, steps)
      })

      expect(progress.totalSteps).toBe(2) // 只有 2 个 enabled 步骤
      expect(progress.stepResults).toHaveLength(2)
      expect(progress.stepResults[0].stepId).toBe('step-1')
      expect(progress.stepResults[1].stepId).toBe('step-3')
    })
  })

  describe('executeTask — 变量传递', () => {
    it('extractor 提取的变量传递到后续步骤', async () => {
      // step-1: request + extractor
      mockInvoke.mockResolvedValueOnce(makeSuccessRequestResponse()) // step-1 request
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        data: {
          results: [{ extractor: { type: 'json_path', path: '$.ok', variable: 'token' }, success: true, value: 'abc123' }],
          variables: { token: 'abc123' },
        },
      }) // step-1 extractors
      // step-2: request（应包含 step-1 的变量）
      mockInvoke.mockResolvedValueOnce(makeSuccessRequestResponse()) // step-2 request

      const steps = [
        makeStep({ id: 'step-1', name: '登录', extractorsJson: [{ type: 'json_path', path: '$.ok', variable: 'token' }] }),
        makeStep({ id: 'step-2', name: '访问' }),
      ]

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(TASK_ID, PROJECT_ID, steps, { initial: 'val' })
      })

      expect(progress.variables).toEqual(expect.objectContaining({ initial: 'val', token: 'abc123' }))

      // 验证 step-2 的 invoke 调用包含了合并后的 variables
      const step2Call = mockInvoke.mock.calls.find(
        (call) => call[0] === 'execute_test_step_request' && call[1]?.stepId === 'step-2'
      )
      expect(step2Call).toBeDefined()
      expect(step2Call![1].variables).toEqual(expect.objectContaining({ initial: 'val', token: 'abc123' }))
    })

    it('初始变量正确传递', async () => {
      mockInvoke.mockResolvedValue(makeSuccessRequestResponse())

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(
          TASK_ID, PROJECT_ID, [makeStep()], { env: 'prod', baseUrl: 'https://api.example.com' }
        )
      })

      expect(progress.variables).toEqual(expect.objectContaining({ env: 'prod', baseUrl: 'https://api.example.com' }))
    })
  })

  describe('executeTask — pre-script / post-script', () => {
    it('pre-script 变量合并到 variables', async () => {
      mockExecuteScript.mockResolvedValueOnce({
        success: true, testResults: [], consoleLogs: [],
        variableDeltas: { nonce: 'xyz789' },
      } as any) // pre-script
      mockInvoke.mockResolvedValueOnce(makeSuccessRequestResponse()) // request

      const steps = [
        makeStep({ id: 'step-1', name: '带预脚本', preScript: 'pm.variables.set("nonce", "xyz789")' }),
      ]

      const { result } = renderHook(() => useTestExecution())

      let progress: any
      await act(async () => {
        progress = await result.current.executeTask(TASK_ID, PROJECT_ID, steps)
      })

      expect(progress.variables).toEqual(expect.objectContaining({ nonce: 'xyz789' }))
      expect(mockExecuteScript).toHaveBeenCalledWith(
        'pm.variables.set("nonce", "xyz789")',
        expect.objectContaining({ variables: {} })
      )
    })

    it('post-script 使用 response 信息构建 context', async () => {
      mockInvoke.mockResolvedValueOnce(makeSuccessRequestResponse()) // request
      mockExecuteScript.mockResolvedValueOnce({
        success: true, testResults: [], consoleLogs: [],
      } as any) // post-script

      const steps = [
        makeStep({ id: 'step-1', name: '带后脚本', postScript: 'pm.test("ok", () => {})' }),
      ]

      const { result } = renderHook(() => useTestExecution())

      await act(async () => {
        await result.current.executeTask(TASK_ID, PROJECT_ID, steps)
      })

      expect(mockExecuteScript).toHaveBeenCalledWith(
        'pm.test("ok", () => {})',
        expect.objectContaining({
          request: expect.objectContaining({ url: '/api/test' }),
          response: expect.objectContaining({ status: 200 }),
        })
      )
    })
  })
})

// ==================== useSaveExecution ====================

describe('useSaveExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('成功保存执行记录', async () => {
    const execution = { id: 'exec-new', taskId: TASK_ID, status: 'passed', totalSteps: 1 }
    mockInvoke.mockResolvedValueOnce({ ok: true, data: execution }) // create_test_execution
    mockInvoke.mockResolvedValueOnce({ ok: true, data: null }) // create_test_step_result
    mockInvoke.mockResolvedValueOnce({ ok: true, data: null }) // finish_test_execution

    const { result } = renderHook(() => useSaveExecution())

    const progress = {
      status: 'passed' as const,
      currentStepIndex: 1,
      totalSteps: 1,
      stepResults: [{
        stepId: 'step-1',
        stepName: '步骤一',
        status: 'passed' as const,
        variableDeltas: {},
        durationMs: 100,
        requestJson: { url: '/api/test', method: 'GET' },
        responseJson: { status: 200 },
      }],
      variables: {},
      startTime: 1000,
      endTime: 1500,
    }

    let saved: any
    await act(async () => {
      saved = await result.current.saveExecution(TASK_ID, progress)
    })

    expect(saved).toEqual(execution)
    expect(mockInvoke).toHaveBeenCalledWith('create_test_execution', { taskId: TASK_ID, envJson: null })
    expect(mockInvoke).toHaveBeenCalledWith('create_test_step_result', expect.objectContaining({
      result: expect.objectContaining({ stepId: 'step-1', status: 'passed', executionId: 'exec-new' }),
    }))
    expect(mockInvoke).toHaveBeenCalledWith('finish_test_execution', expect.objectContaining({
      execId: 'exec-new',
      status: 'passed',
      passed: 1,
      failed: 0,
      skipped: 0,
      duration: 500,
    }))
  })

  it('创建 execution 失败时返回 null', async () => {
    mockInvoke.mockResolvedValue({ ok: false, error: '创建失败' })

    const { result } = renderHook(() => useSaveExecution())

    const progress = {
      status: 'failed' as const,
      currentStepIndex: 0,
      totalSteps: 0,
      stepResults: [],
      variables: {},
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let saved: any
    await act(async () => {
      saved = await result.current.saveExecution(TASK_ID, progress)
    })

    expect(saved).toBeNull()
    consoleSpy.mockRestore()
  })

  it('正确统计 passed/failed/skipped 数量', async () => {
    const execution = { id: 'exec-mixed', taskId: TASK_ID }
    mockInvoke.mockResolvedValueOnce({ ok: true, data: execution }) // create
    mockInvoke.mockResolvedValue({ ok: true, data: null }) // step results + finish

    const { result } = renderHook(() => useSaveExecution())

    const progress = {
      status: 'failed' as const,
      currentStepIndex: 3,
      totalSteps: 3,
      stepResults: [
        { stepId: 's1', stepName: 'S1', status: 'passed' as const, variableDeltas: {}, durationMs: 100 },
        { stepId: 's2', stepName: 'S2', status: 'failed' as const, variableDeltas: {}, durationMs: 50 },
        { stepId: 's3', stepName: 'S3', status: 'skipped' as const, variableDeltas: {}, durationMs: 0 },
      ],
      variables: {},
      startTime: 1000,
      endTime: 2000,
    }

    await act(async () => {
      await result.current.saveExecution(TASK_ID, progress)
    })

    expect(mockInvoke).toHaveBeenCalledWith('finish_test_execution', expect.objectContaining({
      passed: 1,
      failed: 1,
      skipped: 1,
      duration: 1000,
    }))
  })
})
