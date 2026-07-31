import { nanoid } from 'nanoid'

import type {
  ApiEnvironment,
  ApiEnvironmentBaseUrl,
  ApiEnvironmentGlobalParameters,
  ApiEnvironmentValue,
  ProjectEnvironmentConfig,
} from '@/types'

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
    url: '',
  }
}

export function createEnvironment(): ApiEnvironment {
  return {
    id: nanoid(6),
    name: '新建环境',
    url: '',
    baseUrls: [createEnvironmentBaseUrl()],
    variables: [],
    parameters: createGlobalParameters(),
  }
}

export function getPrimaryEnvironmentUrl(environment: ApiEnvironment) {
  return environment.baseUrls?.find(({ url }) => url.trim())?.url ?? environment.url
}
