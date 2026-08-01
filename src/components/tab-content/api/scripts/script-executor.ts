import type { ScriptExecutionResult, ScriptTestResult } from '@/types'

import type { PmContext } from './pm-types'

/** 简单的 expect 断言实现（Chai-like） */
function createExpect() {
  return function expect(actual: unknown) {
    const to = {
      equal(expected: unknown) {
        if (actual !== expected) { throw new Error(`expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`) }
      },
      deep: {
        equal(expected: unknown) {
          if (JSON.stringify(actual) !== JSON.stringify(expected)) { throw new Error(`expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`) }
        },
      },
      get be() {
        return {
          get true(): undefined {
            if (actual !== true) { throw new Error(`expected true but got ${JSON.stringify(actual)}`) }

            return undefined
          },
          get false(): undefined {
            if (actual !== false) { throw new Error(`expected false but got ${JSON.stringify(actual)}`) }

            return undefined
          },
          get undefined(): undefined {
            if (actual !== undefined) { throw new Error(`expected undefined but got ${JSON.stringify(actual)}`) }

            return undefined
          },
          get null(): undefined {
            if (actual !== null) { throw new Error(`expected null but got ${JSON.stringify(actual)}`) }

            return undefined
          },
        }
      },
      have: {
        property(prop: string) {
          if (actual == null || typeof actual !== 'object' || !(prop in (actual as Record<string, unknown>))) { throw new Error(`expected object to have property "${prop}"`) }
        },
        length(len: number) {
          if (!actual || (actual as { length?: number }).length !== len) { throw new Error(`expected length ${len} but got ${(actual as { length?: number })?.length}`) }
        },
      },
      get not() {
        return {
          equal(expected: unknown) {
            if (actual === expected) { throw new Error(`expected not ${JSON.stringify(expected)}`) }
          },
          get be() {
            return {
              get null(): undefined {
                if (actual === null) { throw new Error('expected not null') }

                return undefined
              },
              get undefined(): undefined {
                if (actual === undefined) { throw new Error('expected not undefined') }

                return undefined
              },
            }
          },
        }
      },
    }

    return { to }
  }
}

/** 构建 pm 对象 */
function createPm(context: PmContext, result: ScriptExecutionResult) {
  const env = {
    get(key: string): string | undefined { return context.environment[key] },
    set(key: string, value: string) { result.variableDeltas[key] = value },
    unset(key: string) { result.variableDeltas[key] = '' },
    has(key: string): boolean { return key in context.environment },
    clear() { for (const key of Object.keys(context.environment)) { result.variableDeltas[key] = '' } },
  }

  const globals = {
    get(key: string): string | undefined { return context.globals[key] },
    set(key: string, value: string) { result.variableDeltas[key] = value },
    unset(key: string) { result.variableDeltas[key] = '' },
    has(key: string): boolean { return key in context.globals },
    clear() { for (const key of Object.keys(context.globals)) { result.variableDeltas[key] = '' } },
  }

  const variables = {
    get(key: string): string | undefined { return context.variables[key] },
    set(key: string, value: string) { result.variableDeltas[key] = value },
  }

  const requestHeaders = [...context.request.headers]
  const request = {
    url: context.request.url,
    method: context.request.method,
    headers: {
      all() { return requestHeaders },
      get(key: string) { return requestHeaders.find((h) => h.name.toLowerCase() === key.toLowerCase())?.value },
      upsert(header: { key: string, value: string }) {
        const idx = requestHeaders.findIndex((h) => h.name.toLowerCase() === header.key.toLowerCase())

        if (idx >= 0) { requestHeaders[idx] = { name: header.key, value: header.value } }
        else { requestHeaders.push({ name: header.key, value: header.value }) }

        result.headerDeltas ??= []

        const dIdx = result.headerDeltas.findIndex((h) => h.name.toLowerCase() === header.key.toLowerCase())

        if (dIdx >= 0) { result.headerDeltas[dIdx] = { name: header.key, value: header.value } }
        else { result.headerDeltas.push({ name: header.key, value: header.value }) }
      },
      remove(key: string) {
        const idx = requestHeaders.findIndex((h) => h.name.toLowerCase() === key.toLowerCase())

        if (idx >= 0) { requestHeaders.splice(idx, 1) }

        result.headerDeltas ??= []

        result.headerDeltas.push({ name: key, value: '' })
      },
    },
    body: {
      raw: context.request.body,
      update(newBody: string) { result.bodyDelta = newBody },
    },
  }

  let response: ReturnType<typeof createResponse> | undefined

  function createResponse() {
    const resp = context.response!

    return {
      code: resp.status,
      status: resp.statusText,
      headers: {
        all() { return resp.headers },
        get(key: string) { return resp.headers.find((h) => h.name.toLowerCase() === key.toLowerCase())?.value },
      },
      text() { return resp.body },
      json() {
        try { return JSON.parse(resp.body) }
        catch { throw new Error('Response body is not valid JSON') }
      },
      responseTime: resp.responseTime,
    }
  }

  if (context.response) { response = createResponse() }

  const tests: ScriptTestResult[] = []

  function test(name: string, fn: () => void) {
    try {
      fn()
      tests.push({ name, passed: true })
    }
    catch (err) { tests.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }) }
  }

  return { env, globals, variables, request, response, test, expect: createExpect(), _tests: tests }
}

/** 执行脚本的核心逻辑（可在主线程和 Worker 中使用） */
export async function executeScriptCore(code: string, context: PmContext): Promise<ScriptExecutionResult> {
  const result: ScriptExecutionResult = {
    success: true,
    consoleEntries: [],
    testResults: [],
    variableDeltas: {},
  }

  const pm = createPm(context, result)

  const consoleProxy = {
    log: (...args: unknown[]) => { result.consoleEntries.push({ level: 'log', args: args.map(String), timestamp: Date.now() }) },
    warn: (...args: unknown[]) => { result.consoleEntries.push({ level: 'warn', args: args.map(String), timestamp: Date.now() }) },
    error: (...args: unknown[]) => { result.consoleEntries.push({ level: 'error', args: args.map(String), timestamp: Date.now() }) },
    info: (...args: unknown[]) => { result.consoleEntries.push({ level: 'info', args: args.map(String), timestamp: Date.now() }) },
  }

  try {
    const wrappedCode = `(async function __script_runner__(pm, console) { ${code} })`
    const fn = new Function(`return ${wrappedCode}`)()
    await fn(pm, consoleProxy)
  }
  catch (err) {
    result.success = false
    result.error = err instanceof Error ? err.message : String(err)

    if (err instanceof Error && err.stack) {
      result.consoleEntries.push({ level: 'error', args: [err.stack], timestamp: Date.now() })
    }
  }

  result.testResults = pm._tests

  return result
}
