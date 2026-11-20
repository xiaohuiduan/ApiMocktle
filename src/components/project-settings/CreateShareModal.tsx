import { type Key, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { invoke } from '@tauri-apps/api/core'
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Tree,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { Copy } from 'lucide-react'

import type { ApiMenuData } from '@/components/ApiMenu'
import { type ProjectItem, requestProjects } from '@/components/projects/project-api'
import { useAuth } from '@/contexts/auth'

import { buildShareLinkUrl } from './share-url'

export interface ShareLink {
  id: string
  projectId: string
  projectName?: string
  apiMenuIds: string[]
  hasPassword: boolean
  /** 明文密码（仅桌面端 IPC 返回，用于生成带密码链接） */
  passwordPlain?: string
  expiresAt?: string
  title: string
  createdAt: string
}

interface MenuTreeNode {
  key: string
  title: string
  isLeaf: boolean
  children?: MenuTreeNode[]
}

const FOLDER_TYPES = new Set(['apiDetailFolder', 'apiSchemaFolder', 'requestFolder'])

function buildTree(items: ApiMenuData[]): MenuTreeNode[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const childrenMap = new Map<string, MenuTreeNode[]>()
  const roots: MenuTreeNode[] = []

  for (const item of items) {
    const node: MenuTreeNode = {
      key: item.id,
      title: item.name,
      isLeaf: !FOLDER_TYPES.has(item.type),
    }
    const parentId = item.parentId

    if (parentId && byId.has(parentId)) {
      const list = childrenMap.get(parentId) ?? []
      list.push(node)
      childrenMap.set(parentId, list)
    }
    else {
      roots.push(node)
    }
  }

  const attach = (nodes: MenuTreeNode[]): MenuTreeNode[] => nodes.map((n) => ({
    ...n,
    children: attach(childrenMap.get(n.key) ?? []),
  }))

  return attach(roots)
}

export function CreateShareModal({
  open,
  onClose,
  onCreated,
  fixedProjectId,
  editing,
  baseUrl,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  /** 固定分享项目（项目级面板用）；不传则在弹窗内选择项目 */
  fixedProjectId?: string
  /** 编辑模式：传入链接则预填现状，保存走 update 接口 */
  editing?: ShareLink | null
  /** 服务器访问地址（如 http://192.168.1.5:14204/）；传入时提交成功后展示链接供复制 */
  baseUrl?: string
}) {
  const { t } = useTranslation()
  const { sessionId } = useAuth()
  const [msgApi, contextHolder] = message.useMessage()

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [projectId, setProjectId] = useState<string>()
  const [menuItems, setMenuItems] = useState<ApiMenuData[]>([])
  const [shareAll, setShareAll] = useState(true)
  const [checkedKeys, setCheckedKeys] = useState<Key[]>([])
  const [password, setPassword] = useState('')
  /** 编辑模式密码三态：keep=保留原密码 / set=设置新密码 / remove=移除密码 */
  const [passwordMode, setPasswordMode] = useState<'keep' | 'set' | 'remove'>('keep')
  const [expiresAt, setExpiresAt] = useState<string>()
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  /** 提交成功后的展示态：链接 + 明文密码（仅设密码时） */
  const [success, setSuccess] = useState<{ link: ShareLink, password?: string }>()
  const isEditing = Boolean(editing)
  const initialAppliedRef = useRef(false)

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await requestProjects(sessionId))
    }
    catch {
      // 忽略：面板外已有登录态
    }
  }, [sessionId])

  useEffect(() => {
    if (open) {
      setProjectId(fixedProjectId ?? editing?.projectId)
      setMenuItems([])
      setShareAll(editing ? editing.apiMenuIds.length === 0 : true)
      setCheckedKeys(editing ? editing.apiMenuIds : [])
      setPassword('')
      setPasswordMode('keep')
      setExpiresAt(editing?.expiresAt ?? undefined)
      setTitle(editing?.title ?? '')
      setSuccess(undefined)
      initialAppliedRef.current = false

      if (!fixedProjectId && !editing) {
        void loadProjects()
      }
    }
  }, [open, fixedProjectId, editing, loadProjects])

  useEffect(() => {
    if (!projectId) {
      setMenuItems([])

      return
    }

    void invoke<{ ok: boolean, data?: { menuItems: ApiMenuData[] } }>('list_menu_items', {
      sessionId,
      projectId,
    }).then((result) => {
      if (result.ok && result.data) {
        setMenuItems(result.data.menuItems)

        // 编辑模式：用链接已保存的范围初始化勾选（只应用一次，避免覆盖用户操作）
        if (isEditing && editing && !initialAppliedRef.current) {
          initialAppliedRef.current = true

          if (editing.apiMenuIds.length > 0) {
            setShareAll(false)
            setCheckedKeys(editing.apiMenuIds)
          }
        }
        else if (!isEditing) {
          const leafIds = result.data.menuItems
            .filter((i) => !FOLDER_TYPES.has(i.type))
            .map((i) => i.id)
          setCheckedKeys(leafIds)
        }
      }
    })
  }, [projectId, sessionId, isEditing, editing])

  const treeData = useMemo(() => buildTree(menuItems), [menuItems])

  /** 随机生成 6 位密码（英文大小写 + 数字） */
  const genRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let pwd = ''

    for (let i = 0; i < 6; i += 1) {
      pwd += chars[Math.floor(Math.random() * chars.length)]
    }

    setPassword(pwd)
  }

  const handleSubmit = async () => {
    if (!projectId) {
      msgApi.error(t('settings.projectShare.selectProject'))

      return
    }

    if (!shareAll && checkedKeys.length === 0) {
      msgApi.error(t('settings.projectShare.selectAtLeastOne'))

      return
    }

    if (passwordMode === 'set' && !password) {
      msgApi.error(t('settings.projectShare.passwordRequired'))

      return
    }

    setSubmitting(true)

    try {
      const basePayload = {
        apiMenuIds: shareAll ? [] : checkedKeys.map(String),
        expiresAt: expiresAt ?? null,
        title: title || undefined,
      }

      let created: ShareLink | undefined
      let createdPassword: string | undefined

      if (isEditing && editing) {
        const result = await invoke<{ ok: boolean, data?: ShareLink, error?: string }>('update_share_link', {
          sessionId,
          id: editing.id,
          payload: {
            ...basePayload,
            password: passwordMode === 'set' ? password : undefined,
            removePassword: passwordMode === 'remove',
          },
        })

        if (!result.ok) {
          msgApi.error(result.error ?? t('settings.projectShare.saveFailed'))

          return
        }

        msgApi.success(t('settings.projectShare.updated'))
        created = result.data
        createdPassword = passwordMode === 'set' ? password : undefined
      }
      else {
        const result = await invoke<{ ok: boolean, data?: ShareLink, error?: string }>('create_share_link', {
          sessionId,
          payload: {
            projectId,
            ...basePayload,
            password,
          },
        })

        if (!result.ok) {
          msgApi.error(result.error ?? t('settings.projectShare.createFailed'))

          return
        }

        msgApi.success(t('settings.projectShare.created'))
        created = result.data
        createdPassword = password || undefined
      }

      onCreated()

      // 有可复制的链接地址时展示成功面板，否则直接关闭
      if (baseUrl && created) {
        setSuccess({ link: created, password: createdPassword })
      }
      else {
        onClose()
      }
    }
    catch (err) {
      msgApi.error(isEditing
        ? t('settings.projectShare.saveFailedDetail', { error: String(err) })
        : t('settings.projectShare.createFailedDetail', { error: String(err) }))
    }
    finally {
      setSubmitting(false)
    }
  }

  const handleFinish = () => {
    setSuccess(undefined)
    onClose()
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    msgApi.success(t('settings.shareServer.linkCopied'))
  }

  const plainUrl = success && baseUrl ? buildShareLinkUrl(baseUrl, success.link, false) : ''
  const pwdUrl = success && baseUrl && success.password
    ? buildShareLinkUrl(baseUrl, success.link, true, success.password)
    : ''

  return (
    <ConfigProvider
      theme={{
        components: {
          // 恢复默认弹窗内边距（外层设置弹窗把 padding 设成了 0）
          Modal: {
            paddingMD: 20,
            paddingContentHorizontalLG: 24,
          },
        },
      }}
    >
      <Modal
        cancelText={success ? undefined : t('common.cancel')}
        confirmLoading={submitting}
        footer={success
          ? (
              <Button
                type="primary"
                onClick={handleFinish}
              >
                {t('common.done')}
              </Button>
            )
          : undefined}
        okText={isEditing ? t('common.save') : t('settings.action.create')}
        open={open}
        title={success
          ? t('settings.projectShare.successTitle')
          : isEditing ? t('settings.projectShare.editTitle') : t('settings.projectShare.createTitle')}
        width={560}
        onCancel={onClose}
        onOk={() => {
          void handleSubmit()
        }}
      >
        {contextHolder}
        {success
          ? (
              <div className="space-y-3">
                <Alert
                  showIcon
                  message={isEditing ? t('settings.projectShare.updated') : t('settings.projectShare.created')}
                  type="success"
                />
                <div>
                  <div className="mb-1 text-sm font-medium">{t('settings.projectShare.accessUrl')}</div>
                  <div className="flex items-center gap-2">
                    <Typography.Text code className="min-w-0 flex-1 truncate">{plainUrl}</Typography.Text>
                    <Button
                      icon={<Copy size={14} />}
                      size="small"
                      onClick={() => {
                        void handleCopy(plainUrl)
                      }}
                    >
                      {t('common.copy')}
                    </Button>
                  </div>
                </div>
                {pwdUrl && (
                  <div>
                    <div className="mb-1 text-sm font-medium">{t('settings.projectShare.pwdUrl')}</div>
                    <div className="flex items-center gap-2">
                      <Typography.Text code className="min-w-0 flex-1 truncate">{pwdUrl}</Typography.Text>
                      <Button
                        icon={<Copy size={14} />}
                        size="small"
                        onClick={() => {
                          void handleCopy(pwdUrl)
                        }}
                      >
                        {t('common.copy')}
                      </Button>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {t('settings.projectShare.accessPassword', { password: success.password })}
                    </div>
                  </div>
                )}
              </div>
            )
          : (
              <Form layout="vertical" size="small">
                {!fixedProjectId && !isEditing && (
                  <Form.Item required label={t('settings.projectShare.project')}>
                    <Select
                      options={projects.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder={t('settings.projectShare.selectProjectPlaceholder')}
                      value={projectId}
                      onChange={setProjectId}
                    />
                  </Form.Item>
                )}

                <Form.Item label={t('settings.projectShare.shareContent')}>
                  <Checkbox
                    checked={shareAll}
                    onChange={(e) => {
                      setShareAll(e.target.checked)
                    }}
                  >
                    {t('settings.projectShare.shareAllContent')}
                  </Checkbox>
                  {!shareAll && menuItems.length > 0 && (
                    <div className="mt-2 max-h-56 overflow-auto rounded-md border border-gray-200 p-2">
                      <Tree
                        checkable
                        defaultExpandAll
                        checkedKeys={checkedKeys}
                        selectable={false}
                        treeData={treeData}
                        onCheck={(keys) => {
                          setCheckedKeys(Array.isArray(keys) ? keys : keys.checked)
                        }}
                      />
                    </div>
                  )}
                  {!shareAll && menuItems.length === 0 && (
                    <div className="mt-1 text-xs text-gray-400">{t('settings.projectShare.projectEmpty')}</div>
                  )}
                </Form.Item>

                {isEditing
                  ? (
                      <Form.Item label={t('settings.projectShare.accessPasswordLabel')}>
                        <Radio.Group
                          value={passwordMode}
                          onChange={(e) => {
                            setPasswordMode(e.target.value as 'keep' | 'set' | 'remove')
                          }}
                        >
                          <Radio value="keep">{t('settings.projectShare.keepPassword')}</Radio>
                          <Radio value="set">{t('settings.projectShare.setPassword')}</Radio>
                          <Radio value="remove">{t('settings.projectShare.removePassword')}</Radio>
                        </Radio.Group>
                        {passwordMode === 'set' && (
                          <Input.Password
                            addonAfter={(
                              <Button
                                size="small"
                                type="text"
                                onClick={genRandomPassword}
                              >
                                {t('settings.projectShare.random')}
                              </Button>
                            )}
                            className="mt-2"
                            placeholder={t('settings.projectShare.newPasswordPlaceholder')}
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value)
                            }}
                          />
                        )}
                        {passwordMode === 'remove' && (
                          <div className="mt-1 text-xs text-orange-500">
                            {t('settings.projectShare.removePasswordHint')}
                          </div>
                        )}
                      </Form.Item>
                    )
                  : (
                      <Form.Item label={t('settings.projectShare.accessPasswordOptional')}>
                        <Input.Password
                          addonAfter={(
                            <Button
                              size="small"
                              type="text"
                              onClick={genRandomPassword}
                            >
                              {t('settings.projectShare.random')}
                            </Button>
                          )}
                          placeholder={t('settings.projectShare.passwordPlaceholder')}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)
                          }}
                        />
                        {!password && (
                          <div className="mt-1 text-xs text-orange-500">
                            {t('settings.projectShare.noPasswordHint')}
                          </div>
                        )}
                      </Form.Item>
                    )}

                <Form.Item label={t('settings.projectShare.expiresAtLabel')}>
                  <DatePicker
                    disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
                    value={expiresAt ? dayjs(expiresAt) : undefined}
                    onChange={(d: Dayjs | null) => {
                      setExpiresAt(d ? d.format('YYYY-MM-DD') : undefined)
                    }}
                  />
                </Form.Item>

                <Form.Item
                  extra={<Typography.Text type="secondary">{t('settings.projectShare.titleHint')}</Typography.Text>}
                  label={t('settings.projectShare.shareTitle')}
                >
                  <Input
                    placeholder={t('settings.projectShare.shareTitlePlaceholder')}
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value)
                    }}
                  />
                </Form.Item>
              </Form>
            )}
      </Modal>
    </ConfigProvider>
  )
}
