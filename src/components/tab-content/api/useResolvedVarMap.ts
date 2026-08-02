import { useMemo } from 'react'

import { api } from '@/api-client'

export interface EnvVarInput {
  name?: string
  value?: string | null
}

export interface VarMapInput {
  globalVariables?: EnvVarInput[]
  envVariables?: EnvVarInput[]
  sessionVars?: Record<string, string>
}

export interface ResolvedVarMaps {
  /** 全局变量映射：global < env < sessionVars（后者覆盖前者） */
  varMap: Map<string, string>
  /** 仅 global，用于脚本 globals 上下文 */
  globalsMap: Record<string, string>
  /** env + sessionVars，用于脚本 environment 上下文 */
  envMap: Record<string, string>
}

/**
 * 统一构建变量映射，消除 RunTab 中多处重复的 varMap/globalsMap/envMap 构造。
 * 优先级：globalVariables 被 envVariables 覆盖，最终被 sessionVars 覆盖。
 */
export function buildVarMaps(input: VarMapInput): ResolvedVarMaps {
  const {
    globalVariables = [],
    envVariables = [],
    sessionVars = {},
  } = input

  const varMap = new Map<string, string>()

  for (const v of [...globalVariables, ...envVariables]) {
    if (v.name && v.value != null) { varMap.set(v.name, v.value) }
  }

  // 会话变量覆盖环境变量（最高优先级）
  for (const [k, v] of Object.entries(sessionVars)) {
    varMap.set(k, v)
  }

  const globalsMap: Record<string, string> = {}

  for (const v of globalVariables) {
    if (v.name && v.value != null) { globalsMap[v.name] = v.value }
  }

  const envMap: Record<string, string> = {}

  for (const v of envVariables) {
    if (v.name && v.value != null) { envMap[v.name] = v.value }
  }

  // 会话变量合并到 envMap
  Object.assign(envMap, sessionVars)

  return { varMap, globalsMap, envMap }
}

/** Rust 返回的变量替换位置（字符偏移） */
export interface ResolvedVar {
  name: string
  value: string
  start: number
  end: number
}

/** 单字段求值结果 */
export interface ResolvedField {
  resolved: string
  vars: ResolvedVar[]
  errors: string[]
}

/**
 * 批量解析动态变量（{{$xxx}}）：一次 IPC 交给 Rust 单点求值（Rhai 引擎），
 * 返回与输入同序的替换结果（含替换位置映射，供展示区高亮）。
 * 用户变量（{{var}}）由 makeResolveVars 本地替换。
 */
export async function resolveTemplateBatch(fields: string[]): Promise<ResolvedField[]> {
  return api<ResolvedField[]>('resolve_template_batch', { fields })
}

/** 生成 {{var}} 替换函数（用户变量；内置动态变量 {{$xxx}} 已由 IPC 预处理） */
export function makeResolveVars(varMap: Map<string, string>): (val: string) => string {
  return (s: string) => {
    // 用户变量（{{name}}），未命中保留原样
    return s.replace(/\{\{(\w+)\}\}/g, (_, name) => varMap.get(name) ?? `{{${name}}}`)
  }
}

/** 组件级 hook：随环境/会话变量变化重新计算映射 */
export function useResolvedVarMap(input: VarMapInput): ResolvedVarMaps & { resolveVars: (val: string) => string } {
  return useMemo(() => {
    const maps = buildVarMaps(input)

    return { ...maps, resolveVars: makeResolveVars(maps.varMap) }
  }, [input.globalVariables, input.envVariables, input.sessionVars])
}
