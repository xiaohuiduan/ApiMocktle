import { useCallback, useEffect, useState } from 'react'
import { Modal, message } from 'antd'
import { invoke } from '@tauri-apps/api/core'
import { useFlowStore } from '../store/useFlowStore'
import { useFlowPersistence } from '../hooks/useFlowPersistence'
import { FlowEditorContext } from '../contexts/FlowEditorContext'
import { useAuth } from '@/contexts/auth'
import type { FlowGraph, NodeExecStatus } from '../types/flow.types'
import FlowToolbar from './FlowToolbar'
import NodePalette from './NodePalette'
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

  // 运行状态
  const [isRunning, setIsRunning] = useState(false)
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [environments, setEnvironments] = useState<Environment[]>([])

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

  // ==================== 工具栏回调 ====================

  const handleRun = useCallback(() => {
    setRunModalOpen(true)
  }, [])

  const handleAbort = useCallback(() => {
    setIsRunning(false)
  }, [])

  const handleAutoLayout = useCallback(() => {
    autoLayout()
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

  // 初始加载
  useEffect(() => {
    loadFlow()
  }, [loadFlow])

  return (
    <FlowEditorContext.Provider value={{ projectId, taskId }}>
      <div className="flex h-full flex-col" data-testid="test-flow-editor">
        {/* 顶部工具栏 */}
        <FlowToolbar
          onRun={handleRun}
          onAbort={handleAbort}
          onAutoLayout={handleAutoLayout}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSave={handleSave}
          onExport={handleExport}
          onImport={handleImport}
          onClear={handleClear}
          canUndo={canUndo}
          canRedo={canRedo}
          isRunning={isRunning}
          isDirty={isDirty}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧节点面板 */}
          <NodePalette />

          {/* 中间画布 */}
          <div className="flex-1 h-full min-h-0">
            <FlowCanvas />
          </div>

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
        nodes={nodes}
        edges={edges}
        projectId={projectId}
        environments={environments}
        onNodeStatusChange={handleNodeStatusChange}
      />

      {/* 导入弹窗 */}
      <ImportFlowModal
        open={importModalOpen}
        projectId={projectId}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportConfirm}
      />
    </FlowEditorContext.Provider>
  )
}
