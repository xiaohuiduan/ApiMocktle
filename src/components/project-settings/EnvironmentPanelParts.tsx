import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Select, Tabs, Tag, theme, Typography } from 'antd'
import type { TFunction } from 'i18next'
import { GlobeIcon, KeyRoundIcon, PlusIcon, TrashIcon } from 'lucide-react'

import {
  type BaseUrlProtocol,
  type BaseUrlProtocolDraft,
  createEnvironmentBaseUrl,
  createEnvironmentValue,
  parseBaseUrl,
  resolveBaseUrlProtocol,
  serializeBaseUrl,
} from '@/project-environment-utils'
import {
  type ApiEnvironment,
  type ApiEnvironmentGlobalParameterSection,
  type ApiEnvironmentValue,
  GLOBAL_PARAMETER_SECTIONS,
  type ProjectEnvironmentConfig,
} from '@/types'

import { GLOBAL_PARAMETER_LABELS } from './GlobalParametersEditor'
import { TabValueEditor, ValueEditor } from './ValueEditor'

export type GlobalSectionKey = 'globalVariables' | 'globalParameters'
export type EnvironmentSectionKey = `environment:${string}`
export type SectionKey = GlobalSectionKey | EnvironmentSectionKey

export interface GlobalSectionItem {
  key: GlobalSectionKey
  label: string
  icon: React.ReactNode
  description: string
}

/**
 * 左侧「全局」分区的条目。
 *
 * 必须是函数：标签与说明随语言变化，模块顶层求值会在加载时固定住。
 * 消费方在渲染期用 `useMemo(() => createGlobalSectionItems(t), [t])`。
 */
export function createGlobalSectionItems(t: TFunction): GlobalSectionItem[] {
  return [
    {
      key: 'globalVariables',
      label: t('settings.environments.globalVariables'),
      icon: <GlobeIcon size={14} />,
      description: t('settings.environments.globalVariablesDescription'),
    },
    {
      key: 'globalParameters',
      label: t('settings.environments.globalParameters'),
      icon: <KeyRoundIcon size={14} />,
      description: t('settings.environments.globalParametersDescription'),
    },
  ]
}

export function createEnvironmentKey(environmentId: string): EnvironmentSectionKey {
  return `environment:${environmentId}`
}

function isEnvironmentSection(key: SectionKey): key is EnvironmentSectionKey {
  return key.startsWith('environment:')
}

export function getFallbackSection(config: ProjectEnvironmentConfig): SectionKey {
  return config.environments[0] ? createEnvironmentKey(config.environments[0].id) : 'globalVariables'
}

export function resolveEnvironment(config: ProjectEnvironmentConfig, key: SectionKey) {
  if (!isEnvironmentSection(key)) {
    return undefined
  }

  return config.environments.find(({ id }) => id === key.slice('environment:'.length))
}

export function EnvironmentEditor(props: {
  editable: boolean
  environment: ApiEnvironment
  onChange: (nextEnvironment: ApiEnvironment) => void
  onDelete: () => void
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  effectiveVarMap?: Map<string, string>
}) {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const { editable, environment, onChange, onDelete, globalParameters, effectiveVarMap } = props
  const baseUrls = environment.baseUrls ?? []
  const variables = environment.variables ?? []
  const primaryBaseUrl = baseUrls[0] ?? createEnvironmentBaseUrl()
  const parsedBaseUrl = parseBaseUrl(primaryBaseUrl.url)
  // host 为空时 url 会被序列化成空串，协议无处存放，用本地草稿兜底
  // （草稿按环境 id 隔离，避免切换环境时串值）
  const [protocolDraft, setProtocolDraft] = useState<BaseUrlProtocolDraft | null>(null)
  const protocol = resolveBaseUrlProtocol(
    primaryBaseUrl.url,
    protocolDraft,
    environment.id,
  )

  const updatePrimaryUrl = (url: string) => {
    const nextBaseUrls = baseUrls.length > 0 ? baseUrls : [createEnvironmentBaseUrl()]
    onChange({ ...environment, baseUrls: [{ ...nextBaseUrls[0], url }, ...nextBaseUrls.slice(1)] })
  }

  const [activeParamSection, setActiveParamSection] = useState<ApiEnvironmentGlobalParameterSection>(GLOBAL_PARAMETER_SECTIONS[0])

  const handleAddParam = (section: ApiEnvironmentGlobalParameterSection) => {
    const sectionParams = environment.parameters?.[section] ?? []
    onChange({
      ...environment,
      parameters: {
        header: [],
        cookie: [],
        query: [],
        body: [],
        ...environment.parameters,
        [section]: [...sectionParams, createEnvironmentValue()],
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          <Input
            disabled={!editable}
            placeholder={t('settings.environments.namePlaceholder')}
            size="large"
            value={environment.name}
            onChange={(event) => {
              onChange({ ...environment, name: event.target.value })
            }}
          />
        </div>
        <Button danger disabled={!editable} icon={<TrashIcon size={14} />} onClick={onDelete}>
          {t('settings.environments.deleteEnvironment')}
        </Button>
      </div>

      <Input
        allowClear
        addonBefore="Mock Agent"
        disabled={!editable}
        placeholder={t('settings.environments.agentUrlPlaceholder')}
        value={environment.agentUrl ?? ''}
        onChange={(event) => {
          onChange({ ...environment, agentUrl: event.target.value || undefined })
        }}
      />

      <section className="space-y-3">
        <div>
          <Typography.Title level={5}>{t('settings.environments.baseUrl')}</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">
            {t('settings.environments.baseUrlDescription')}
          </Typography.Paragraph>
        </div>
        <div className="flex items-center gap-1">
          <Select
            disabled={!editable}
            options={[
              { value: 'http', label: 'http://' },
              { value: 'https', label: 'https://' },
            ]}
            style={{ width: 88, flexShrink: 0 }}
            value={protocol}
            onChange={(nextProtocol: BaseUrlProtocol) => {
              setProtocolDraft({ envId: environment.id, protocol: nextProtocol })
              updatePrimaryUrl(serializeBaseUrl(nextProtocol, parsedBaseUrl.host))
            }}
          />
          <Input
            disabled={!editable}
            placeholder="api.example.com"
            value={parsedBaseUrl.host}
            onChange={(event) => {
              updatePrimaryUrl(serializeBaseUrl(protocol, event.target.value))
            }}
          />
        </div>
      </section>

      <ValueEditor
        description={t('settings.environments.variablesDescription')}
        editable={editable}
        effectiveVarMap={effectiveVarMap}
        rows={variables}
        title={t('settings.environments.variables')}
        onAdd={() => {
          onChange({ ...environment, variables: [...variables, createEnvironmentValue()] })
        }}
        onChange={(nextRows) => {
          onChange({ ...environment, variables: nextRows })
        }}
      />

      <section className="space-y-3">
        <div>
          <Typography.Title level={5}>{t('settings.environments.parameters')}</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">
            {t('settings.environments.parametersDescription')}
          </Typography.Paragraph>
        </div>

        <Tabs
          activeKey={activeParamSection}
          animated={false}
          items={GLOBAL_PARAMETER_SECTIONS.map((section) => {
            const sectionParams = environment.parameters?.[section] ?? []
            const globalSectionRows = globalParameters?.[section] ?? []
            const envNames = new Set(sectionParams.map((p) => p.name))

            return {
              key: section,
              label: GLOBAL_PARAMETER_LABELS[section],
              children: (
                <div className="space-y-3 pt-3">
                  {globalSectionRows.length > 0 && (
                    <div
                      className="rounded-lg border px-3 py-2"
                      style={{ borderColor: token.colorBorderSecondary, backgroundColor: token.colorFillQuaternary }}
                    >
                      <Typography.Text className="text-xs" type="secondary">
                        {t('settings.environments.globalSet')}
                      </Typography.Text>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {globalSectionRows.map((g) => {
                          const overridden = envNames.has(g.name)
                          const label = g.value ? `${g.name}: ${g.value}` : g.name
                          const suffix = overridden
                            ? t('settings.environments.overriddenSuffix')
                            : g.value ? '' : t('settings.environments.noValueSuffix')

                          return (
                            <Tag key={g.id} color={overridden ? 'default' : 'blue'}>
                              {label}
                              {suffix}
                            </Tag>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <TabValueEditor
                    showEnable
                    editable={editable}
                    rows={sectionParams}
                    showAdd={false}
                    onAdd={() => {
                      onChange({
                        ...environment,
                        parameters: {
                          header: [],
                          cookie: [],
                          query: [],
                          body: [],
                          ...environment.parameters,
                          [section]: [...sectionParams, createEnvironmentValue()],
                        },
                      })
                    }}
                    onChange={(nextRows: ApiEnvironmentValue[]) => {
                      onChange({
                        ...environment,
                        parameters: {
                          header: [],
                          cookie: [],
                          query: [],
                          body: [],
                          ...environment.parameters,
                          [section]: nextRows,
                        },
                      })
                    }}
                  />
                </div>
              ),
            }
          })}
          tabBarExtraContent={{
            right: (
              <Button disabled={!editable} icon={<PlusIcon size={14} />} onClick={() => { handleAddParam(activeParamSection) }}>
                {t('common.add')}
              </Button>
            ),
          }}
          onChange={(key) => { setActiveParamSection(key as ApiEnvironmentGlobalParameterSection) }}
        />
      </section>
    </div>
  )
}
