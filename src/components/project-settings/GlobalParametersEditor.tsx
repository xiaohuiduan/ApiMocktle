import { Tabs, Typography } from 'antd'

import { createEnvironmentValue } from '@/project-environment-utils'
import {
  GLOBAL_PARAMETER_SECTIONS,
  type ApiEnvironmentGlobalParameterSection,
  type ProjectEnvironmentConfig,
} from '@/types'

import { TabValueEditor } from './ValueEditor'

export const GLOBAL_PARAMETER_LABELS: Record<ApiEnvironmentGlobalParameterSection, string> = {
  header: 'Header',
  cookie: 'Cookie',
  query: 'Query',
  body: 'Body',
}

function updateGlobalParameterRows(
  parameters: ProjectEnvironmentConfig['globalParameters'],
  section: ApiEnvironmentGlobalParameterSection,
  nextRows: ProjectEnvironmentConfig['globalParameters'][ApiEnvironmentGlobalParameterSection],
) {
  return {
    ...parameters,
    [section]: nextRows,
  }
}

export function GlobalParametersEditor(props: {
  editable: boolean
  title: string
  description: string
  value: ProjectEnvironmentConfig['globalParameters']
  onChange: (nextValue: ProjectEnvironmentConfig['globalParameters']) => void
}) {
  const { editable, title, description, value, onChange } = props

  return (
    <section className="space-y-3">
      <div>
        <Typography.Title level={5}>{title}</Typography.Title>
        <Typography.Paragraph className="!mb-1" type="secondary">{description}</Typography.Paragraph>
        <Typography.Text type="secondary">
          Body 参数仅在 `form-data` 和 `x-www-form-urlencoded` 请求体中生效。
        </Typography.Text>
      </div>

      <Tabs
        animated={false}
        items={GLOBAL_PARAMETER_SECTIONS.map((section) => ({
          key: section,
          label: GLOBAL_PARAMETER_LABELS[section],
          children: (
            <TabValueEditor
              editable={editable}
              showEnable
              rows={value[section]}
              onAdd={() => {
                onChange(updateGlobalParameterRows(value, section, [...value[section], createEnvironmentValue()]))
              }}
              onChange={(nextRows) => {
                onChange(updateGlobalParameterRows(value, section, nextRows))
              }}
            />
          ),
        }))}
      />
    </section>
  )
}
