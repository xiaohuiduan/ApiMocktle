import type { ApiDetails, ProjectEnvironmentConfig } from '@/types'
import { BaseParamsPanel } from './BaseParamsPanel'

interface QueryParamsPanelProps {
  value?: ApiDetails['parameters']
  onChange?: (value: QueryParamsPanelProps['value']) => void
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  envParameters?: ProjectEnvironmentConfig['globalParameters']
  varMap?: Map<string, string>
  disabledInheritedNames?: { query: Set<string>; header: Set<string>; cookie: Set<string> }
  onToggleInheritedParam?: (section: 'query' | 'header' | 'cookie', name: string, enabled: boolean) => void
  exampleColumnTitle?: string
}

export function QueryParamsPanel(props: QueryParamsPanelProps) {
  return <BaseParamsPanel type="query" showPathParams {...props} />
}
