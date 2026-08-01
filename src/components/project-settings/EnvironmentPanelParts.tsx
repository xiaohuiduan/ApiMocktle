import { useState } from 'react'

import { Button, Input, Select, Tabs, Tag, theme, Typography } from 'antd'
import { GlobeIcon, KeyRoundIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { createEnvironmentBaseUrl, createEnvironmentValue } from '@/project-environment-utils'
import {
  type ApiEnvironment,
  type ApiEnvironmentGlobalParameterSection,
  type ApiEnvironmentValue,
  GLOBAL_PARAMETER_SECTIONS,
  type ProjectEnvironmentConfig,
} from '@/types'

import { GLOBAL_PARAMETER_LABELS } from './GlobalParametersEditor'
import { TabValueEditor, ValueEditor } from './ValueEditor'

// 前置 URL 协议与域名拆分：url 仍存完整地址（如 https://api.example.com），仅用于输入展示
function parseBaseUrl(url: string): { protocol: 'http' | 'https', host: string } {
  const trimmed = url.trim()

  if (/^http:\/\//i.test(trimmed)) {
    return { protocol: 'http', host: trimmed.replace(/^http:\/\//i, '') }
  }

  // 默认 https（含空值、无协议、https:// 开头）
  return { protocol: 'https', host: trimmed.replace(/^https?:\/\//i, '') }
}

function serializeBaseUrl(protocol: 'http' | 'https', host: string): string {
  const h = host.trim()

  return h ? `${protocol}://${h}` : ''
}

export type GlobalSectionKey = 'globalVariables' | 'globalParameters'
export type EnvironmentSectionKey = `environment:${string}`
export type SectionKey = GlobalSectionKey | EnvironmentSectionKey
export const GLOBAL_SECTION_ITEMS: {
  key: GlobalSectionKey
  label: string
  icon: React.ReactNode
  description: string
}[] = [
  {
    key: 'globalVariables',
    label: '全局变量',
    icon: <GlobeIcon size={14} />,
    description: '用于维护所有环境共享的通用变量。',
  },
  {
    key: 'globalParameters',
    label: '全局参数',
    icon: <KeyRoundIcon size={14} />,
    description: '用于按 Header、Cookie、Query、Body 分类维护跨环境复用的请求参数。',
  },
]

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
  const { editable, environment, onChange, onDelete, globalParameters, effectiveVarMap } = props
  const baseUrls = environment.baseUrls ?? []
  const variables = environment.variables ?? []
  const primaryBaseUrl = baseUrls[0] ?? createEnvironmentBaseUrl()

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
            placeholder="环境名称"
            size="large"
            value={environment.name}
            onChange={(event) => {
              onChange({ ...environment, name: event.target.value })
            }}
          />
        </div>
        <Button danger disabled={!editable} icon={<TrashIcon size={14} />} onClick={onDelete}>
          删除环境
        </Button>
      </div>

      <Input
        allowClear
        addonBefore="Mock Agent"
        disabled={!editable}
        placeholder="Mock Agent URL（如 http://localhost:19876）"
        value={environment.agentUrl ?? ''}
        onChange={(event) => {
          onChange({ ...environment, agentUrl: event.target.value || undefined })
        }}
      />

      <section className="space-y-3">
        <div>
          <Typography.Title level={5}>前置 URL</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">
            环境的基础 URL，用于拼接接口地址。
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
            value={parseBaseUrl(primaryBaseUrl.url).protocol}
            onChange={(protocol) => {
              updatePrimaryUrl(serializeBaseUrl(protocol, parseBaseUrl(primaryBaseUrl.url).host))
            }}
          />
          <Input
            disabled={!editable}
            placeholder="api.example.com"
            value={parseBaseUrl(primaryBaseUrl.url).host}
            onChange={(event) => {
              updatePrimaryUrl(serializeBaseUrl(parseBaseUrl(primaryBaseUrl.url).protocol, event.target.value))
            }}
          />
        </div>
      </section>

      <ValueEditor
        description="环境变量支持远程值和本地值，本地值优先，可用于本地调试覆盖。灰色列为实际生效值（会话变量 > 环境变量 > 全局）。"
        editable={editable}
        effectiveVarMap={effectiveVarMap}
        rows={variables}
        title="环境变量"
        onAdd={() => {
          onChange({ ...environment, variables: [...variables, createEnvironmentValue()] })
        }}
        onChange={(nextRows) => {
          onChange({ ...environment, variables: nextRows })
        }}
      />

      <section className="space-y-3">
        <div>
          <Typography.Title level={5}>环境参数</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">
            按 Header、Cookie、Query、Body 分类维护当前环境的请求参数。同名参数将覆盖全局值。
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
                        全局已设置：
                      </Typography.Text>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {globalSectionRows.map((g) => {
                          const overridden = envNames.has(g.name)
                          const label = g.value ? `${g.name}: ${g.value}` : g.name

                          return (
                            <Tag key={g.id} color={overridden ? 'default' : 'blue'}>
                              {label}
                              {overridden ? ' (已覆盖)' : g.value ? '' : ' (未配置值)'}
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
                添加
              </Button>
            ),
          }}
          onChange={(key) => { setActiveParamSection(key as ApiEnvironmentGlobalParameterSection) }}
        />
      </section>
    </div>
  )
}
