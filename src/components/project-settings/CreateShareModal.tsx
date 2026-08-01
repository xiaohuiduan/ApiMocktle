import { type Key, useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

  const handleSubmit = async () => {
    if (!projectId) {
      msgApi.error('请选择项目')

      return
    }

    if (!shareAll && checkedKeys.length === 0) {
      msgApi.error('请至少勾选一个内容')

      return
    }

    if (passwordMode === 'set' && !password) {
      msgApi.error('请输入新密码')

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
          msgApi.error(result.error ?? '保存失败')

          return
        }

        msgApi.success('分享链接已更新')
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
          msgApi.error(result.error ?? '创建失败')

          return
        }

        msgApi.success('分享链接已创建')
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
      msgApi.error(isEditing ? '保存失败: ' + String(err) : '创建失败: ' + String(err))
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
    msgApi.success('链接已复制')
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
        cancelText={success ? undefined : '取消'}
        confirmLoading={submitting}
        footer={success
          ? (
              <Button
                type="primary"
                onClick={handleFinish}
              >
                完成
              </Button>
            )
          : undefined}
        okText={isEditing ? '保存' : '创建'}
        open={open}
        title={success ? '分享链接' : isEditing ? '编辑分享链接' : '新建分享链接'}
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
                  message={isEditing ? '分享链接已更新' : '分享链接已创建'}
                  type="success"
                />
                <div>
                  <div className="mb-1 text-sm font-medium">访问链接</div>
                  <div className="flex items-center gap-2">
                    <Typography.Text code className="min-w-0 flex-1 truncate">{plainUrl}</Typography.Text>
                    <Button
                      icon={<Copy size={14} />}
                      size="small"
                      onClick={() => {
                        void handleCopy(plainUrl)
                      }}
                    >
                      复制
                    </Button>
                  </div>
                </div>
                {pwdUrl && (
                  <div>
                    <div className="mb-1 text-sm font-medium">带密码链接（打开即自动填充密码）</div>
                    <div className="flex items-center gap-2">
                      <Typography.Text code className="min-w-0 flex-1 truncate">{pwdUrl}</Typography.Text>
                      <Button
                        icon={<Copy size={14} />}
                        size="small"
                        onClick={() => {
                          void handleCopy(pwdUrl)
                        }}
                      >
                        复制
                      </Button>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">访问密码：{success.password}</div>
                  </div>
                )}
              </div>
            )
          : (
              <Form layout="vertical" size="small">
                {!fixedProjectId && !isEditing && (
                  <Form.Item required label="项目">
                    <Select
                      options={projects.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="选择要分享的项目"
                      value={projectId}
                      onChange={setProjectId}
                    />
                  </Form.Item>
                )}

                <Form.Item label="分享内容">
                  <Checkbox
                    checked={shareAll}
                    onChange={(e) => {
                      setShareAll(e.target.checked)
                    }}
                  >
                    分享项目全部内容
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
                    <div className="mt-1 text-xs text-gray-400">该项目暂无内容</div>
                  )}
                </Form.Item>

                {isEditing
                  ? (
                      <Form.Item label="访问密码">
                        <Radio.Group
                          value={passwordMode}
                          onChange={(e) => {
                            setPasswordMode(e.target.value as 'keep' | 'set' | 'remove')
                          }}
                        >
                          <Radio value="keep">保留原密码</Radio>
                          <Radio value="set">设置新密码</Radio>
                          <Radio value="remove">移除密码</Radio>
                        </Radio.Group>
                        {passwordMode === 'set' && (
                          <Input.Password
                            className="mt-2"
                            placeholder="输入新密码"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value)
                            }}
                          />
                        )}
                        {passwordMode === 'remove' && (
                          <div className="mt-1 text-xs text-orange-500">
                            移除后，任何人打开链接可直接查看，无需密码
                          </div>
                        )}
                      </Form.Item>
                    )
                  : (
                      <Form.Item label="访问密码（可选）">
                        <Input.Password
                          placeholder="留空则不设密码"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)
                          }}
                        />
                        {!password && (
                          <div className="mt-1 text-xs text-orange-500">
                            不设密码：任何人打开链接即可直接查看
                          </div>
                        )}
                      </Form.Item>
                    )}

                <Form.Item label="过期时间（留空为永久有效）">
                  <DatePicker
                    disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
                    value={expiresAt ? dayjs(expiresAt) : undefined}
                    onChange={(d: Dayjs | null) => {
                      setExpiresAt(d ? d.format('YYYY-MM-DD') : undefined)
                    }}
                  />
                </Form.Item>

                <Form.Item
                  extra={<Typography.Text type="secondary">留空默认使用项目名</Typography.Text>}
                  label="分享标题"
                >
                  <Input
                    placeholder="如：订单服务接口文档"
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
