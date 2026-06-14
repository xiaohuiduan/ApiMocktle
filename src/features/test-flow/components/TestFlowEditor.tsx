import { useCallback, useEffect, useState } from 'react'
import { Modal, message, Tabs } from 'antd'
import { invoke } from '@tauri-apps/api/core'
import { Layers, Database, ListTree, History } from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useFlowStore } from '../store/useFlowStore'
import { useFlowPersistence } from '../hooks/useFlowPersistence'
import { FlowEditorContext } from '../contexts/FlowEditorContext'
import { PathHighlightContext } from '../contexts/PathHighlightContext'
import { usePathHighlight } from '../hooks/usePathHighlight'
import { useAuth } from '@/contexts/auth'
import { useTestTaskDetail } from '@/hooks/useTestTask'
import { FlowNodeType as NT, type FlowGraph, type NodeExecStatus } from '../types/flow.types'
import type { VariableSource } from '../hooks/useFlowExecution'
import FlowToolbar from './FlowToolbar'
import NodePalette from './NodePalette'
import VariablesPanel from './VariablesPanel'
import NodeOutlinePanel from './NodeOutlinePanel'
import ExecutionHistoryPanel from './ExecutionHistoryPanel'
import FlowCanvas from './FlowCanvas'
import NodeConfigDrawer from './NodeConfigDrawer'
import ImportFlowModal from './ImportFlowModal'
import RunFlowModal from './RunFlowModal'

// ==================== Props ====================

interface TestFlowEditorProps {
  taskId: string
  projectId: string
}

interface Environment {
  name: string
  baseUrl?: string
  variables?: Record<string, string>
  [key: string]: unknown
}

// ==================== 组件 ====================

export function TestFlowEditor({ taskId, projectId }: TestFlowEditorProps) {
  const { loadFlow, forceSave, isSaving } = useFlowPersistence(taskId)
  const { sessionId } = useAuth()
  const pathHighlight = usePathHighlight()
  const { taskDetail, fetchTaskDetail } = useTestTaskDetail(taskId)

  // Store 状态
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const historyIndex = useFlowStore((s) => s.historyIndex)
  const history = useFlowStore((s) => s.history)
  const isDirty = useFlowStore((s) => s.isDirty)
  const reset = useFlowStore((s) => s.reset)
  const undo = useFlowStore((s) => s.undo)
  const redo = useFlowStore((s) => s.redo)
  const getGraph = useFlowStore((s) => s.getGraph)
  const loadGraph = useFlowStore((s) => s.loadGraph)
  const autoLayout = useFlowStore((s) => s.autoLayout)
  const agentUrl = useFlowStore((s) => s.agentUrl)
  const setAgentUrl = useFlowStore((s) => s.setAgentUrl)

  // 运行状态
  const [isRunning, setIsRunning] = useState(false)
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [variableSources, setVariableSources] = useState<Record<string, VariableSource>>({})

  // 计算撤销/重做可用状态
  const canUndo = historyIndex >= 0
  const canRedo = historyIndex < history.length - 1

  // 获取项目环境列表
  useEffect(() => {
    const fetchEnvs = async () => {
      if (!sessionId) return
      try {
        const result = await invoke<{ ok: boolean; data?: { environments: Environment[] } }>(
          'get_project_environments',
          { sessionId, projectId },
        )
        if (result.ok && result.data) {
          setEnvironments(result.data.environments || [])
        }
      } catch (err) {
        console.error('[TestFlowEditor] Failed to fetch environments:', err)
      }
    }
    fetchEnvs()
  }, [projectId, sessionId])

  // ==================== 校验逻辑 ====================

  const handleValidate = useCallback(() => {
    const currentNodes = useFlowStore.getState().nodes
    const currentEdges = useFlowStore.getState().edges
    const errors: string[] = []
    const warnings: string[] = []

    // 1. 检查起止节点
    const startNodes = currentNodes.filter((n) => n.type === NT.Start)
    const endNodes = currentNodes.filter((n) => n.type === NT.End)
    if (startNodes.length === 0) errors.push('缺少 Start 节点')
    if (startNodes.length > 1) errors.push(`有 ${startNodes.length} 个 Start 节点（应只有 1 个）`)
    if (endNodes.length === 0) errors.push('缺少 End 节点')
    if (endNodes.length > 1) warnings.push(`有 ${endNodes.length} 个 End 节点`)

    // 2. 边引用有效性
    const nodeIds = new Set(currentNodes.map((n) => n.id))
    for (const edge of currentEdges) {
      if (!nodeIds.has(edge.source)) errors.push(`边引用了不存在的源节点: ${edge.source}`)
      if (!nodeIds.has(edge.target)) errors.push(`边引用了不存在的目标节点: ${edge.target}`)
    }

    // 3. 孤立节点检查
    const hasIncoming = new Set(currentEdges.map((e) => e.target))
    const hasOutgoing = new Set(currentEdges.map((e) => e.source))
    for (const node of currentNodes) {
      if (node.type === NT.Start && !hasOutgoing.has(node.id)) {
        warnings.push(`Start 节点「${(node.data?.label as string) || node.id}」没有出边`)
      }
      if (node.type === NT.End && !hasIncoming.has(node.id)) {
        warnings.push(`End 节点「${(node.data?.label as string) || node.id}」没有入边`)
      }
      if (node.type !== NT.Start && node.type !== NT.End) {
        if (!hasIncoming.has(node.id)) {
          warnings.push(`节点「${(node.data?.label as string) || node.id}」没有入边`)
        }
        if (!hasOutgoing.has(node.id)) {
          warnings.push(`节点「${(node.data?.label as string) || node.id}」没有出边`)
        }
      }
    }

    // 4. httpRequest 节点的 menuItemId
    for (const node of currentNodes) {
      if (node.type === NT.HttpRequest && !(node.data?.menuItemId as string)) {
        errors.push(`HTTP 请求节点「${(node.data?.label as string) || node.id}」未选择 API`)
      }
    }

    // 5. 定位到第一个有问题的节点
    const firstProblemNode = currentNodes.find((n) => {
      if (n.type === NT.HttpRequest && !(n.data?.menuItemId as string)) return true
      return false
    })

    // 结果展示
    if (errors.length === 0 && warnings.length === 0) {
      message.success('流程校验通过 ✓')
    } else if (errors.length > 0) {
      Modal.error({
        title: `流程校验失败 (${errors.length} 个错误)`,
        content: (
          <div>
            {errors.map((e, i) => <div key={i} style={{ color: '#ef4444' }}>✗ {e}</div>)}
            {warnings.map((w, i) => <div key={`w${i}`} style={{ color: '#f59e0b' }}>⚠ {w}</div>)}
          </div>
        ),
      })
      if (firstProblemNode) {
        useFlowStore.getState().selectNode(firstProblemNode.id)
      }
    } else {
      Modal.warning({
        title: `校验通过，但有 ${warnings.length} 个警告`,
        content: (
          <div>
            {warnings.map((w, i) => <div key={i} style={{ color: '#f59e0b' }}>⚠ {w}</div>)}
          </div>
        ),
      })
    }
  }, [])

  // ==================== 工具栏回调 ====================

  const handleRun = useCallback(() => {
    setRunModalOpen(true)
  }, [])

  const handleAbort = useCallback(() => {
    setIsRunning(false)
  }, [])

  const handleAutoLayout = useCallback(async () => {
    await autoLayout()
  }, [autoLayout])

  const handleUndo = useCallback(() => {
    undo()
  }, [undo])

  const handleRedo = useCallback(() => {
    redo()
  }, [redo])

  const handleSave = useCallback(async () => {
    await forceSave()
    message.success('已保存')
  }, [forceSave])

  // Ctrl+S 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // 导入弹窗状态
  const [importModalOpen, setImportModalOpen] = useState(false)

  const handleExport = useCallback(() => {
    const graph = getGraph()
    const json = JSON.stringify(graph, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flow-${taskId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [getGraph, taskId])

  const handleImport = useCallback(() => {
    setImportModalOpen(true)
  }, [])

  const handleImportConfirm = useCallback((graph: FlowGraph) => {
    const currentNodes = useFlowStore.getState().nodes
    if (currentNodes.length > 0) {
      Modal.confirm({
        title: '确认覆盖',
        content: '当前画布上已有节点和连线，导入将全部替换。确定继续？',
        okText: '确定导入',
        cancelText: '取消',
        onOk: () => {
          loadGraph(graph)
          setImportModalOpen(false)
        },
      })
    } else {
      loadGraph(graph)
      setImportModalOpen(false)
    }
  }, [loadGraph])

  const handleClear = useCallback(() => {
    reset()
  }, [reset])

  // 节点执行状态更新回调
  const handleNodeStatusChange = useCallback((
    nodeId: string,
    status: NodeExecStatus,
    extra?: {
      execError?: string
      execDurationMs?: number
      execRequest?: Record<string, unknown>
      execResponse?: Record<string, unknown>
    },
  ) => {
    useFlowStore.setState((prev) => ({
      nodes: prev.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                execStatus: status,
                execError: extra?.execError,
                execDurationMs: extra?.execDurationMs,
                execRequest: extra?.execRequest,
                execResponse: extra?.execResponse,
              },
            }
          : n
      ),
    }))
  }, [])

  // 运行完成后保存变量来源
  const handleRunComplete = useCallback((sources: Record<string, VariableSource>) => {
    setVariableSources(sources)
  }, [])

  // 初始加载
  useEffect(() => {
    loadFlow()
    fetchTaskDetail()
  }, [loadFlow, fetchTaskDetail])

  return (
    <FlowEditorContext.Provider value={{ projectId, taskId }}>
    <PathHighlightContext.Provider value={pathHighlight}>
      <div className="flex h-full flex-col" data-testid="test-flow-editor">
        {/* 顶部工具栏 */}
        <FlowToolbar
          taskName={taskDetail?.task?.name}
          onRun={handleRun}
          onAbort={handleAbort}
          onAutoLayout={handleAutoLayout}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSave={handleSave}
          onExport={handleExport}
          onImport={handleImport}
          onValidate={handleValidate}
          onClear={handleClear}
          canUndo={canUndo}
          canRedo={canRedo}
          isRunning={isRunning}
          isDirty={isDirty}
          environments={environments}
          agentUrl={agentUrl}
          onAgentUrlChange={setAgentUrl}
        />

        <div className="flex flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" autoSaveId="test-flow-left-panel">
            {/* 左侧面板：节点 + 变量 Tab */}
            <Panel defaultSize={8} minSize={8} maxSize={40}>
              <div style={{ height: '100%', borderRight: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', flexDirection: 'column' }}>
                <Tabs
                  size="small"
                  defaultActiveKey="nodes"
                  style={{ flex: 1, overflow: 'hidden' }}
                  tabBarStyle={{ margin: 0, paddingLeft: 8, minHeight: 32 }}
                  items={[
                    {
                      key: 'nodes',
                      label: <span style={{ fontSize: 12 }}><Layers size={12} style={{ marginRight: 4 }} />节点</span>,
                      children: <NodePalette />,
                    },
                    {
                      key: 'outline',
                      label: <span style={{ fontSize: 12 }}><ListTree size={12} style={{ marginRight: 4 }} />大纲</span>,
                      children: <NodeOutlinePanel />,
                    },
                    {
                      key: 'variables',
                      label: <span style={{ fontSize: 12 }}><Database size={12} style={{ marginRight: 4 }} />变量</span>,
                      children: (
                        <div style={{ height: 'calc(100vh - 140px)', overflowY: 'auto' }}>
                          <VariablesPanel sources={variableSources} />
                        </div>
                      ),
                    },
                    {
                      key: 'history',
                      label: <span style={{ fontSize: 12 }}><History size={12} style={{ marginRight: 4 }} />历史</span>,
                      children: <ExecutionHistoryPanel taskId={taskId} />,
                    },
                  ]}
                />
              </div>
            </Panel>

            <PanelResizeHandle className="w-px bg-gray-200 hover:bg-blue-400 transition-colors" />

            {/* 中间画布 */}
            <Panel>
              <div className="h-full min-h-0">
                <FlowCanvas />
              </div>
            </Panel>
          </PanelGroup>

          {/* 右侧配置抽屉 */}
          <NodeConfigDrawer />
        </div>
      </div>

      {/* 运行弹窗 */}
      <RunFlowModal
        open={runModalOpen}
        onClose={() => {
          setRunModalOpen(false)
          setIsRunning(false)
        }}
        taskId={taskId}
        nodes={nodes}
        edges={edges}
        projectId={projectId}
        environments={environments}
        onNodeStatusChange={handleNodeStatusChange}
        onRunComplete={handleRunComplete}
      />

      {/* 导入弹窗 */}
      <ImportFlowModal
        open={importModalOpen}
        projectId={projectId}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportConfirm}
      />
    </PathHighlightContext.Provider>
    </FlowEditorContext.Provider>
  )
}
