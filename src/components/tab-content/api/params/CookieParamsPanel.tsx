import type { ApiDetails, ProjectEnvironmentConfig } from '@/types'

import { BaseParamsPanel } from './BaseParamsPanel'

interface CookieParamsPanelProps {
  value?: ApiDetails['parameters']
  onChange?: (value: CookieParamsPanelProps['value']) => void
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  envParameters?: ProjectEnvironmentConfig['globalParameters']
  varMap?: Map<string, string>
  disabledInheritedNames?: { query: Set<string>, header: Set<string>, cookie: Set<string> }
  onToggleInheritedParam?: (section: 'query' | 'header' | 'cookie', name: string, enabled: boolean) => void
  exampleColumnTitle?: string
}

export function CookieParamsPanel(props: CookieParamsPanelProps) {
  return <BaseParamsPanel type="cookie" {...props} />
}
