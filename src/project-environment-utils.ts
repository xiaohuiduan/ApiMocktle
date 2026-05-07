import { nanoid } from 'nanoid'

import type {
  ApiEnvironment,
  ApiEnvironmentBaseUrl,
  ApiEnvironmentGlobalParameters,
  ApiEnvironmentValue,
  ProjectEnvironmentConfig,
} from '@/types'

export const DEFAULT_ENVIRONMENT_MODULE_NAME = '默认模块'

export function createGlobalParameters(): ApiEnvironmentGlobalParameters {
  return {
    header: [],
    cookie: [],
    query: [],
    body: [],
  }
}

export const EMPTY_PROJECT_ENVIRONMENT_CONFIG: ProjectEnvironmentConfig = {
  globalVariables: [],
  globalParameters: createGlobalParameters(),
  legacyGlobalParameters: [],
  vaultSecrets: [],
  environments: [],
}

export function createEnvironmentValue(): ApiEnvironmentValue {
  return {
    id: nanoid(6),
    name: '',
    value: '',
    enable: true,
  }
}

export function createEnvironmentBaseUrl(): ApiEnvironmentBaseUrl {
  return {
    id: nanoid(6),
    name: DEFAULT_ENVIRONMENT_MODULE_NAME,
    url: '',
  }
}

export function createEnvironment(): ApiEnvironment {
  return {
    id: nanoid(6),
    name: '新建环境',
    url: '',
    shared: true,
    baseUrls: [createEnvironmentBaseUrl()],
    variables: [],
    parameters: createGlobalParameters(),
  }
}

export function getPrimaryEnvironmentUrl(environment: ApiEnvironment) {
  return environment.baseUrls?.find(({ url }) => url.trim())?.url ?? environment.url
}
