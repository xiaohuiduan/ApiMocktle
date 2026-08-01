import { type Key, useCallback, useEffect, useMemo, useState } from 'react'

import { Alert, Button, Card, Input, Layout, message, Spin, Tree, Typography } from 'antd'
import { BookOpenText, FileJson2, FolderOpen, Globe2, LockKeyhole } from 'lucide-react'

import { ApiDetailView } from './views/ApiDetailView'
import { DocView } from './views/DocView'
import { SchemaView } from './views/SchemaView'
import {
  clearToken,
  getToken,
  parseShareId,
  parseSharePwd,
  setToken,
  shareApi,
  ShareApiError,
  type ShareMenuData,
  type ShareMenuItem,
  type ShareOverview,
} from './api'

const { Header, Sider, Content } = Layout
const { Title, Text } = Typography

interface TreeNode {
  key: string
  title: string
  isLeaf: boolean
  type: string
  children?: TreeNode[]
}

const FOLDER_TYPES = new Set(['apiDetailFolder', 'apiSchemaFolder', 'requestFolder'])

/** 扁平 items → 树（父节点不在范围内时子节点提升为根） */
function buildTree(items: ShareMenuItem[]): TreeNode[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const childrenMap = new Map<string, TreeNode[]>()
  const roots: TreeNode[] = []

  for (const item of items) {
    const node: TreeNode = {
      key: item.id,
      title: item.name,
      isLeaf: !FOLDER_TYPES.has(item.type),
      type: item.type,
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

  const attach = (nodes: TreeNode[]): TreeNode[] => nodes.map((n) => ({
    ...n,
    children: attach(childrenMap.get(n.key) ?? []),
  }))

  return attach(roots)
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'doc') {
    return <BookOpenText className="text-blue-500" size={14} />
  }

  if (type === 'apiSchema') {
    return <FileJson2 className="text-purple-500" size={14} />
  }

  return <Globe2 className="text-green-600" size={14} />
}

function ShareLogin({
  shareId,
  onSuccess,
  initialError,
}: {
  shareId: string
  onSuccess: (menu: ShareMenuData, overview: ShareOverview) => void
  /** 自动登录失败（如带密码链接密码错误）时预置的错误提示 */
  initialError?: string
}) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError ?? '')
  const [messageApi, contextHolder] = message.useMessage()

  const handleLogin = async () => {
    if (!shareId) {
      setError('链接缺少分享 ID')

      return
    }

    if (!password) {
      setError('请输入密码')

      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await shareApi.login(shareId, password)
      setToken(result.token)
      const [menu, overview] = await Promise.all([shareApi.menu(), shareApi.overview()])
      onSuccess(menu, overview)
    }
    catch (e) {
      clearToken()

      if (e instanceof ShareApiError) {
        setError(e.message)
      }
      else {
        messageApi.error('网络异常，请确认分享服务已启动')
      }
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      {contextHolder}
      <Card className="w-96">
        <div className="mb-4 flex flex-col items-center gap-2">
          <LockKeyhole className="text-blue-500" size={36} />
          <Title className="!mb-0" level={4}>接口文档分享</Title>
          <Text type="secondary">该分享已设置密码保护</Text>
        </div>
        <Input.Password
          autoFocus
          placeholder="请输入访问密码"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
          }}
          onPressEnter={() => {
            void handleLogin()
          }}
        />
        {error && <Alert showIcon className="mt-3" message={error} type="error" />}
        <Button
          block
          className="mt-4"
          loading={loading}
          type="primary"
          onClick={() => {
            void handleLogin()
          }}
        >
          进入文档
        </Button>
      </Card>
    </div>
  )
}

export function ShareApp() {
  const [phase, setPhase] = useState<'loading' | 'login' | 'ready'>('loading')
  const [menu, setMenu] = useState<ShareMenuData | null>(null)
  const [overview, setOverview] = useState<ShareOverview | null>(null)
  const [selectedId, setSelectedId] = useState<string>()
  const [detail, setDetail] = useState<ShareMenuItem>()
  const [detailLoading, setDetailLoading] = useState(false)

  const shareId = useMemo(() => parseShareId(), [])
  const [autoLoginError, setAutoLoginError] = useState('')

  const loadMenu = useCallback((info: ShareMenuData, ov: ShareOverview) => {
    setMenu(info)
    setOverview(ov)
    setPhase('ready')
  }, [])

  const autoLogin = useCallback(async (pwd: string, silentOn401 = false) => {
    try {
      const result = await shareApi.login(shareId, pwd)
      setToken(result.token)
      const [info, ov] = await Promise.all([shareApi.menu(), shareApi.overview()])
      loadMenu(info, ov)
    }
    catch (e) {
      clearToken()

      // 静默模式（如无密码分享探测）：401 时不显示错误，直接落到密码页
      if (silentOn401 && e instanceof ShareApiError && e.status === 401) {
        setPhase('login')
      }
      else {
        setAutoLoginError(e instanceof ShareApiError ? e.message : '自动登录失败，请手动输入密码')
        setPhase('login')
      }
    }
  }, [shareId, loadMenu])

  useEffect(() => {
    // 已有 token 则直接尝试恢复会话
    if (!getToken()) {
      const pwd = parseSharePwd()

      if (shareId && pwd) {
        // 带密码链接（?pwd=xxx）：自动填充密码登录
        void autoLogin(pwd)
      }
      else if (shareId) {
        // 无密码参数：尝试空密码（无密码分享自动放行；有密码分享则静默落到密码页）
        void autoLogin('', true)
      }
      else {
        setPhase('login')
      }

      return
    }

    shareApi
      .menu()
      .then(async (info) => {
        // token 属于其他分享链接（URL 切换了分享 ID）→ 会话作废，重新走登录/自动登录
        if (info.shareId !== shareId) {
          clearToken()
          const pwd = parseSharePwd()

          if (shareId && pwd) {
            void autoLogin(pwd)
          }
          else if (shareId) {
            // 无密码参数：尝试空密码（无密码分享自动放行；有密码分享静默落到密码页）
            void autoLogin('', true)
          }
          else {
            setPhase('login')
          }

          return
        }

        const ov = await shareApi.overview()
        loadMenu(info, ov)
      })
      .catch(() => {
        clearToken()
        // token 失效时若链接带 pwd，仍尝试自动登录
        const pwd = parseSharePwd()

        if (shareId && pwd) {
          void autoLogin(pwd)
        }
        else {
          setPhase('login')
        }
      })
  }, [loadMenu, autoLogin, shareId])

  const treeData = useMemo(() => (menu ? buildTree(menu.items) : []), [menu])

  const handleSelect = useCallback(async (keys: Key[]) => {
    const id = keys[0]

    if (typeof id !== 'string') {
      return
    }

    setSelectedId(id)
    setDetailLoading(true)
    setDetail(undefined)

    try {
      const item = await shareApi.item(id)
      setDetail(item)
    }
    catch (e) {
      message.error(e instanceof ShareApiError ? e.message : '加载失败')
    }
    finally {
      setDetailLoading(false)
    }
  }, [])

  const renderDetail = () => {
    if (!detail) {
      return null
    }

    switch (detail.type) {
      case 'doc':
        return <DocView data={detail.data} />

      case 'apiSchema':
        return <SchemaView data={detail.data} />

      case 'apiDetail':
        return <ApiDetailView data={detail.data} />

      default:
        return (
          <pre className="m-4 overflow-auto rounded-md bg-gray-50 p-3 text-xs">
            {JSON.stringify(detail.data, null, 2)}
          </pre>
        )
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  if (phase === 'login') {
    return (
      <ShareLogin
        initialError={autoLoginError}
        shareId={shareId}
        onSuccess={(info, ov) => {
          loadMenu(info, ov)
        }}
      />
    )
  }

  return (
    <Layout className="h-full">
      <Header className="flex items-center gap-3 border-b border-gray-200 bg-white !px-4" style={{ height: 48, lineHeight: '48px' }}>
        <Globe2 className="text-blue-500" size={18} />
        <Title className="!mb-0" level={5}>
          {menu?.project.name ?? menu?.title ?? '接口文档分享'}
        </Title>
        {menu?.title && menu.title !== menu.project.name && (
          <Text className="truncate text-xs" type="secondary">{menu.title}</Text>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          {overview && (
            <>
              <span>接口 {overview.apiCount}</span>
              <span>·</span>
              <span>文档 {overview.docCount}</span>
              <span>·</span>
              <span>模型 {overview.schemaCount}</span>
            </>
          )}
        </div>
      </Header>
      <Layout>
        <Sider className="border-r border-gray-200" theme="light" width={280}>
          <div className="overflow-auto py-2" style={{ height: 'calc(100vh - 48px)' }}>
            <Tree
              blockNode
              defaultExpandAll
              selectedKeys={selectedId ? [selectedId] : []}
              titleRender={(node) => (
                <span className="flex items-center gap-1 text-[13px]">
                  {node.isLeaf
                    ? <TypeIcon type={node.type} />
                    : <FolderOpen className="text-yellow-500" size={14} />}
                  {node.title}
                </span>
              )}
              treeData={treeData}
              onSelect={(keys) => {
                void handleSelect(keys)
              }}
            />
          </div>
        </Sider>
        <Content className="overflow-auto bg-white">
          {detailLoading
            ? (
                <div className="flex h-40 items-center justify-center">
                  <Spin />
                </div>
              )
            : detail
              ? (
                  renderDetail()
                )
              : (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-gray-400">
                    <Globe2 size={32} />
                    <span>从左侧选择接口或文档查看</span>
                  </div>
                )}
        </Content>
      </Layout>
    </Layout>
  )
}
