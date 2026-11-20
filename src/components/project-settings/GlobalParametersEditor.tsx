import { useTranslation } from 'react-i18next'

import { Tabs, Typography } from 'antd'

import { createEnvironmentValue } from '@/project-environment-utils'
import {
  type ApiEnvironmentGlobalParameterSection,
  GLOBAL_PARAMETER_SECTIONS,
  type ProjectEnvironmentConfig,
} from '@/types'

import { TabValueEditor } from './ValueEditor'

/** 参数分区名是 HTTP 报文字段专有名词（Header/Cookie/Query/Body），不翻译。 */
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
  const { t } = useTranslation()
  const { editable, title, description, value, onChange } = props

  return (
    <section className="space-y-3">
      <div>
        <Typography.Title level={5}>{title}</Typography.Title>
        <Typography.Paragraph className="!mb-1" type="secondary">{description}</Typography.Paragraph>
        <Typography.Text type="secondary">
          {t('settings.environments.bodyParamHint')}
        </Typography.Text>
      </div>

      <Tabs
        animated={false}
        items={GLOBAL_PARAMETER_SECTIONS.map((section) => ({
          key: section,
          label: GLOBAL_PARAMETER_LABELS[section],
          children: (
            <TabValueEditor
              showEnable
              editable={editable}
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
