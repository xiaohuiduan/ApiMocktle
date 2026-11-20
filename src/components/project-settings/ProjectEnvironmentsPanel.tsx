import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Tag, theme, Typography } from 'antd'
import { PlusIcon } from 'lucide-react'

import { useResolvedVarMap } from '@/components/tab-content/api/useResolvedVarMap'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useSessionVariablesContext } from '@/contexts/session-variables'
import { useCtrlSave } from '@/hooks/useCtrlSave'
import {
  createEnvironment,
  createEnvironmentValue,
  EMPTY_PROJECT_ENVIRONMENT_CONFIG,
  getPrimaryEnvironmentUrl,
} from '@/project-environment-utils'
import type { ApiEnvironment, ProjectEnvironmentConfig } from '@/types'

import {
  createEnvironmentKey,
  createGlobalSectionItems,
  EnvironmentEditor,
  getFallbackSection,
  resolveEnvironment,
  type SectionKey,
} from './EnvironmentPanelParts'
import { GlobalParametersEditor } from './GlobalParametersEditor'
import { ValueEditor } from './ValueEditor'

function cloneConfig(config: ProjectEnvironmentConfig) {
  return JSON.parse(JSON.stringify(config)) as ProjectEnvironmentConfig
}

function getValueSectionRows(config: ProjectEnvironmentConfig) {
  return config.globalVariables
}

function updateValueSection(
  config: ProjectEnvironmentConfig,
  rows: ProjectEnvironmentConfig['globalVariables'],
) {
  return { ...config, globalVariables: rows }
}

export function ProjectEnvironmentsPanel(props: { editable: boolean }) {
  const { t } = useTranslation()
  const { editable } = props
  const { token } = theme.useToken()
  const { messageApi, modal } = useGlobalContext()
  const { projectEnvironmentConfig, updateProjectEnvironmentConfig } = useMenuHelpersContext()
  const { sessionVars } = useSessionVariablesContext()
  const [draftConfig, setDraftConfig] = useState<ProjectEnvironmentConfig>(EMPTY_PROJECT_ENVIRONMENT_CONFIG)
  const [selectedKey, setSelectedKey] = useState<SectionKey>('globalVariables')
  const [saving, setSaving] = useState(false)

  // t 作为依赖：语言切换时 t 引用变化，触发左侧分区文案重算
  const globalSectionItems = useMemo(() => createGlobalSectionItems(t), [t])

  const handleEnvSave = () => {
    setSaving(true)
    void updateProjectEnvironmentConfig(draftConfig)
      .then(() => {
        messageApi.success(t('settings.environments.saved'))
      })
      .catch((error: unknown) => {
        messageApi.error(error instanceof Error ? error.message : t('settings.environments.saveFailed'))
      })
      .finally(() => {
        setSaving(false)
      })
  }

  useCtrlSave(handleEnvSave)

  const handleDeleteEnvironment = (environment: ApiEnvironment) => {
    modal.confirm({
      title: t('settings.environments.deleteTitle', {
        name: environment.name.trim() || t('settings.environments.unnamed'),
      }),
      content: t('settings.environments.deleteContent'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        setDraftConfig((current) => {
          const nextEnvironments = current.environments.filter(({ id }) => id !== environment.id)
          const nextConfig = { ...current, environments: nextEnvironments }
          setSelectedKey(getFallbackSection(nextConfig))

          return nextConfig
        })
      },
    })
  }

  useEffect(() => {
    setDraftConfig(cloneConfig(projectEnvironmentConfig))
    setSelectedKey((currentKey) => {
      const currentEnvironment = resolveEnvironment(projectEnvironmentConfig, currentKey)

      return currentEnvironment ? currentKey : getFallbackSection(projectEnvironmentConfig)
    })
  }, [projectEnvironmentConfig])

  const selectedEnvironment = useMemo(() => resolveEnvironment(draftConfig, selectedKey), [draftConfig, selectedKey])
  const selectedGlobalSection = useMemo(
    () => globalSectionItems.find(({ key }) => key === selectedKey),
    [globalSectionItems, selectedKey],
  )

  // 实际生效值映射：会话变量 > 当前环境 > 全局，用于变量面板「实际生效值」预览列
  const { varMap: effectiveVarMap } = useResolvedVarMap({
    globalVariables: draftConfig.globalVariables,
    envVariables: selectedEnvironment?.variables ?? [],
    sessionVars,
  })

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
          <Typography.Title level={5}>{t('settings.environments.title')}</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">
            {t('settings.environments.description')}
          </Typography.Paragraph>
        </div>
        <Tag color="blue">{t('settings.environments.projectIsolation')}</Tag>
      </div>

      <div className="grid min-h-[620px]" style={{ gridTemplateColumns: '248px minmax(0,1fr)' }}>
        <aside style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, backgroundColor: token.colorFillTertiary }}>
          <div className="px-4 py-3 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: token.colorTextSecondary }}>
            {t('settings.environments.globalSection')}
          </div>
          <div className="space-y-1 px-2">
            {globalSectionItems.map((item) => (
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
            {t('settings.environments.environmentSection')}
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
                    {environment.name.trim().charAt(0) || t('settings.environments.avatarFallback')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{environment.name}</div>
                    <div className="truncate text-xs" style={{ color: token.colorTextSecondary }}>
                      {getPrimaryEnvironmentUrl(environment) || t('settings.environments.noBaseUrl')}
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
              {t('settings.environments.newEnvironment')}
            </Button>
          </div>
        </aside>

        <section className="flex flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            {selectedEnvironment
              ? (
                  <EnvironmentEditor
                    editable={editable}
                    effectiveVarMap={effectiveVarMap}
                    environment={selectedEnvironment}
                    globalParameters={draftConfig.globalParameters}
                    onChange={(nextEnvironment) => {
                      setDraftConfig((current) => ({
                        ...current,
                        environments: current.environments.map((item) => {
                          return item.id === nextEnvironment.id ? { ...nextEnvironment, url: getPrimaryEnvironmentUrl(nextEnvironment) } : item
                        }),
                      }))
                    }}
                    onDelete={() => {
                      handleDeleteEnvironment(selectedEnvironment)
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
                : selectedGlobalSection?.key === 'globalVariables' && (
                  <ValueEditor
                    description={selectedGlobalSection.description}
                    editable={editable}
                    effectiveVarMap={effectiveVarMap}
                    rows={getValueSectionRows(draftConfig)}
                    title={selectedGlobalSection.label}
                    onAdd={() => {
                      setDraftConfig((current) => ({
                        ...updateValueSection(current, [
                          ...getValueSectionRows(current),
                          createEnvironmentValue(),
                        ]),
                      }))
                    }}
                    onChange={(nextRows) => {
                      setDraftConfig((current) => updateValueSection(current, nextRows))
                    }}
                  />
                )}
          </div>

          <div
            className="flex items-center justify-end gap-3 px-6 py-4"
            style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, backgroundColor: token.colorBgLayout }}
          >
            {!editable && <Typography.Text type="secondary">{t('settings.environments.viewerHint')}</Typography.Text>}
            <Button
              disabled={saving}
              onClick={() => {
                setDraftConfig(cloneConfig(projectEnvironmentConfig))
                setSelectedKey(getFallbackSection(projectEnvironmentConfig))
              }}
            >
              {t('common.reset')}
            </Button>
            <Button disabled={!editable} loading={saving} type="primary" onClick={handleEnvSave}>{t('settings.environments.save')}</Button>
          </div>
        </section>
      </div>
    </div>
  )
}
