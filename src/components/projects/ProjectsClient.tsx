'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'

import { show } from '@ebay/nice-modal-react'
import { Button, Card, Empty, Form, Input, message, Modal, Space, Spin, theme, Tooltip, Typography } from 'antd'
import { Search, SettingsIcon } from 'lucide-react'

import { ModalSettings } from '@/components/modals/ModalSettings'
import { ParticleCanvas } from '@/components/ParticleCanvas'
import {
  getIconColor,
  ICON_CATEGORIES,
  ICON_CATEGORY_LABEL_KEYS,
  ICON_MAP,
  ICON_OPTIONS,
  kebabToPascal,
  ProjectIcon,
} from '@/components/ProjectIcon'
import {
  ApiRequestError,
  type ProjectItem,
  requestCreateProject,
  requestDeleteProject,
  requestProjects,
  requestUpdateProject,
} from '@/components/projects/project-api'
import { UserMenu } from '@/components/UserMenu'
import { useAuth } from '@/contexts/auth'
import { useProjectTabsContext } from '@/contexts/project-tabs'
import { useDesignStyle } from '@/hooks/useDesignStyle'

import { css } from '@emotion/css'

interface ProjectFormValues {
  name: string
  icon?: string
}

type ProjectDialogState
  = | { mode: 'create' }
    | { mode: 'edit', project: ProjectItem }
    | null

const ALL_CATEGORY_VALUE = '__all__'

function IconPicker({ value, onChange }: { value?: string, onChange?: (val: string) => void }) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<string>(ALL_CATEGORY_VALUE)
  const [searchText, setSearchText] = useState('')

  const categoryLabel = useMemo(() => {
    return (cat: (typeof ICON_CATEGORIES)[number]): string => {
      const key = ICON_CATEGORY_LABEL_KEYS[cat.key]

      return key ? t(key) : cat.key === 'ai' ? 'AI' : cat.key
    }
  }, [t])

  const filteredCategories = useMemo(() => {
    if (!searchText) { return ICON_CATEGORIES }

    const keyword = searchText.toLowerCase()

    return ICON_CATEGORIES.filter((c) => {
      const label = categoryLabel(c).toLowerCase()

      return label.includes(keyword) || c.icons.some((name) => name.toLowerCase().includes(keyword))
    })
  }, [searchText, categoryLabel])

  const shownIcons = useMemo(() => {
    if (category === ALL_CATEGORY_VALUE) { return ICON_OPTIONS }

    const cat = ICON_CATEGORIES.find((c) => c.key === category)

    if (!cat) { return [] }

    return cat.icons
      .map(kebabToPascal)
      .filter((name) => name in ICON_MAP)
  }, [category])

  return (
    <div className="flex gap-3" style={{ minHeight: 300 }}>
      {/* 左侧分类列表 */}
      <div className="flex shrink-0 flex-col" style={{ width: 140 }}>
        <div className="mb-1.5 px-1">
          <Input
            placeholder={t('app.projects.iconPicker.searchPlaceholder')}
            prefix={<Search size={14} style={{ color: 'var(--ds-node-text-muted)' }} />}
            size="small"
            style={{ background: 'var(--ds-bg-elevated)', borderRadius: 6, padding: '0 8px' }}
            value={searchText}
            variant="borderless"
            onChange={(e) => { setSearchText(e.target.value) }}
          />
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-1" style={{ scrollbarWidth: 'thin' }}>
          <button
            style={{
              display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 10px',
              textAlign: 'left', fontSize: 12, transition: 'background 0.15s',
              background: category === ALL_CATEGORY_VALUE ? 'color-mix(in srgb, var(--ds-highlight-selected) 15%, transparent)' : 'transparent',
              color: category === ALL_CATEGORY_VALUE ? 'var(--ds-highlight-selected)' : 'var(--ds-node-text-secondary)',
              fontWeight: category === ALL_CATEGORY_VALUE ? 600 : 400,
              border: 'none', cursor: 'pointer', borderRadius: 4,
            }}
            type="button"
            onClick={() => { setCategory(ALL_CATEGORY_VALUE); setSearchText('') }}
            onMouseEnter={(e) => { if (category !== ALL_CATEGORY_VALUE) { e.currentTarget.style.background = 'var(--ds-bg-elevated)' } }}
            onMouseLeave={(e) => { if (category !== ALL_CATEGORY_VALUE) { e.currentTarget.style.background = 'transparent' } }}
          >
            <span style={{ flex: 1 }}>{t('app.projects.iconPicker.all')}</span>
            <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--ds-node-text-muted)' }}>
              {ICON_OPTIONS.length}
            </span>
          </button>
          {filteredCategories.map((cat) => {
            const availableInMap = category === cat.key
              ? shownIcons.length
              : cat.icons.map(kebabToPascal).filter((n) => n in ICON_MAP).length

            return (
              <button
                key={cat.key}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 10px',
                  textAlign: 'left', fontSize: 12, transition: 'background 0.15s',
                  background: category === cat.key ? 'color-mix(in srgb, var(--ds-highlight-selected) 15%, transparent)' : 'transparent',
                  color: category === cat.key ? 'var(--ds-highlight-selected)' : 'var(--ds-node-text-secondary)',
                  fontWeight: category === cat.key ? 600 : 400,
                  border: 'none', cursor: 'pointer', borderRadius: 4,
                }}
                type="button"
                onClick={() => { setCategory(cat.key) }}
                onMouseEnter={(e) => { if (category !== cat.key) { e.currentTarget.style.background = 'var(--ds-bg-elevated)' } }}
                onMouseLeave={(e) => { if (category !== cat.key) { e.currentTarget.style.background = 'transparent' } }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{categoryLabel(cat)}</span>
                <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--ds-node-text-muted)' }}>
                  {availableInMap}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 右侧图标网格 */}
      <div className="flex-1 rounded-lg p-2.5" style={{ minHeight: 260, maxHeight: 340, background: 'var(--ds-bg-elevated)' }}>
        {shownIcons.length === 0
          ? (
              <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--ds-node-text-muted)' }}>{t('app.projects.iconPicker.empty')}</div>
            )
          : (
              <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                <div className="flex flex-wrap gap-1.5">
                  {shownIcons.map((name) => {
                    const isSelected = value === name
                    const iconColor = getIconColor(name)

                    return (
                      <button
                        key={name}
                        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg border-2 transition-all duration-150 hover:scale-110 hover:shadow-md"
                        style={{
                          borderColor: isSelected ? iconColor : 'transparent',
                          backgroundColor: isSelected ? `${iconColor}0f` : 'var(--ds-node-bg)',
                        }}
                        title={name}
                        type="button"
                        onClick={() => onChange?.(isSelected ? '' : name)}
                      >
                        <ProjectIcon icon={name} size={22} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
      </div>
    </div>
  )
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401
}

export function ProjectsClient() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const { isGlassStyle, isNeumorphism, isSkeuomorphism } = useDesignStyle()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { sessionId } = useAuth()
  const { openProject } = useProjectTabsContext()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [dialog, setDialog] = useState<ProjectDialogState>(() => {
    return searchParams.get('create') === '1' ? { mode: 'create' } : null
  })
  const [form] = Form.useForm<ProjectFormValues>()
  const [messageApi, contextHolder] = message.useMessage()

  const roleText = useMemo<Record<ProjectItem['role'], string>>(
    () => ({
      owner: t('app.projects.role.owner'),
      editor: t('app.projects.role.editor'),
      viewer: t('app.projects.role.viewer'),
    }),
    [t],
  )

  const dialogTitle = dialog?.mode === 'edit' ? t('app.projects.editTitle') : t('app.projects.createTitle')
  const submitErrorTitle = dialog?.mode === 'edit' ? t('app.projects.updateFailed') : t('app.projects.createFailed')

  const fetchProjects = async () => {
    if (!sessionId) { return }

    setLoading(true)

    try {
      setProjects(await requestProjects(sessionId))
    }
    catch (error) {
      if (isUnauthorized(error)) {
        navigate('/login', { replace: true })

        return
      }

      Modal.error({
        title: t('app.projects.loadFailed'),
        content: (error as Error).message,
      })
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchProjects()
  }, [sessionId])

  const closeDialog = () => {
    setDialog(null)
    form.resetFields()
  }

  const openCreateDialog = () => {
    form.resetFields()
    setDialog({ mode: 'create' })
  }

  const openEditDialog = (project: ProjectItem) => {
    form.setFieldsValue({ name: project.name, icon: project.icon })
    setDialog({ mode: 'edit', project })
  }

  const submitProject = async (values: ProjectFormValues) => {
    if (!sessionId) { return }

    setSubmitting(true)

    try {
      if (dialog?.mode === 'edit') {
        await requestUpdateProject(sessionId, dialog.project.id, values)
        closeDialog()
        await fetchProjects()
        messageApi.success(t('app.projects.updated'))

        return
      }

      const project = await requestCreateProject(sessionId, values)

      closeDialog()
      await fetchProjects()
      openProject({
        projectId: project.id,
        name: project.name,
        icon: project.icon,
        role: 'owner',
      })
    }
    catch (error) {
      if (isUnauthorized(error)) {
        navigate('/login', { replace: true })

        return
      }

      Modal.error({
        title: submitErrorTitle,
        content: (error as Error).message,
      })
    }
    finally {
      setSubmitting(false)
    }
  }

  const confirmDeleteProject = (project: ProjectItem) => {
    Modal.confirm({
      title: t('app.projects.deleteConfirmTitle', { name: project.name }),
      content: t('app.projects.deleteConfirmContent'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      maskClosable: true,
      onOk: async () => {
        if (!sessionId) { return }

        try {
          await requestDeleteProject(sessionId, project.id)
          await fetchProjects()
          messageApi.success(t('app.projects.deleted'))
        }
        catch (error) {
          if (isUnauthorized(error)) {
            navigate('/login', { replace: true })

            return
          }

          Modal.error({
            title: t('app.projects.deleteFailed'),
            content: (error as Error).message,
          })
        }
      },
    })
  }

  return (
    <div className="relative" style={{ minHeight: '100%', backgroundColor: token.colorFillTertiary }}>
      <ParticleCanvas preset="projects" primaryColor={token.colorPrimary} variant="embedded" />
      <div className="relative z-10 px-8 py-10">
        {contextHolder}

        <div className="mb-6 flex items-center">
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('app.projects.title')}
          </Typography.Title>

          <Space className="ml-auto">
            <Tooltip title={t('app.shell.globalSettings')}>
              <Button
                icon={<SettingsIcon size={16} />}
                type="text"
                onClick={() => void show(ModalSettings)}
              />
            </Tooltip>
            <UserMenu />
            <Button type="primary" onClick={openCreateDialog}>
              {t('app.projects.create')}
            </Button>
          </Space>
        </div>

        <Spin spinning={loading}>
          {!loading && projects.length === 0
            ? (
                <div className="flex flex-col items-center gap-4 py-20">
                  <Empty description={t('app.projects.empty')} />
                  <Button type="primary" onClick={openCreateDialog}>
                    {t('app.projects.create')}
                  </Button>
                </div>
              )
            : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {projects.map((project, index) => {
                    const iconColor = getIconColor(project.icon ?? '')
                    const IconComp = ICON_MAP[project.icon ?? '']

                    // hover 背景改为纯 CSS（emotion 类，避免 JS 直接改 DOM）
                    const hoverBg = isGlassStyle
                      ? `color-mix(in srgb, ${iconColor} 15%, rgba(255,255,255,0.15))`
                      : `${iconColor}20`

                    const cardHoverClass = css({
                      '&:hover': {
                        backgroundColor: hoverBg,
                      },
                    })

                    const cardBaseStyle: React.CSSProperties = isGlassStyle
                      ? {
                          backgroundColor: `color-mix(in srgb, ${iconColor} 10%, var(--ds-node-bg))`,
                          backdropFilter: 'blur(var(--ds-blur)) saturate(var(--ds-saturate))',
                          WebkitBackdropFilter: 'blur(var(--ds-blur)) saturate(var(--ds-saturate))',
                          border: 'var(--ds-border-subtle)',
                          boxShadow: 'var(--ds-shadow-md)',
                        }
                      : isNeumorphism
                        ? {
                            backgroundColor: token.colorBgContainer,
                            boxShadow: 'var(--ds-shadow-md)',
                            border: 'none',
                          }
                        : isSkeuomorphism
                          ? {
                              backgroundColor: `${iconColor}12`,
                              boxShadow: 'var(--ds-shadow-md)',
                            }
                          : {
                              backgroundColor: `${iconColor}12`,
                            }

                    return (
                      <Card
                        key={project.id}
                        hoverable
                        aria-label={t('app.projects.openAria', { name: project.name })}
                        className={`group ${isNeumorphism ? '' : cardHoverClass}`}
                        role="button"
                        style={{
                          ...cardBaseStyle,
                          transition: 'all 0.2s',
                          // 入场 stagger 动画（与登录卡同款 keyframes）
                          animation: 'card-slide-up 0.4s ease-out both',
                          animationDelay: `${Math.min(index, 8) * 40}ms`,
                          cursor: 'pointer',
                        }}
                        styles={{ body: { padding: '16px' } }}
                        tabIndex={0}
                        onClick={() => {
                          openProject({
                            projectId: project.id,
                            name: project.name,
                            icon: project.icon,
                            role: project.role,
                          })
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openProject({
                              projectId: project.id,
                              name: project.name,
                              icon: project.icon,
                              role: project.role,
                            })
                          }
                        }}
                      >
                        <div className="relative">
                          {/* 水印图标 */}
                          {IconComp && (
                            <div className="pointer-events-none absolute -bottom-2 -right-2 opacity-[0.06]">
                              <IconComp size={90} strokeWidth={0.8} />
                            </div>
                          )}

                          {/* 操作按钮 */}
                          {project.role === 'owner' && (
                            <div
                              className="absolute right-0 top-0 z-10 flex gap-1 opacity-70 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
                              onClick={(event) => { event.stopPropagation() }}
                            >
                              <Button
                                className="!rounded-md"
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openEditDialog(project)
                                }}
                              >
                                {t('common.edit')}
                              </Button>
                              <Button
                                danger
                                className="!rounded-md"
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  confirmDeleteProject(project)
                                }}
                              >
                                {t('common.delete')}
                              </Button>
                            </div>
                          )}

                          {/* 内容区 */}
                          <div className="flex flex-col items-center gap-2 pt-1">
                            <ProjectIcon icon={project.icon} size={36} />
                            <Typography.Title
                              className="!mb-0 !mt-1 truncate text-center"
                              level={5}
                              style={{ maxWidth: '100%' }}
                              title={project.name}
                            >
                              {project.name}
                            </Typography.Title>
                            <Typography.Text className="text-xs" type="secondary">
                              {roleText[project.role]}
                            </Typography.Text>
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ds-node-text-muted)' }}>
                              <span>{t('app.projects.stat.api', { count: project.apiCount })}</span>
                              <span style={{ color: 'var(--ds-divider-color)' }}>|</span>
                              <span>{t('app.projects.stat.schema', { count: project.schemaCount })}</span>
                              <span style={{ color: 'var(--ds-divider-color)' }}>|</span>
                              <span>{t('app.projects.stat.request', { count: project.requestCount })}</span>
                              <span style={{ color: 'var(--ds-divider-color)' }}>|</span>
                              <span>{t('app.projects.stat.test', { count: project.testCount })}</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
        </Spin>

        <Modal
          confirmLoading={submitting}
          open={dialog !== null}
          title={dialogTitle}
          onCancel={closeDialog}
          onOk={() => {
            void form.validateFields().then(submitProject).catch(() => undefined)
          }}
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label={t('app.projects.name')}
              name="name"
              rules={[{ required: true, message: t('app.projects.nameRequired') }]}
            >
              <Input placeholder={t('app.projects.namePlaceholder')} />
            </Form.Item>
            <Form.Item label={t('app.projects.icon')} name="icon">
              <IconPicker />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  )
}
