import { useEffect, useMemo, useState } from 'react'

import { Button, Tag, Typography, theme } from 'antd'
import { PlusIcon } from 'lucide-react'

import {
  createEnvironment,
  createEnvironmentValue,
  EMPTY_PROJECT_ENVIRONMENT_CONFIG,
  getPrimaryEnvironmentUrl,
} from '@/project-environment-utils'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import type { ProjectEnvironmentConfig } from '@/types'

import {
  createEnvironmentKey,
  EnvironmentEditor,
  getFallbackSection,
  GLOBAL_SECTION_ITEMS,
  resolveEnvironment,
  type GlobalSectionKey,
  type SectionKey,
} from './EnvironmentPanelParts'
import { GlobalParametersEditor } from './GlobalParametersEditor'
import { ValueEditor } from './ValueEditor'

type ValueSectionKey = Exclude<GlobalSectionKey, 'globalParameters'>

function cloneConfig(config: ProjectEnvironmentConfig) {
  return JSON.parse(JSON.stringify(config)) as ProjectEnvironmentConfig
}

function isValueSectionKey(key: GlobalSectionKey): key is ValueSectionKey {
  return key !== 'globalParameters'
}

function getValueSectionRows(config: ProjectEnvironmentConfig, key: ValueSectionKey) {
  return key === 'globalVariables' ? config.globalVariables : config.vaultSecrets
}

function updateValueSection(
  config: ProjectEnvironmentConfig,
  key: ValueSectionKey,
  rows: ProjectEnvironmentConfig['globalVariables'],
) {
  return key === 'globalVariables'
    ? { ...config, globalVariables: rows }
    : { ...config, vaultSecrets: rows }
}

export function ProjectEnvironmentsPanel(props: { editable: boolean }) {
  const { editable } = props
  const { token } = theme.useToken()
  const { messageApi } = useGlobalContext()
  const { projectEnvironmentConfig, updateProjectEnvironmentConfig } = useMenuHelpersContext()
  const [draftConfig, setDraftConfig] = useState<ProjectEnvironmentConfig>(EMPTY_PROJECT_ENVIRONMENT_CONFIG)
  const [selectedKey, setSelectedKey] = useState<SectionKey>('globalVariables')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraftConfig(cloneConfig(projectEnvironmentConfig))
    setSelectedKey((currentKey) => {
      const currentEnvironment = resolveEnvironment(projectEnvironmentConfig, currentKey)
      return currentEnvironment ? currentKey : getFallbackSection(projectEnvironmentConfig)
    })
  }, [projectEnvironmentConfig])

  const selectedEnvironment = useMemo(() => resolveEnvironment(draftConfig, selectedKey), [draftConfig, selectedKey])
  const selectedGlobalSection = useMemo(() => GLOBAL_SECTION_ITEMS.find(({ key }) => key === selectedKey), [selectedKey])
  const selectedValueSectionKey = useMemo(() => {
    if (!selectedGlobalSection || !isValueSectionKey(selectedGlobalSection.key)) {
      return undefined
    }

    return selectedGlobalSection.key
  }, [selectedGlobalSection])

  return (
    <div
      className="overflow-hidden rounded-2xl border border-solid"
      style={{ borderColor: token.colorBorderSecondary, backgroundColor: token.colorBgContainer }}
    >
      <div
        className="flex items-center justify-between gap-4 px-5 py-4"
        style={{ borderBottom: `1px solid ${token.colorBorderSecondary}`, backgroundColor: token.colorFillQuaternary }}
      >
        <div>
          <Typography.Title level={5}>环境空间</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">
            把全局变量、密钥和项目环境收拢到一个工作区里，避免设置页内再次分裂。
          </Typography.Paragraph>
        </div>
        <Tag color="blue">项目级隔离</Tag>
      </div>

      <div className="grid min-h-[620px]" style={{ gridTemplateColumns: '248px minmax(0,1fr)' }}>
        <aside style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, backgroundColor: token.colorFillTertiary }}>
          <div className="px-4 py-3 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: token.colorTextSecondary }}>
            全局
          </div>
          <div className="space-y-1 px-2">
            {GLOBAL_SECTION_ITEMS.map((item) => (
              <button
                key={item.key}
                className="flex w-full appearance-none items-center gap-2 rounded-lg border-0 px-3 py-2 text-left transition-colors"
                style={{
                  backgroundColor: selectedKey === item.key ? token.colorPrimaryBg : 'transparent',
                  color: selectedKey === item.key ? token.colorPrimary : token.colorText,
                }}
                type="button"
                onClick={() => {
                  setSelectedKey(item.key)
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 px-4 py-3 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: token.colorTextSecondary }}>
            环境
          </div>
          <div className="space-y-1 px-2">
            {draftConfig.environments.map((environment) => {
              const environmentKey = createEnvironmentKey(environment.id)
              const selected = selectedKey === environmentKey

              return (
                <button
                  key={environment.id}
                  className="flex w-full appearance-none items-center gap-3 rounded-xl border-0 px-3 py-2 text-left transition-colors"
                  style={{ backgroundColor: selected ? token.colorPrimaryBg : 'transparent' }}
                  type="button"
                  onClick={() => {
                    setSelectedKey(environmentKey)
                  }}
                >
                  <span
                    className="inline-flex size-6 items-center justify-center rounded-md text-xs font-semibold"
                    style={{ color: selected ? token.colorPrimaryText : token.colorPrimary, backgroundColor: selected ? token.colorPrimary : token.colorPrimaryBg }}
                  >
                    {environment.name.trim().charAt(0) || '环'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{environment.name}</div>
                    <div className="truncate text-xs" style={{ color: token.colorTextSecondary }}>
                      {getPrimaryEnvironmentUrl(environment) || '未配置前置 URL'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="px-2 pb-3 pt-4">
            <Button
              block
              disabled={!editable}
              icon={<PlusIcon size={14} />}
              onClick={() => {
                const nextEnvironment = createEnvironment()
                setDraftConfig((current) => ({ ...current, environments: [...current.environments, nextEnvironment] }))
                setSelectedKey(createEnvironmentKey(nextEnvironment.id))
              }}
            >
              新建环境
            </Button>
          </div>
        </aside>

        <section className="flex flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            {selectedEnvironment
              ? (
                  <EnvironmentEditor
                    editable={editable}
                    environment={selectedEnvironment}
                    globalParameters={draftConfig.globalParameters}
                    onDelete={() => {
                      setDraftConfig((current) => {
                        const nextEnvironments = current.environments.filter(({ id }) => id !== selectedEnvironment.id)
                        const nextConfig = { ...current, environments: nextEnvironments }
                        setSelectedKey(getFallbackSection(nextConfig))
                        return nextConfig
                      })
                    }}
                    onChange={(nextEnvironment) => {
                      setDraftConfig((current) => ({
                        ...current,
                        environments: current.environments.map((item) => {
                          return item.id === nextEnvironment.id ? { ...nextEnvironment, url: getPrimaryEnvironmentUrl(nextEnvironment) } : item
                        }),
                      }))
                    }}
                  />
                )
              : selectedGlobalSection?.key === 'globalParameters'
                ? (
                    <GlobalParametersEditor
                      description={selectedGlobalSection.description}
                      editable={editable}
                      title={selectedGlobalSection.label}
                      value={draftConfig.globalParameters}
                      onChange={(nextValue) => {
                        setDraftConfig((current) => ({ ...current, globalParameters: nextValue }))
                      }}
                    />
                  )
                : selectedGlobalSection && selectedValueSectionKey && (
                    <ValueEditor
                      description={selectedGlobalSection.description}
                      editable={editable}
                      rows={getValueSectionRows(draftConfig, selectedValueSectionKey)}
                      title={selectedGlobalSection.label}
                      onAdd={() => {
                        setDraftConfig((current) => ({
                          ...updateValueSection(current, selectedValueSectionKey, [
                            ...getValueSectionRows(current, selectedValueSectionKey),
                            createEnvironmentValue(),
                          ]),
                        }))
                      }}
                      onChange={(nextRows) => {
                        setDraftConfig((current) => updateValueSection(current, selectedValueSectionKey, nextRows))
                      }}
                    />
                  )}
          </div>

          <div
            className="flex items-center justify-end gap-3 px-6 py-4"
            style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, backgroundColor: token.colorBgLayout }}
          >
            {!editable && <Typography.Text type="secondary">你当前是查看者，不能修改项目环境。</Typography.Text>}
            <Button
              disabled={saving}
              onClick={() => {
                setDraftConfig(cloneConfig(projectEnvironmentConfig))
                setSelectedKey(getFallbackSection(projectEnvironmentConfig))
              }}
            >
              重置
            </Button>
            <Button
              disabled={!editable}
              loading={saving}
              type="primary"
              onClick={() => {
                setSaving(true)
                void updateProjectEnvironmentConfig(draftConfig)
                  .then(() => {
                    messageApi.success('环境配置已保存')
                  })
                  .catch((error) => {
                    messageApi.error(error instanceof Error ? error.message : '保存环境失败')
                  })
                  .finally(() => {
                    setSaving(false)
                  })
              }}
            >
              保存环境
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
