import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  DatePicker,
  Input,
  List,
  Modal,
  Typography,
  message,
} from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
import { Checkbox } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { Tree } from 'antd'
import dayjs from 'dayjs'
import { Share2Icon, Trash2Icon } from 'lucide-react'

import { MenuItemType } from '@/enums'
import type { ApiMenuData } from '@/components/ApiMenu'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'

interface ShareLinkItem {
  id: string
  projectId: string
  creatorUsername: string
  apiMenuIds: string[]
  hasPassword: boolean
  expiresAt: string | null
  title: string
  createdAt: string
}

interface ApiResponse {
  ok: boolean
  data?: { shareLinks?: ShareLinkItem[] }
  error: string | null
}

export function SharePanel({ projectId }: { projectId?: string }) {
  const { menuRawList } = useMenuHelpersContext()
  const [msgApi, contextHolder] = message.useMessage()
  const [shareLinks, setShareLinks] = useState<ShareLinkItem[]>([])
  const [loading, setLoading] = useState(false)

  // 创建分享弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [checkedApiIds, setCheckedApiIds] = useState<Set<string>>(new Set())
  const [shareTitle, setShareTitle] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // 构建 API 接口树
  const apiTreeData = useMemo((): DataNode[] => {
    if (!menuRawList) return []

    const apis = menuRawList.filter((item) => item.type === MenuItemType.ApiDetail)
    const childrenMap = new Map<string, ApiMenuData[]>()
    const topLevel: ApiMenuData[] = []

    for (const api of apis) {
      if (api.parentId) {
        const children = childrenMap.get(api.parentId) ?? []
        children.push(api)
        childrenMap.set(api.parentId, children)
      } else {
        topLevel.push(api)
      }
    }

    function buildNodes(items: ApiMenuData[]): DataNode[] {
      return items.map((item) => ({
        key: item.id,
        title: `${(item.data as { method?: string; path?: string }).method ?? 'GET'} ${(item.data as { path?: string }).path ?? item.name}`,
      }))
    }

    const folders = menuRawList.filter((f) => f.type === MenuItemType.ApiDetailFolder)
    const folderNodes = folders.map((folder) => ({
      key: folder.id,
      title: folder.name,
      selectable: false,
      checkable: false,
      children: buildNodes(childrenMap.get(folder.id) ?? []),
    }))

    return [...folderNodes, ...buildNodes(topLevel)]
  }, [menuRawList])

  const allApiIds = useMemo(() => {
    if (!menuRawList) return []
    return menuRawList.filter((i) => i.type === MenuItemType.ApiDetail).map((i) => i.id)
  }, [menuRawList])

  const isAllChecked = allApiIds.length > 0 && checkedApiIds.size === allApiIds.length
  const isIndeterminate = checkedApiIds.size > 0 && checkedApiIds.size < allApiIds.length

  // 加载分享列表
  const fetchShareLinks = async () => {
    if (!projectId) return

    try {
      setLoading(true)
      const response = await fetch(`/api/v1/projects/${projectId}/share-links`, { credentials: 'include' })
      const payload = await response.json() as ApiResponse

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? '加载分享列表失败')
      }

      setShareLinks(payload.data.shareLinks ?? [])
    } catch (err) {
      msgApi.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchShareLinks()
  }, [projectId])

  // 创建分享
  const handleCreate = async () => {
    if (!projectId) return
    if (checkedApiIds.size === 0) {
      msgApi.error('请至少选择一个接口')
      return
    }

    try {
      setCreating(true)
      const response = await fetch(`/api/v1/projects/${projectId}/share-links`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiMenuIds: Array.from(checkedApiIds),
          password: sharePassword || undefined,
          expiresAt: shareExpiresAt,
          title: shareTitle || undefined,
        }),
      })
      const payload = await response.json() as ApiResponse

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? '创建分享失败')
      }

      const newLinks = payload.data?.shareLinks ?? []
      const oldIds = new Set(shareLinks.map((l) => l.id))
      const createdLink = newLinks.find((l) => !oldIds.has(l.id))

      if (sharePassword && createdLink) {
        setResultShareId(createdLink.id)
        setResultPwd(sharePassword)
      } else {
        msgApi.success('分享链接已创建')
      }

      setCreateModalOpen(false)
      setShareTitle('')
      setSharePassword('')
      setShareExpiresAt(null)
      void fetchShareLinks()
    } catch (err) {
      msgApi.error((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  // 删除分享
  const handleDelete = async (shareId: string) => {
    if (!projectId) return

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/share-links`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId }),
      })
      const payload = await response.json() as ApiResponse

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? '删除失败')
      }

      msgApi.success('已删除')
      void fetchShareLinks()
    } catch (err) {
      msgApi.error((err as Error).message)
    }
  }

  const openCreateModal = () => {
    setCheckedApiIds(new Set(allApiIds))
    setShareTitle('')
    setSharePassword('')
    setShareExpiresAt(null)
    setCreateModalOpen(true)
  }

  const getShareUrl = (shareId: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/share/${shareId}`
    }
    return `/share/${shareId}`
  }

  const [resultShareId, setResultShareId] = useState<string>()
  const [resultPwd, setResultPwd] = useState('')

  const copyShareUrl = (shareId: string, withPwd?: string) => {
    const baseUrl = getShareUrl(shareId)
    const url = withPwd ? `${baseUrl}?pwd=${encodeURIComponent(withPwd)}` : baseUrl
    void navigator.clipboard.writeText(url).then(() => {
      msgApi.success(withPwd ? '已复制带密码的分享链接' : '已复制分享链接')
    })
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {contextHolder}

      <div className="flex items-center justify-between">
        <div>
          <Typography.Text type="secondary">
            创建分享链接，让其他人通过只读页面查看指定接口的文档。支持设置密码保护和过期时间。
          </Typography.Text>
        </div>
        <Button type="primary" icon={<Share2Icon size={14} />} onClick={openCreateModal}>
          创建分享
        </Button>
      </div>

      <List
        loading={loading}
        dataSource={shareLinks}
        locale={{ emptyText: '暂无分享链接' }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button key="copy" size="small" type="link" onClick={() => copyShareUrl(item.id)}>
                复制链接
              </Button>,
              <Button
                key="delete"
                danger
                icon={<Trash2Icon size={12} />}
                size="small"
                type="link"
                onClick={() => handleDelete(item.id)}
              >
                删除
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <span>
                  {item.title || '未命名分享'}
                  {item.hasPassword && <span className="ml-2 text-xs text-orange-500">(有密码)</span>}
                  {item.expiresAt && dayjs(item.expiresAt).isBefore(dayjs()) && (
                    <span className="ml-2 text-xs text-red-500">(已过期)</span>
                  )}
                </span>
              }
              description={
                <span className="text-xs">
                  {item.apiMenuIds.length} 个接口 · 创建者 {item.creatorUsername} · 创建于 {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                  {item.expiresAt && ` · 有效期至 ${dayjs(item.expiresAt).format('YYYY-MM-DD HH:mm')}`}
                </span>
              }
            />
          </List.Item>
        )}
      />

      <Modal
        destroyOnClose
        open={createModalOpen}
        title="创建分享链接"
        width={640}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => void handleCreate()}
        okText="创建"
        confirmLoading={creating}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Typography.Text className="mb-1 block text-sm">分享标题</Typography.Text>
            <Input
              placeholder="可选，为分享链接起个名字"
              value={shareTitle}
              onChange={(e) => setShareTitle(e.target.value)}
            />
          </div>

          <div>
            <Typography.Text className="mb-1 block text-sm">访问密码（可选）</Typography.Text>
            <Input.Password
              placeholder="留空则无需密码"
              value={sharePassword}
              onChange={(e) => setSharePassword(e.target.value)}
            />
          </div>

          <div>
            <Typography.Text className="mb-1 block text-sm">过期时间（可选）</Typography.Text>
            <DatePicker
              className="w-full"
              showTime
              placeholder="留空则永不过期"
              onChange={(_, dateString) => {
                setShareExpiresAt(typeof dateString === 'string' && dateString ? new Date(dateString).toISOString() : null)
              }}
            />
          </div>

          <div>
            <Typography.Text className="mb-2 block text-sm">选择要分享的接口</Typography.Text>
            <div className="mb-2">
              <Checkbox
                checked={isAllChecked}
                indeterminate={isIndeterminate}
                onChange={(e: CheckboxChangeEvent) => {
                  setCheckedApiIds(e.target.checked ? new Set(allApiIds) : new Set())
                }}
              >
                全选 / 取消全选
              </Checkbox>
            </div>
            {apiTreeData.length > 0
              ? (
                  <Tree
                    checkable
                    blockNode
                    checkedKeys={Array.from(checkedApiIds)}
                    defaultExpandAll
                    style={{ maxHeight: 300, overflow: 'auto' }}
                    treeData={apiTreeData}
                    onCheck={(checkedKeys) => {
                      const keys = Array.isArray(checkedKeys)
                        ? checkedKeys
                        : checkedKeys.checked
                      setCheckedApiIds(new Set(keys as string[]))
                    }}
                  />
                )
              : (
                  <Typography.Text type="secondary">暂无接口数据</Typography.Text>
                )}
          </div>
        </div>
      </Modal>

      <Modal
        footer={null}
        open={!!resultShareId}
        title="分享链接已创建"
        width={520}
        onCancel={() => setResultShareId(undefined)}
      >
        <div className="flex flex-col gap-4 py-2">
          <div>
            <Typography.Text className="mb-1 block text-xs" type="secondary">普通链接（需手动输入密码）</Typography.Text>
            <Input.TextArea
              readOnly
              rows={1}
              value={resultShareId ? getShareUrl(resultShareId) : ''}
              styles={{ textarea: { cursor: 'text' } }}
            />
            <Button
              className="mt-1"
              size="small"
              type="link"
              onClick={() => {
                if (resultShareId) copyShareUrl(resultShareId)
              }}
            >
              复制
            </Button>
          </div>
          {resultPwd && (
            <div>
              <Typography.Text className="mb-1 block text-xs" type="secondary">带密码的链接（无需手动输入密码，直接访问）</Typography.Text>
              <Input.TextArea
                readOnly
                rows={1}
                value={resultShareId ? `${getShareUrl(resultShareId)}?pwd=${encodeURIComponent(resultPwd)}` : ''}
                styles={{ textarea: { cursor: 'text' } }}
              />
              <Button
                className="mt-1"
                size="small"
                type="primary"
                onClick={() => {
                  if (resultShareId) copyShareUrl(resultShareId, resultPwd)
                }}
              >
                复制带密码的链接
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
