import { useState, useCallback, useEffect } from 'react'
import { Modal, Tabs, Input, Button, Typography, message, Popconfirm, Spin } from 'antd'
import { CopyOutlined, UploadOutlined, FileTextOutlined } from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FlowGraph } from '../../types/flow.types'
import { useAuth } from '@/contexts/auth'
import { css } from '@emotion/css'

const { Text } = Typography
const { TextArea } = Input

const mdPreviewClass = css`
  background: var(--ds-node-bg-elevated, #f6f8fa);
  border: 1px solid var(--ds-node-border-color, #d0d7de);
  border-radius: 6px;
  padding: var(--ds-pad-lg);
  max-height: 420px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ds-node-text-primary, #1f2937);
  h1, h2, h3, h4 { margin: 16px 0 8px; font-weight: 600; }
  h1 { font-size: 18px; border-bottom: 1px solid var(--ds-divider-color, #e5e7eb); padding-bottom: 6px; }
  h2 { font-size: 15px; }
  h3 { font-size: 13px; }
  h4 { font-size: 12px; }
  p { margin: 6px 0; }
  ul, ol { padding-left: 20px; margin: 6px 0; }
  li { margin: 2px 0; }
  code { background: var(--ds-bg-elevated, #e5e7eb); padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: 'Cascadia Code', 'Fira Code', monospace; }
  pre { background: var(--ds-code-bg, #1e1e1e); color: var(--ds-code-color, #d4d4d4); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
  pre code { background: transparent; padding: 0; color: inherit; }
  blockquote { border-left: 3px solid var(--ds-highlight-selected, #3b82f6); padding-left: 12px; margin: 8px 0; color: var(--ds-node-text-secondary, #4b5563); }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
  th, td { border: 1px solid var(--ds-divider-color, #d1d5db); padding: 4px 8px; text-align: left; }
  th { background: var(--ds-bg-elevated, #f3f4f6); font-weight: 600; }
  hr { border: none; border-top: 1px solid var(--ds-divider-color, #e5e7eb); margin: 12px 0; }
  strong { font-weight: 600; }
`

// ==================== 组件 ====================

interface ImportFlowModalProps {
  open: boolean
  projectId: string
  onClose: () => void
  onImport: (graph: FlowGraph) => void
}

export default function ImportFlowModal({ open, projectId, onClose, onImport }: ImportFlowModalProps) {
  const [jsonText, setJsonText] = useState('')
  const [importing, setImporting] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)
  const { sessionId } = useAuth()

  // 从后端获取 prompt
  useEffect(() => {
    if (!open || !projectId || !sessionId) return
    setPromptLoading(true)
    invoke<{ data: { prompt: string } }>('get_flow_prompt', { sessionId, projectId })
      .then((res) => setPromptText(res.data.prompt))
      .catch((err) => {
        console.error('获取 Prompt 失败:', err)
        setPromptText('获取 Prompt 失败，请重试')
      })
      .finally(() => setPromptLoading(false))
  }, [open, projectId, sessionId])

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(promptText)
      message.success('Prompt 已复制到剪贴板，粘贴给 AI 即可')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }, [promptText])

  const handleImportFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const graph = JSON.parse(event.target?.result as string)
          onImport(graph)
          onClose()
          message.success('导入成功')
        } catch {
          message.error('JSON 解析失败，请检查文件格式')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [onImport, onClose])

  const handleImportJson = useCallback(() => {
    if (!jsonText.trim()) {
      message.warning('请先粘贴 JSON 内容')
      return
    }
    try {
      const graph = JSON.parse(jsonText)
      if (!graph.nodes || !Array.isArray(graph.nodes)) {
        message.error('JSON 缺少 nodes 数组')
        return
      }
      if (!graph.edges || !Array.isArray(graph.edges)) {
        message.error('JSON 缺少 edges 数组')
        return
      }
      setImporting(true)
      onImport(graph)
      onClose()
      message.success('导入成功')
    } catch (err) {
      message.error('JSON 格式错误：' + (err as Error).message)
    } finally {
      setImporting(false)
    }
  }, [jsonText, onImport, onClose])

  const tabItems = [
    {
      key: 'paste',
      label: <span><FileTextOutlined /> 粘贴 JSON</span>,
      children: (
        <div style={{ padding: 'var(--ds-pad-lg) 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            将 AI 生成的 JSON 粘贴到下方，导入后会自动布局
          </Text>
          <TextArea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{ "nodes": [...], "edges": [...] }'
            rows={14}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Popconfirm
              title="确认导入"
              description="导入将覆盖当前画布上的所有节点和连线，确定继续？"
              onConfirm={handleImportJson}
              okText="确定导入"
              cancelText="取消"
              disabled={!jsonText.trim()}
            >
              <Button type="primary" loading={importing} disabled={!jsonText.trim()}>
                导入并覆盖
              </Button>
            </Popconfirm>
          </div>
        </div>
      ),
    },
    {
      key: 'file',
      label: <span><UploadOutlined /> 导入文件</span>,
      children: (
        <div style={{ padding: 'var(--ds-pad-lg) 0', textAlign: 'center' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            选择之前导出的 .json 文件导入
          </Text>
          <Button type="primary" icon={<UploadOutlined />} onClick={handleImportFile} size="large">
            选择 JSON 文件
          </Button>
        </div>
      ),
    },
    {
      key: 'prompt',
      label: <span><CopyOutlined /> AI Prompt</span>,
      children: (
        <div style={{ padding: 'var(--ds-pad-lg) 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            复制下方 Prompt 给 AI，附上你的测试需求，AI 会生成可直接导入的 JSON
          </Text>
          {promptLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载 API 列表..." /></div>
          ) : (
            <div className={mdPreviewClass}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{promptText}</ReactMarkdown>
              <p style={{ color: 'var(--ds-highlight-selected, #3b82f6)', marginTop: 8 }}><strong>[你的测试需求写在这里]</strong></p>
            </div>
          )}
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Button type="primary" icon={<CopyOutlined />} onClick={handleCopyPrompt} disabled={promptLoading || !promptText}>
              复制 Prompt
            </Button>
          </div>
        </div>
      ),
    },
  ]

  return (
    <Modal
      title="导入测试流程"
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <Tabs items={tabItems} defaultActiveKey="prompt" />
    </Modal>
  )
}
