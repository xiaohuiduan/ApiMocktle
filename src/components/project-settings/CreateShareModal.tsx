import { type Key, useCallback, useEffect, useMemo, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import {
  Checkbox,
  DatePicker,
  Form,
  Input,
  message,
  Modal,
  Select,
  Tree,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'

import type { ApiMenuData } from '@/components/ApiMenu'
import { type ProjectItem, requestProjects } from '@/components/projects/project-api'
import { useAuth } from '@/contexts/auth'

export interface ShareLink {
  id: string
  projectId: string
  projectName?: string
  apiMenuIds: string[]
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
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  /** 固定分享项目（项目级面板用）；不传则在弹窗内选择项目 */
  fixedProjectId?: string
}) {
  const { sessionId } = useAuth()
  const [msgApi, contextHolder] = message.useMessage()

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [projectId, setProjectId] = useState<string>()
  const [menuItems, setMenuItems] = useState<ApiMenuData[]>([])
  const [shareAll, setShareAll] = useState(true)
  const [checkedKeys, setCheckedKeys] = useState<Key[]>([])
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState<string>()
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

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
      setProjectId(fixedProjectId)
      setMenuItems([])
      setShareAll(true)
      setCheckedKeys([])
      setPassword('')
      setExpiresAt(undefined)
      setTitle('')

      if (!fixedProjectId) {
        void loadProjects()
      }
    }
  }, [open, fixedProjectId, loadProjects])

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
        const leafIds = result.data.menuItems
          .filter((i) => !FOLDER_TYPES.has(i.type))
          .map((i) => i.id)
        setCheckedKeys(leafIds)
      }
    })
  }, [projectId, sessionId])

  const treeData = useMemo(() => buildTree(menuItems), [menuItems])

  const handleCreate = async () => {
    if (!projectId) {
      msgApi.error('请选择项目')

      return
    }

    if (!shareAll && checkedKeys.length === 0) {
      msgApi.error('请至少勾选一个内容')

      return
    }

    if (!password) {
      msgApi.error('请设置访问密码')

      return
    }

    setCreating(true)

    try {
      const payload = {
        projectId,
        apiMenuIds: shareAll ? [] : checkedKeys.map(String),
        password,
        expiresAt,
        title: title || undefined,
      }
      const result = await invoke<{ ok: boolean, data?: ShareLink, error?: string }>('create_share_link', {
        sessionId,
        payload,
      })

      if (!result.ok) {
        msgApi.error(result.error ?? '创建失败')

        return
      }

      msgApi.success('分享链接已创建')
      onCreated()
      onClose()
    }
    catch (err) {
      msgApi.error('创建失败: ' + String(err))
    }
    finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      cancelText="取消"
      confirmLoading={creating}
      okText="创建"
      open={open}
      title="新建分享链接"
      width={560}
      onCancel={onClose}
      onOk={() => {
        void handleCreate()
      }}
    >
      {contextHolder}
      <Form layout="vertical" size="small">
        {!fixedProjectId && (
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

        <Form.Item required label="访问密码">
          <Input.Password
            placeholder="访客输入此密码才能查看"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
            }}
          />
        </Form.Item>

        <Form.Item label="过期时间（留空为永久有效）">
          <DatePicker
            disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
            value={expiresAt ? dayjs(expiresAt) : undefined}
            onChange={(d: Dayjs | null) => {
              setExpiresAt(d ? d.format('YYYY-MM-DD') : undefined)
            }}
          />
        </Form.Item>

        <Form.Item label="分享标题（可选，默认使用项目名）">
          <Input
            placeholder="如：订单服务接口文档"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
