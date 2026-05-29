import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type {
  TestStep,
  TestStepResult,
  TestExecution,
  ScriptExecutionResult,
  TestAssertion,
  AssertionResult,
  TestExtractor,
  ExtractorResult,
} from '@/types'
import { executeScriptCore } from '@/components/tab-content/api/scripts/script-executor'
import type { PmContext } from '@/components/tab-content/api/scripts/pm-types'

interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

interface StepExecutionResult {
  stepId: string
  stepName: string
  status: 'passed' | 'failed' | 'skipped' | 'error'
  requestJson?: Record<string, unknown>
  responseJson?: Record<string, unknown>
  scriptResults?: ScriptExecutionResult
  assertionResults?: AssertionResult[]
  extractorResults?: ExtractorResult[]
  variableDeltas: Record<string, string>
  durationMs: number
  errorMessage?: string
}

export interface ExecutionProgress {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'aborted'
  currentStepIndex: number
  totalSteps: number
  stepResults: StepExecutionResult[]
  variables: Record<string, string>
  startTime?: number
  endTime?: number
}

export function useTestExecution() {
  const [progress, setProgress] = useState<ExecutionProgress>({
    status: 'idle',
    currentStepIndex: 0,
    totalSteps: 0,
    stepResults: [],
    variables: {},
  })
  const abortControllerRef = useRef<AbortController | null>(null)

  const executeTask = useCallback(async (
    taskId: string,
    projectId: string,
    steps: TestStep[],
    initialVariables: Record<string, string> = {},
    failFast: boolean = true,
    environmentVariables: Record<string, string> = {},
    baseUrl?: string,
  ): Promise<ExecutionProgress> => {
    const enabledSteps = steps.filter((s) => s.enabled)
    const startTime = Date.now()

    setProgress({
      status: 'running',
      currentStepIndex: 0,
      totalSteps: enabledSteps.length,
      stepResults: [],
      variables: { ...initialVariables },
      startTime,
    })

    abortControllerRef.current = new AbortController()
    const stepResults: StepExecutionResult[] = []
    let variables = { ...initialVariables }
    let overallStatus: 'passed' | 'failed' | 'aborted' = 'passed'

    for (let i = 0; i < enabledSteps.length; i++) {
      if (abortControllerRef.current.signal.aborted) {
        overallStatus = 'aborted'
        // Mark remaining steps as skipped
        for (let j = i; j < enabledSteps.length; j++) {
          stepResults.push({
            stepId: enabledSteps[j].id,
            stepName: enabledSteps[j].name,
            status: 'skipped',
            variableDeltas: {},
            durationMs: 0,
          })
        }
        break
      }

      const step = enabledSteps[i]
      const stepStartTime = Date.now()

      setProgress((prev) => ({
        ...prev,
        currentStepIndex: i,
      }))

      try {
        // Execute pre-script if exists
        if (step.preScript) {
          const preContext: PmContext = {
            environment: environmentVariables,
            globals: {},
            variables,
            request: {
              url: '',
              method: 'GET',
              headers: [],
              body: '',
            },
          }
          const preResult = await executeScriptCore(step.preScript, preContext)
          if (preResult.variableDeltas) {
            variables = { ...variables, ...preResult.variableDeltas }
          }
        }

        // Execute the HTTP request via Tauri
        const requestResult = await invoke<ApiResult<Record<string, unknown>>>('execute_test_step_request', {
          sessionId: 'default',
          projectId,
          stepId: step.id,
          variables,
          baseUrl: baseUrl || null,
        })

        if (!requestResult.ok || !requestResult.data) {
          throw new Error(requestResult.error || 'Failed to execute request')
        }

        const requestJson = requestResult.data.request as Record<string, unknown>
        const stepData = requestResult.data.step as Record<string, unknown>
        const response = requestResult.data.response as Record<string, unknown> | undefined

        // Execute extractors if defined
        let extractorResults: ExtractorResult[] | undefined
        if (step.extractorsJson && step.extractorsJson.length > 0 && response) {
          const extractResult = await invoke<ApiResult<{ results: ExtractorResult[], variables: Record<string, string> }>>('execute_extractors', {
            extractors: step.extractorsJson,
            responseBody: (response as any).body || '',
            statusCode: (response as any).status || 200,
            responseHeaders: (response as any).headers || {},
          })
          if (extractResult.ok && extractResult.data) {
            extractorResults = extractResult.data.results
            variables = { ...variables, ...extractResult.data.variables }
          }
        }

        // Execute assertions if defined
        let assertionResults: AssertionResult[] | undefined
        if (step.assertionsJson && response) {
          const assertions = Array.isArray(step.assertionsJson) ? step.assertionsJson : []
          if (assertions.length > 0) {
            const assertResult = await invoke<ApiResult<AssertionResult[]>>('execute_assertions', {
              assertions,
              responseBody: (response as any).body || '',
              statusCode: (response as any).status || 200,
              responseHeaders: (response as any).headers || {},
              durationMs: Date.now() - stepStartTime,
            })
            if (assertResult.ok && assertResult.data) {
              assertionResults = assertResult.data
            }
          }
        }

        // Execute post-script if exists
        let scriptResults: ScriptExecutionResult | undefined
        if (step.postScript) {
          const postContext: PmContext = {
            environment: environmentVariables,
            globals: {},
            variables,
            request: {
              url: (requestJson.url as string) || '',
              method: (requestJson.method as string) || 'GET',
              headers: (requestJson.headers as Array<{ name: string; value: string }>) || [],
              body: (requestJson.body as string) || '',
            },
            response: response ? {
              status: (response as any).status || 200,
              statusText: (response as any).statusText || 'OK',
              headers: Object.entries((response as any).headers || {}).map(
                ([name, value]) => ({ name, value: String(value) })
              ),
              body: (response as any).body || '',
              responseTime: (response as any).responseTime || 0,
            } : undefined,
          }
          scriptResults = await executeScriptCore(step.postScript, postContext)
          if (scriptResults.variableDeltas) {
            variables = { ...variables, ...scriptResults.variableDeltas }
          }
        }

        const stepDuration = Date.now() - stepStartTime
        const stepStatus = determineStepStatus(scriptResults, assertionResults)

        const stepResult: StepExecutionResult = {
          stepId: step.id,
          stepName: step.name,
          status: stepStatus,
          requestJson,
          responseJson: response,
          scriptResults,
          assertionResults,
          extractorResults,
          variableDeltas: { ...variables },
          durationMs: stepDuration,
        }

        stepResults.push(stepResult)

        if (stepStatus === 'failed') {
          overallStatus = 'failed'
          if (failFast) {
            // Mark remaining steps as skipped
            for (let j = i + 1; j < enabledSteps.length; j++) {
              stepResults.push({
                stepId: enabledSteps[j].id,
                stepName: enabledSteps[j].name,
                status: 'skipped',
                variableDeltas: {},
                durationMs: 0,
              })
            }
            break
          }
        }
      } catch (err) {
        const stepDuration = Date.now() - stepStartTime
        const stepResult: StepExecutionResult = {
          stepId: step.id,
          stepName: step.name,
          status: 'error',
          variableDeltas: {},
          durationMs: stepDuration,
          errorMessage: String(err),
        }
        stepResults.push(stepResult)
        overallStatus = 'failed'

        if (failFast) {
          // Mark remaining steps as skipped
          for (let j = i + 1; j < enabledSteps.length; j++) {
            stepResults.push({
              stepId: enabledSteps[j].id,
              stepName: enabledSteps[j].name,
              status: 'skipped',
              variableDeltas: {},
              durationMs: 0,
            })
          }
          break
        }
      }

      setProgress((prev) => ({
        ...prev,
        stepResults: [...stepResults],
        variables: { ...variables },
      }))
    }

    const endTime = Date.now()
    const finalProgress: ExecutionProgress = {
      status: overallStatus,
      currentStepIndex: enabledSteps.length,
      totalSteps: enabledSteps.length,
      stepResults,
      variables,
      startTime,
      endTime,
    }

    setProgress(finalProgress)
    return finalProgress
  }, [])

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  const reset = useCallback(() => {
    setProgress({
      status: 'idle',
      currentStepIndex: 0,
      totalSteps: 0,
      stepResults: [],
      variables: {},
    })
  }, [])

  return {
    progress,
    executeTask,
    abort,
    reset,
  }
}

function determineStepStatus(
  scriptResults?: ScriptExecutionResult,
  assertionResults?: AssertionResult[]
): 'passed' | 'failed' {
  // Check structured assertions first
  if (assertionResults && assertionResults.length > 0) {
    const hasFailed = assertionResults.some((a) => !a.passed)
    if (hasFailed) return 'failed'
  }

  // Then check script test results
  if (scriptResults) {
    if (!scriptResults.success) return 'failed'
    if (scriptResults.testResults && scriptResults.testResults.length > 0) {
      const hasFailed = scriptResults.testResults.some((t) => !t.passed)
      if (hasFailed) return 'failed'
    }
  }

  return 'passed'
}

export function useSaveExecution() {
  const saveExecution = useCallback(async (
    taskId: string,
    progress: ExecutionProgress,
  ): Promise<TestExecution | null> => {
    try {
      // Create execution record
      const execution = await invoke<ApiResult<TestExecution>>('create_test_execution', {
        taskId,
        envJson: null,
      })

      if (!execution.ok || !execution.data) {
        console.error('Failed to create execution record')
        return null
      }

      const executionId = execution.data.id

      // Save step results
      for (const stepResult of progress.stepResults) {
        await invoke<ApiResult<null>>('create_test_step_result', {
          result: {
            id: crypto.randomUUID(),
            executionId,
            stepId: stepResult.stepId,
            sortOrder: progress.stepResults.indexOf(stepResult),
            status: stepResult.status,
            requestJson: stepResult.requestJson || null,
            responseJson: stepResult.responseJson || null,
            scriptResultsJson: stepResult.scriptResults || null,
            variableDeltasJson: stepResult.variableDeltas || null,
            durationMs: stepResult.durationMs,
            errorMessage: stepResult.errorMessage || null,
            executedAt: new Date().toISOString(),
          },
        })
      }

      // Update execution status
      const passedSteps = progress.stepResults.filter((r) => r.status === 'passed').length
      const failedSteps = progress.stepResults.filter((r) => r.status === 'failed' || r.status === 'error').length
      const skippedSteps = progress.stepResults.filter((r) => r.status === 'skipped').length
      const totalDuration = progress.endTime && progress.startTime
        ? progress.endTime - progress.startTime
        : 0

      await invoke<ApiResult<null>>('finish_test_execution', {
        execId: executionId,
        status: progress.status,
        passed: passedSteps,
        failed: failedSteps,
        skipped: skippedSteps,
        duration: totalDuration,
      })

      return execution.data
    } catch (err) {
      console.error('Failed to save execution:', err)
      return null
    }
  }, [])

  return { saveExecution }
}
