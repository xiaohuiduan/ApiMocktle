import { describe, expect, it } from 'vitest'
import { executeScriptCore } from './script-executor'
import type { PmContext } from './pm-types'

function makeContext(overrides?: Partial<PmContext>): PmContext {
  return {
    environment: { token: 'abc123', baseUrl: 'https://api.example.com' },
    globals: { globalVar: 'globalValue' },
    variables: { tempVar: 'tempValue' },
    request: {
      url: 'https://api.example.com/users',
      method: 'GET',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      body: '',
    },
    ...overrides,
  }
}

describe('executeScript', () => {
  it('should return success for empty script', async () => {
    const result = await executeScriptCore('', makeContext())
    expect(result.success).toBe(true)
    expect(result.consoleEntries).toHaveLength(0)
    expect(result.testResults).toHaveLength(0)
  })

  it('should return success for whitespace-only script', async () => {
    const result = await executeScriptCore('   \n  ', makeContext())
    expect(result.success).toBe(true)
  })

  // Console capture
  it('should capture console.log output', async () => {
    const result = await executeScriptCore(`
      console.log('hello', 'world')
      console.log(42)
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.consoleEntries).toHaveLength(2)
    expect(result.consoleEntries[0].level).toBe('log')
    expect(result.consoleEntries[0].args).toEqual(['hello', 'world'])
    expect(result.consoleEntries[1].args).toEqual(['42'])
  })

  it('should capture console.warn and console.error', async () => {
    const result = await executeScriptCore(`
      console.warn('warning')
      console.error('error message')
      console.info('info')
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.consoleEntries).toHaveLength(3)
    expect(result.consoleEntries[0].level).toBe('warn')
    expect(result.consoleEntries[1].level).toBe('error')
    expect(result.consoleEntries[2].level).toBe('info')
  })

  // pm.env
  it('should read environment variables via pm.env.get', async () => {
    const result = await executeScriptCore(`
      const val = pm.env.get('token')
      console.log(val)
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['abc123'])
  })

  it('should record variable deltas from pm.env.set', async () => {
    const result = await executeScriptCore(`
      pm.env.set('newVar', 'newValue')
      pm.env.set('token', 'overridden')
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.variableDeltas).toEqual({
      newVar: 'newValue',
      token: 'overridden',
    })
  })

  it('should support pm.env.has', async () => {
    const result = await executeScriptCore(`
      console.log(pm.env.has('token'))
      console.log(pm.env.has('nonexistent'))
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['true'])
    expect(result.consoleEntries[1].args).toEqual(['false'])
  })

  it('should support pm.env.unset', async () => {
    const result = await executeScriptCore(`
      pm.env.unset('token')
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.variableDeltas.token).toBe('')
  })

  // pm.globals
  it('should read globals via pm.globals.get', async () => {
    const result = await executeScriptCore(`
      console.log(pm.globals.get('globalVar'))
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['globalValue'])
  })

  it('should record variable deltas from pm.globals.set', async () => {
    const result = await executeScriptCore(`
      pm.globals.set('newGlobal', 'globalVal')
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.variableDeltas.newGlobal).toBe('globalVal')
  })

  // pm.variables
  it('should read and set temporary variables', async () => {
    const result = await executeScriptCore(`
      console.log(pm.variables.get('tempVar'))
      pm.variables.set('tempVar', 'updated')
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['tempValue'])
    expect(result.variableDeltas.tempVar).toBe('updated')
  })

  // pm.test and pm.expect
  it('should collect passing test results', async () => {
    const result = await executeScriptCore(`
      pm.test('status is 200', () => {
        pm.expect(200).to.equal(200)
      })
      pm.test('string equals', () => {
        pm.expect('hello').to.equal('hello')
      })
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.testResults).toHaveLength(2)
    expect(result.testResults[0]).toEqual({ name: 'status is 200', passed: true })
    expect(result.testResults[1]).toEqual({ name: 'string equals', passed: true })
  })

  it('should collect failing test results', async () => {
    const result = await executeScriptCore(`
      pm.test('failing test', () => {
        pm.expect(200).to.equal(404)
      })
    `, makeContext())

    expect(result.success).toBe(true) // script itself succeeds
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults[0].passed).toBe(false)
    expect(result.testResults[0].error).toContain('expected 404 but got 200')
  })

  it('should handle mixed passing and failing tests', async () => {
    const result = await executeScriptCore(`
      pm.test('pass', () => {
        pm.expect(1).to.equal(1)
      })
      pm.test('fail', () => {
        pm.expect('a').to.equal('b')
      })
      pm.test('also pass', () => {
        pm.expect(true).to.be.true
      })
    `, makeContext())

    expect(result.testResults).toHaveLength(3)
    expect(result.testResults[0].passed).toBe(true)
    expect(result.testResults[1].passed).toBe(false)
    expect(result.testResults[2].passed).toBe(true)
  })

  // pm.expect assertions
  it('should support pm.expect to.equal', async () => {
    const result = await executeScriptCore(`
      pm.test('equal', () => {
        pm.expect(42).to.equal(42)
      })
      pm.test('not equal', () => {
        pm.expect(42).to.not.equal(43)
      })
    `, makeContext())

    expect(result.testResults[0].passed).toBe(true)
    expect(result.testResults[1].passed).toBe(true)
  })

  it('should support pm.expect to.have.property', async () => {
    const result = await executeScriptCore(`
      pm.test('has property', () => {
        pm.expect({ name: 'test' }).to.have.property('name')
      })
    `, makeContext())

    expect(result.testResults[0].passed).toBe(true)
  })

  it('should support pm.expect to.deep.equal', async () => {
    const result = await executeScriptCore(`
      pm.test('deep equal', () => {
        pm.expect({ a: 1, b: 2 }).to.deep.equal({ a: 1, b: 2 })
      })
    `, makeContext())

    expect(result.testResults[0].passed).toBe(true)
  })

  // pm.request
  it('should provide access to pm.request', async () => {
    const result = await executeScriptCore(`
      console.log(pm.request.url)
      console.log(pm.request.method)
      console.log(pm.request.headers.get('Content-Type'))
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['https://api.example.com/users'])
    expect(result.consoleEntries[1].args).toEqual(['GET'])
    expect(result.consoleEntries[2].args).toEqual(['application/json'])
  })

  it('should track header modifications via pm.request.headers.upsert', async () => {
    const result = await executeScriptCore(`
      pm.request.headers.upsert({ key: 'Authorization', value: 'Bearer token123' })
      pm.request.headers.upsert({ key: 'Content-Type', value: 'text/plain' })
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.headerDeltas).toBeDefined()
    expect(result.headerDeltas!.find(h => h.name === 'Authorization')).toEqual({ name: 'Authorization', value: 'Bearer token123' })
    expect(result.headerDeltas!.find(h => h.name === 'Content-Type')).toEqual({ name: 'Content-Type', value: 'text/plain' })
  })

  // Async support
  it('should support async/await in scripts', async () => {
    const result = await executeScriptCore(`
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
      await delay(10)
      console.log('async done')
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['async done'])
  })

  // Error handling
  it('should catch runtime errors', async () => {
    const result = await executeScriptCore(`
      throw new Error('test error')
    `, makeContext())

    expect(result.success).toBe(false)
    expect(result.error).toContain('test error')
  })

  it('should catch syntax errors', async () => {
    const result = await executeScriptCore(`
      this is not valid javascript !!!
    `, makeContext())

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // Timeout - tested at engine level, core just executes
  // Note: executeScriptCore doesn't handle timeout, that's done by executeScript in script-engine.ts

  // Response context (post-script)
  it('should provide access to pm.response in post-script context', async () => {
    const result = await executeScriptCore(`
      console.log(pm.response.code)
      console.log(pm.response.status)
      console.log(pm.response.responseTime)
      const json = pm.response.json()
      console.log(json.name)
    `, makeContext({
      response: {
        status: 200,
        statusText: 'OK',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        body: '{"name":"test","id":1}',
        responseTime: 150,
      },
    }))

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['200'])
    expect(result.consoleEntries[1].args).toEqual(['OK'])
    expect(result.consoleEntries[2].args).toEqual(['150'])
    expect(result.consoleEntries[3].args).toEqual(['test'])
  })

  it('should support pm.response.text()', async () => {
    const result = await executeScriptCore(`
      const text = pm.response.text()
      console.log(text)
    `, makeContext({
      response: {
        status: 200,
        statusText: 'OK',
        headers: [],
        body: 'plain text response',
        responseTime: 50,
      },
    }))

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['plain text response'])
  })

  // pm.response.headers
  it('should support pm.response.headers.get', async () => {
    const result = await executeScriptCore(`
      console.log(pm.response.headers.get('Content-Type'))
    `, makeContext({
      response: {
        status: 200,
        statusText: 'OK',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        body: '{}',
        responseTime: 10,
      },
    }))

    expect(result.success).toBe(true)
    expect(result.consoleEntries[0].args).toEqual(['application/json'])
  })

  // Integration: pre-script sets variable, verify in deltas
  it('integration: pre-script sets timestamp and sign', async () => {
    const result = await executeScriptCore(`
      const timestamp = '1234567890'
      pm.env.set('timestamp', timestamp)
      const sign = 'mock_md5_sign'
      pm.request.headers.upsert({ key: 'X-Sign', value: sign })
      console.log('签名已生成:', sign)
    `, makeContext())

    expect(result.success).toBe(true)
    expect(result.variableDeltas.timestamp).toBe('1234567890')
    expect(result.headerDeltas).toBeDefined()
    expect(result.headerDeltas!.find(h => h.name === 'X-Sign')).toEqual({ name: 'X-Sign', value: 'mock_md5_sign' })
  })

  // Integration: post-script extracts token
  it('integration: post-script extracts token from response', async () => {
    const result = await executeScriptCore(`
      const json = pm.response.json()
      pm.test('状态码为200', () => {
        pm.expect(pm.response.code).to.equal(200)
      })
      if (json.data && json.data.token) {
        pm.env.set('authToken', json.data.token)
        console.log('token已提取并设置环境变量')
      }
      pm.test('返回包含userId', () => {
        pm.expect(json.data).to.have.property('userId')
      })
    `, makeContext({
      response: {
        status: 200,
        statusText: 'OK',
        headers: [],
        body: '{"data":{"token":"xyz789","userId":42}}',
        responseTime: 100,
      },
    }))

    expect(result.success).toBe(true)
    expect(result.variableDeltas.authToken).toBe('xyz789')
    expect(result.testResults).toHaveLength(2)
    expect(result.testResults[0]).toEqual({ name: '状态码为200', passed: true })
    expect(result.testResults[1]).toEqual({ name: '返回包含userId', passed: true })
  })
})
