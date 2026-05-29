import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { invoke } from '@tauri-apps/api/core'
import { Button, Space, Tag, Card, Empty, Spin, message, Modal, Select, Input, Switch, Form, Divider, List, Typography, Progress, Collapse, Tabs, Table, Alert } from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  HistoryOutlined,
  MinusCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons'

import { useTestTaskDetail, useTestExecutions } from '@/hooks/useTestTask'
import { useTestExecution } from '@/hooks/useTestExecution'
import type { TestStep, TestExecution, TestStepResult, TestExecutionDetail, CreateTestStepPayload, TestExtractor, TestAssertion, Parameter } from '@/types'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { MenuItemType } from '@/enums'
import { buildSchemaExample } from '@/components/JsonSchema/schema-normalizer'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'

const { Text } = Typography

interface RequestOverride {
  headers?: { name: string; value: string; enabled?: boolean }[]
  queryParams?: { name: string; value: string; enabled?: boolean }[]
  pathParams?: { name: string; value: string }[]
  bodyType?: 'json' | 'form' | 'raw' | 'none'
  bodyJson?: string
  bodyForm?: { name: string; value: string; enabled?: boolean }[]
  bodyRaw?: string
}

export default function TestTaskDetailPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>()
  const navigate = useNavigate()
  const { taskDetail, loading, fetchTaskDetail, addStep, updateStep, deleteStep, reorderSteps } = useTestTaskDetail(taskId || null)
  const { executions, fetchExecutions, getExecutionDetail, deleteExecution } = useTestExecutions(taskId || null)
  const { progress, executeTask, abort, reset } = useTestExecution()
  const [addStepModalOpen, setAddStepModalOpen] = useState(false)
  const [editStepModalOpen, setEditStepModalOpen] = useState(false)
  const [editingStep, setEditingStep] = useState<TestStep | null>(null)
  const [variablesModalOpen, setVariablesModalOpen] = useState(false)
  const [executionDetailModal, setExecutionDetailModal] = useState<TestExecution | null>(null)
  const [selectedExecutionDetail, setSelectedExecutionDetail] = useState<TestExecutionDetail | null>(null)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [stepDetailModalOpen, setStepDetailModalOpen] = useState(false)
  const [selectedStepDetail, setSelectedStepDetail] = useState<{
    stepName: string
    requestJson?: Record<string, unknown> | null
    responseJson?: Record<string, unknown> | null
    assertionResults?: any[]
    extractorResults?: any[]
    variableDeltas?: Record<string, string>
    errorMessage?: string
    status?: string
    durationMs?: number
  } | null>(null)
  const [variablesForm] = Form.useForm()
  const { menuRawList, projectEnvironments, projectEnvironmentConfig, currentProjectEnvironmentId } = useMenuHelpersContext()

  // 本地菜单项列表（从 MCP 获取，用于在 context 中没有数据时使用）
  const [localMenuItems, setLocalMenuItems] = useState<any[]>([])

  // 任务级变量
  const [taskVariables, setTaskVariables] = useState<{ name: string; value: string; source?: string }[]>([])

  // 待设置的表单值（用于在 Modal 完全打开后设置）
  const [pendingFormValues, setPendingFormValues] = useState<any>(null)

  // 选中的执行环境
  const [selectedEnvId, setSelectedEnvId] = useState<string | undefined>(undefined)

  // 当前选中的API的参数定义
  const [selectedApiParams, setSelectedApiParams] = useState<{
    headers: Parameter[]
    query: Parameter[]
    path: Parameter[]
    body?: { type: string; parameters?: Parameter[]; jsonSchema?: any; rawText?: string }
  } | null>(null)

  // 获取有效的菜单项列表（优先使用 context，否则使用本地获取的）
  const effectiveMenuRawList = menuRawList && menuRawList.length > 0 ? menuRawList : localMenuItems

  // 从 MCP 获取菜单项列表
  useEffect(() => {
    if (projectId && (!menuRawList || menuRawList.length === 0)) {
      invoke('list_menu_items', { projectId })
        .then((result: any) => {
          if (result?.ok && result?.data) {
            setLocalMenuItems(result.data)
          }
        })
        .catch(() => {})
    }
  }, [projectId, menuRawList])

  useEffect(() => {
    if (taskId) {
      fetchTaskDetail()
      fetchExecutions()
    }
  }, [taskId, fetchTaskDetail, fetchExecutions])

  // 点击"详情"打开弹窗
  const openStepDetail = (stepResult: {
    stepName: string
    requestJson?: Record<string, unknown> | null
    responseJson?: Record<string, unknown> | null
    assertionResults?: any[]
    extractorResults?: any[]
    variableDeltas?: Record<string, string>
    errorMessage?: string
    status?: string
    durationMs?: number
  }) => {
    setSelectedStepDetail(stepResult)
    setStepDetailModalOpen(true)
  }

  // 初始化选中的环境：优先使用任务保存的环境，其次项目当前环境，最后第一个环境
  useEffect(() => {
    if (selectedEnvId === undefined && projectEnvironments && projectEnvironments.length > 0) {
      const taskEnvId = taskDetail?.task.environmentId
      const initialId = taskEnvId || currentProjectEnvironmentId || projectEnvironments[0]?.id
      setSelectedEnvId(initialId)
    }
  }, [taskDetail?.task.environmentId, currentProjectEnvironmentId, projectEnvironments, selectedEnvId])

  // 当编辑模态框打开且有待设置的表单值时，延迟设置表单值
  // 使用 setTimeout 确保 Form.List 组件完全挂载后再设置值
  useEffect(() => {
    if (editStepModalOpen && editingStep && pendingFormValues) {
      const timer = setTimeout(() => {
        editForm.setFieldsValue(pendingFormValues)
        setPendingFormValues(null)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [editStepModalOpen, editingStep, pendingFormValues, editForm])

  // 当选择API变化时，加载该API的参数定义
  const handleApiChange = (menuItemId: string, formInstance: typeof form) => {
    const menuItem = effectiveMenuRawList?.find((item: any) => item.id === menuItemId)
    if (menuItem?.data) {
      const data = menuItem.data as any
      const params = {
        headers: data.parameters?.header || [],
        query: data.parameters?.query || [],
        path: data.parameters?.path || [],
        body: data.requestBody,
      }
      setSelectedApiParams(params)

      // 从 JSON Schema 生成示例值
      let bodyJsonExample = ''
      if (params.body?.jsonSchema) {
        const example = buildSchemaExample(params.body.jsonSchema, effectiveMenuRawList)
        bodyJsonExample = JSON.stringify(example, null, 2)
      }

      // 设置默认的请求覆盖值
      const defaultOverride: RequestOverride = {
        headers: params.headers.filter((p: Parameter) => p.enable !== false).map((p: Parameter) => ({
          name: p.name || '',
          value: p.example || '',
          enabled: true,
        })),
        queryParams: params.query.filter((p: Parameter) => p.enable !== false).map((p: Parameter) => ({
          name: p.name || '',
          value: p.example || '',
          enabled: true,
        })),
        pathParams: params.path.map((p: Parameter) => ({
          name: p.name || '',
          value: p.example || '',
        })),
        bodyType: params.body?.type || 'none',
        bodyJson: bodyJsonExample,
        bodyForm: params.body?.parameters?.map((p: Parameter) => ({
          name: p.name || '',
          value: p.example || '',
          enabled: true,
        })) || [],
        bodyRaw: params.body?.rawText || '',
      }
      formInstance.setFieldsValue({ requestOverride: defaultOverride })
    } else {
      setSelectedApiParams(null)
    }
  }

  const handleAddStep = async () => {
    try {
      const values = await form.validateFields()
      const requestOverride = values.requestOverride as RequestOverride

      // 构建 requestOverrideJson
      const overrideJson: any = {}
      if (requestOverride?.headers && requestOverride.headers.length > 0) {
        overrideJson.headers = requestOverride.headers
          .filter((h) => h.enabled !== false)
          .map((h) => ({ name: h.name, value: h.value }))
      }
      if (requestOverride?.queryParams && requestOverride.queryParams.length > 0) {
        overrideJson.queryParams = requestOverride.queryParams
          .filter((q) => q.enabled !== false)
          .map((q) => ({ name: q.name, value: q.value }))
      }
      if (requestOverride?.pathParams && requestOverride.pathParams.length > 0) {
        overrideJson.pathParams = requestOverride.pathParams.map((p) => ({ name: p.name, value: p.value }))
      }
      if (requestOverride?.bodyType === 'json' && requestOverride.bodyJson) {
        overrideJson.body = { type: 'json', json: requestOverride.bodyJson }
      } else if (requestOverride?.bodyType === 'form' && requestOverride.bodyForm && requestOverride.bodyForm.length > 0) {
        overrideJson.body = {
          type: 'form',
          formParams: requestOverride.bodyForm.filter((f) => f.enabled !== false).map((f) => ({ name: f.name, value: f.value })),
        }
      } else if (requestOverride?.bodyType === 'raw' && requestOverride.bodyRaw) {
        overrideJson.body = { type: 'raw', raw: requestOverride.bodyRaw }
      }

      const payload: CreateTestStepPayload = {
        taskId: taskId!,
        menuItemId: values.menuItemId,
        name: values.name || '',
        preScript: values.preScript || undefined,
        postScript: values.postScript || undefined,
        assertions: values.assertions?.length > 0 ? values.assertions : undefined,
        extractors: values.extractors?.length > 0 ? values.extractors : undefined,
        requestOverride: Object.keys(overrideJson).length > 0 ? overrideJson : undefined,
      }
      const step = await addStep(payload)
      if (step) {
        message.success('步骤添加成功')
        setAddStepModalOpen(false)
        form.resetFields()
        setSelectedApiParams(null)
      }
    } catch (err) {
      console.error('Validation failed:', err)
    }
  }

  const handleEditStep = async () => {
    try {
      const values = await editForm.validateFields()
      const requestOverride = values.requestOverride as RequestOverride

      // 构建 requestOverrideJson
      const overrideJson: any = {}
      if (requestOverride?.headers && requestOverride.headers.length > 0) {
        overrideJson.headers = requestOverride.headers
          .filter((h) => h.enabled !== false)
          .map((h) => ({ name: h.name, value: h.value }))
      }
      if (requestOverride?.queryParams && requestOverride.queryParams.length > 0) {
        overrideJson.queryParams = requestOverride.queryParams
          .filter((q) => q.enabled !== false)
          .map((q) => ({ name: q.name, value: q.value }))
      }
      if (requestOverride?.pathParams && requestOverride.pathParams.length > 0) {
        overrideJson.pathParams = requestOverride.pathParams.map((p) => ({ name: p.name, value: p.value }))
      }
      if (requestOverride?.bodyType === 'json' && requestOverride.bodyJson) {
        overrideJson.body = { type: 'json', json: requestOverride.bodyJson }
      } else if (requestOverride?.bodyType === 'form' && requestOverride.bodyForm && requestOverride.bodyForm.length > 0) {
        overrideJson.body = {
          type: 'form',
          formParams: requestOverride.bodyForm.filter((f) => f.enabled !== false).map((f) => ({ name: f.name, value: f.value })),
        }
      } else if (requestOverride?.bodyType === 'raw' && requestOverride.bodyRaw) {
        overrideJson.body = { type: 'raw', raw: requestOverride.bodyRaw }
      }

      if (editingStep) {
        await updateStep(editingStep.id, {
          name: values.name,
          preScript: values.preScript || undefined,
          postScript: values.postScript || undefined,
          assertions: values.assertions?.length > 0 ? values.assertions : undefined,
          extractors: values.extractors?.length > 0 ? values.extractors : undefined,
          requestOverride: Object.keys(overrideJson).length > 0 ? overrideJson : undefined,
        })
        message.success('步骤更新成功')
        setEditStepModalOpen(false)
        editForm.resetFields()
        setEditingStep(null)
        setSelectedApiParams(null)
      }
    } catch (err) {
      console.error('Validation failed:', err)
    }
  }

  const handleDeleteStep = async (stepId: string) => {
    const success = await deleteStep(stepId)
    if (success) {
      message.success('删除成功')
    }
  }

  // 切换环境时持久化到任务
  const handleEnvChange = async (envId: string | undefined) => {
    setSelectedEnvId(envId)
    if (taskId) {
      try {
        await invoke('update_test_task', {
          taskId,
          payload: { environmentId: envId || null },
        })
      } catch { /* ignore */ }
    }
  }

  // 合并环境变量到执行变量
  const getEnvVariables = (): Record<string, string> => {
    const envVars: Record<string, string> = {}
    if (!selectedEnvId || !projectEnvironmentConfig) return envVars
    // 全局变量
    projectEnvironmentConfig.globalVariables?.forEach((v) => {
      if (v.enable !== false && v.value) envVars[v.name] = v.value
    })
    // 当前环境的变量（覆盖全局）
    const currentEnv = projectEnvironments?.find((e) => e.id === selectedEnvId)
    currentEnv?.variables?.forEach((v) => {
      if (v.enable !== false && v.value) envVars[v.name] = v.value
    })
    return envVars
  }

  const handleExecute = async () => {
    if (!taskDetail || !projectId) return

    reset()
    // 将任务变量注入到执行上下文（环境变量优先级低于任务变量）
    const envVars = getEnvVariables()
    const initialVariables: Record<string, string> = { ...envVars }
    taskVariables.forEach((v) => {
      if (v.value) initialVariables[v.name] = v.value
    })

    // 获取当前环境的 baseUrl
    const currentEnv = selectedEnvId
      ? projectEnvironments?.find((e) => e.id === selectedEnvId)
      : undefined
    const baseUrl = currentEnv ? getPrimaryEnvironmentUrl(currentEnv) || undefined : undefined

    const result = await executeTask(
      taskId!,
      projectId,
      taskDetail.steps,
      initialVariables,
      taskDetail.task.failFast,
      envVars,
      baseUrl,
    )

    message[result.status === 'passed' ? 'success' : 'error'](
      `测试${result.status === 'passed' ? '通过' : '失败'}`
    )
  }

  const handleViewExecution = async (execution: TestExecution) => {
    const detail = await getExecutionDetail(execution.id)
    if (detail) {
      setSelectedExecutionDetail(detail)
      setExecutionDetailModal(execution)
    }
  }

  // 保存当前编辑的步骤引用（不依赖状态，避免异步问题）
  const editingStepRef = useRef<TestStep | null>(null)

  const openEditModal = (step: TestStep) => {
    editingStepRef.current = step
    setEditingStep(step)

    // 先加载API参数定义
    const menuItem = effectiveMenuRawList?.find((item: any) => item.id === step.menuItemId)
    if (menuItem?.data) {
      const data = menuItem.data as any
      const params = {
        headers: data.parameters?.header || [],
        query: data.parameters?.query || [],
        path: data.parameters?.path || [],
        body: data.requestBody,
      }
      setSelectedApiParams(params)
    }

    // 转换 requestOverrideJson 为表单期望的格式
    const requestOverride = (step.requestOverrideJson as any) || {}
    const formRequestOverride: RequestOverride = {
      queryParams: requestOverride.queryParams || [],
      headers: requestOverride.headers || [],
      pathParams: requestOverride.pathParams || [],
      bodyType: requestOverride.body?.type || 'none',
      bodyJson: requestOverride.body?.json || '',
      bodyForm: requestOverride.body?.formParams || [],
      bodyRaw: requestOverride.body?.raw || '',
    }

    // 确保 extractors 和 assertions 是数组格式
    const extractors = Array.isArray(step.extractorsJson) ? step.extractorsJson : []
    const assertions = Array.isArray(step.assertionsJson) ? step.assertionsJson :
      (step.assertionsJson ? Object.values(step.assertionsJson) : [])

    // 保存待设置的表单值
    setPendingFormValues({
      menuItemId: step.menuItemId,
      name: step.name,
      preScript: step.preScript || '',
      postScript: step.postScript || '',
      extractors: extractors,
      assertions: assertions,
      requestOverride: formRequestOverride,
    })

    // 打开 Modal
    setEditStepModalOpen(true)
  }

  // 从所有步骤中收集提取器定义的变量
  const extractedVariables = useMemo(() => {
    if (!taskDetail?.steps) return []
    const vars: { name: string; stepName: string; path: string }[] = []
    taskDetail.steps.forEach((step, index) => {
      if (step.extractorsJson) {
        (step.extractorsJson as TestExtractor[]).forEach((ext) => {
          vars.push({
            name: ext.variable,
            stepName: step.name || `步骤 ${index + 1}`,
            path: ext.path || ext.name || ext.type,
          })
        })
      }
    })
    return vars
  }, [taskDetail?.steps])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'failed':
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
      case 'running':
        return <LoadingOutlined style={{ color: '#1890ff' }} />
      case 'skipped':
        return <PauseCircleOutlined style={{ color: '#d9d9d9' }} />
      default:
        return null
    }
  }

  const getExecutionStatusTag = (status: TestExecution['status']) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      passed: { color: 'success', text: '通过' },
      failed: { color: 'error', text: '失败' },
      aborted: { color: 'warning', text: '已中止' },
      error: { color: 'error', text: '错误' },
      running: { color: 'processing', text: '执行中' },
    }
    const { color, text } = statusMap[status] || { color: 'default', text: status }
    return <Tag color={color}>{text}</Tag>
  }

  const renderStepDetailContent = (data: {
    requestJson?: Record<string, unknown> | null
    responseJson?: Record<string, unknown> | null
    assertionResults?: Array<{ passed: boolean; assertion: { type: string; operator: string; expected?: unknown; path?: string }; actual?: unknown; error?: string }>
    extractorResults?: Array<{ success: boolean; extractor: { variable: string; type: string; path?: string }; value?: string; error?: string }>
    variableDeltas?: Record<string, string>
    errorMessage?: string
  }) => {
    const { Text } = Typography
    return (
      <div className="space-y-3 py-2">
        {/* 错误信息 */}
        {data.errorMessage && (
          <Alert
            type="error"
            message="执行错误"
            description={
              <pre className="mt-1 whitespace-pre-wrap text-xs">{data.errorMessage}</pre>
            }
            className="mb-2"
            showIcon
          />
        )}

        {/* HTTP 请求详情 */}
        {data.requestJson ? (
          <div>
            <Text strong>HTTP 请求:</Text>
            <div className="mt-1 rounded bg-gray-50 p-2">
              <div className="flex items-center gap-2 mb-1">
                <Tag color="blue">{(data.requestJson as any).method || 'GET'}</Tag>
                <Text code className="text-xs break-all">{(data.requestJson as any).url || ''}</Text>
              </div>
              {(data.requestJson as any).headers?.length > 0 && (
                <div className="mt-1">
                  <Text type="secondary" className="text-xs">Headers:</Text>
                  <div className="mt-1 space-y-0.5">
                    {((data.requestJson as any).headers as Array<{ name: string; value: string }>).map((h, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <Text code className="text-xs">{h.name}</Text>
                        <Text type="secondary">{h.value}</Text>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(data.requestJson as any).body && (
                <div className="mt-1">
                  <Text type="secondary" className="text-xs">Body:</Text>
                  <pre className="mt-1 rounded bg-gray-100 p-1 text-xs overflow-auto max-h-32">
                    {typeof (data.requestJson as any).body === 'string'
                      ? (data.requestJson as any).body
                      : JSON.stringify((data.requestJson as any).body, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <Text type="secondary">HTTP 请求: 无请求数据</Text>
          </div>
        )}

        {/* HTTP 响应详情 */}
        {data.responseJson ? (
          <div>
            <Text strong>HTTP 响应:</Text>
            <div className="mt-1 rounded bg-gray-50 p-2">
              <div className="flex items-center gap-2 mb-1">
                <Tag color={(data.responseJson as any).status < 400 ? 'green' : 'red'}>
                  {(data.responseJson as any).status || '?'}
                </Tag>
                <Text type="secondary" className="text-xs">
                  耗时: {(data.responseJson as any).responseTime || '?'}ms
                </Text>
              </div>
              {(data.responseJson as any).headers && Object.keys((data.responseJson as any).headers).length > 0 && (
                <div className="mt-1">
                  <Text type="secondary" className="text-xs">Headers:</Text>
                  <div className="mt-1 space-y-0.5">
                    {Object.entries((data.responseJson as any).headers as Record<string, string>).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <Text code className="text-xs">{k}</Text>
                        <Text type="secondary">{v as string}</Text>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(data.responseJson as any).body && (
                <div className="mt-1">
                  <Text type="secondary" className="text-xs">Body:</Text>
                  <pre className="mt-1 rounded bg-gray-100 p-1 text-xs overflow-auto max-h-48">
                    {typeof (data.responseJson as any).body === 'string'
                      ? (data.responseJson as any).body
                      : JSON.stringify((data.responseJson as any).body, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <Text type="secondary">HTTP 响应: 无响应数据</Text>
          </div>
        )}

        {/* 变量变化 */}
        {data.variableDeltas && Object.keys(data.variableDeltas).length > 0 && (
          <div>
            <Text strong>变量变化:</Text>
            <div className="mt-1 space-y-0.5">
              {Object.entries(data.variableDeltas).map(([key, value]) => (
                <div key={key} className="flex gap-2 text-xs">
                  <Tag color="green" className="text-xs">{key}</Tag>
                  <Text code className="text-xs break-all">{value}</Text>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 断言结果 */}
        {data.assertionResults && data.assertionResults.length > 0 && (
          <div>
            <Text strong>断言结果:</Text>
            <div className="mt-1 space-y-1">
              {data.assertionResults.map((ar, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {ar.passed ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                  <Text>{ar.assertion.type} {ar.assertion.operator}</Text>
                  {ar.assertion.expected !== undefined && (
                    <Text type="secondary">期望: {JSON.stringify(ar.assertion.expected)}</Text>
                  )}
                  {ar.actual !== undefined && (
                    <Text type="secondary">实际: {JSON.stringify(ar.actual)}</Text>
                  )}
                  {ar.error && <Text type="danger">{ar.error}</Text>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 数据提取结果 */}
        {data.extractorResults && data.extractorResults.length > 0 && (
          <div>
            <Text strong>数据提取结果:</Text>
            <div className="mt-1 space-y-0.5">
              {data.extractorResults.map((er, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {er.success ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                  <Tag color="blue">{er.extractor.variable}</Tag>
                  <Text code className="break-all">{er.value || er.error || '(空)'}</Text>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // 渲染参数编辑区域
  const renderParamEditor = (formInstance: typeof form, prefix: string[] = []) => {
    return (
      <>
        {/* 请求头 */}
        <Form.Item label="请求头 (Headers)">
          <Form.List name={[...prefix, 'headers']}>
            {(fields, { add, remove }) => (
              <>
                <Table
                  size="small"
                  dataSource={fields}
                  rowKey="key"
                  pagination={false}
                  columns={[
                    {
                      title: '启用',
                      width: 50,
                      render: (_, __, index) => (
                        <Form.Item name={[index, 'enabled']} valuePropName="checked" noStyle initialValue={true}>
                          <Switch size="small" />
                        </Form.Item>
                      ),
                    },
                    {
                      title: '参数名',
                      width: 150,
                      render: (_, __, index) => (
                        <Form.Item name={[index, 'name']} noStyle>
                          <Input size="small" placeholder="Header-Name" />
                        </Form.Item>
                      ),
                    },
                    {
                      title: '值 (支持 {{变量}})',
                      render: (_, __, index) => (
                        <Form.Item name={[index, 'value']} noStyle>
                          <Input size="small" placeholder="值或 {{variable}}" />
                        </Form.Item>
                      ),
                    },
                    {
                      title: '',
                      width: 30,
                      render: (_, __, index) => (
                        <MinusCircleOutlined onClick={() => remove(index)} style={{ color: '#ff4d4f' }} />
                      ),
                    },
                  ]}
                />
                <Button type="dashed" onClick={() => add({ name: '', value: '', enabled: true })} block icon={<PlusOutlined />} size="small" className="mt-2">
                  添加请求头
                </Button>
              </>
            )}
          </Form.List>
        </Form.Item>

        {/* 查询参数 */}
        <Form.Item label="查询参数 (Query)">
          <Form.List name={[...prefix, 'queryParams']}>
            {(fields, { add, remove }) => (
              <>
                <Table
                  size="small"
                  dataSource={fields}
                  rowKey="key"
                  pagination={false}
                  columns={[
                    {
                      title: '启用',
                      width: 50,
                      render: (_, __, index) => (
                        <Form.Item name={[index, 'enabled']} valuePropName="checked" noStyle initialValue={true}>
                          <Switch size="small" />
                        </Form.Item>
                      ),
                    },
                    {
                      title: '参数名',
                      width: 150,
                      render: (_, __, index) => (
                        <Form.Item name={[index, 'name']} noStyle>
                          <Input size="small" placeholder="param_name" />
                        </Form.Item>
                      ),
                    },
                    {
                      title: '值 (支持 {{变量}})',
                      render: (_, __, index) => (
                        <Form.Item name={[index, 'value']} noStyle>
                          <Input size="small" placeholder="值或 {{variable}}" />
                        </Form.Item>
                      ),
                    },
                    {
                      title: '',
                      width: 30,
                      render: (_, __, index) => (
                        <MinusCircleOutlined onClick={() => remove(index)} style={{ color: '#ff4d4f' }} />
                      ),
                    },
                  ]}
                />
                <Button type="dashed" onClick={() => add({ name: '', value: '', enabled: true })} block icon={<PlusOutlined />} size="small" className="mt-2">
                  添加查询参数
                </Button>
              </>
            )}
          </Form.List>
        </Form.Item>

        {/* 路径参数 */}
        {selectedApiParams?.path && selectedApiParams.path.length > 0 && (
          <Form.Item label="路径参数 (Path)">
            <Form.List name={[...prefix, 'pathParams']}>
              {(fields) => (
                <Table
                  size="small"
                  dataSource={fields}
                  rowKey="key"
                  pagination={false}
                  columns={[
                    {
                      title: '参数名',
                      width: 150,
                      render: (_, __, index) => (
                        <Form.Item name={[index, 'name']} noStyle>
                          <Input size="small" disabled />
                        </Form.Item>
                      ),
                    },
                    {
                      title: '值 (支持 {{变量}})',
                      render: (_, __, index) => (
                        <Form.Item name={[index, 'value']} noStyle>
                          <Input size="small" placeholder="值或 {{variable}}" />
                        </Form.Item>
                      ),
                    },
                  ]}
                />
              )}
            </Form.List>
          </Form.Item>
        )}

        {/* 请求体 */}
        <Form.Item label="请求体 (Body)">
          <Form.Item name={[...prefix, 'bodyType']} noStyle>
            <Select size="small" style={{ width: 120, marginBottom: 8 }}>
              <Select.Option value="none">无</Select.Option>
              <Select.Option value="json">JSON</Select.Option>
              <Select.Option value="form">Form</Select.Option>
              <Select.Option value="raw">Raw</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => {
            const prevType = prefix.reduce((obj, key) => obj?.[key], prev)?.bodyType
            const curType = prefix.reduce((obj, key) => obj?.[key], cur)?.bodyType
            return prevType !== curType
          }}>
            {({ getFieldValue }) => {
              const bodyType = prefix.length > 0
                ? getFieldValue([...prefix, 'bodyType'])
                : getFieldValue('bodyType')
              if (bodyType === 'json') {
                return (
                  <Form.Item name={[...prefix, 'bodyJson']} noStyle>
                    <Input.TextArea rows={4} placeholder='{"key": "value"}' />
                  </Form.Item>
                )
              } else if (bodyType === 'form') {
                return (
                  <Form.List name={[...prefix, 'bodyForm']}>
                    {(fields, { add, remove }) => (
                      <>
                        <Table
                          size="small"
                          dataSource={fields}
                          rowKey="key"
                          pagination={false}
                          columns={[
                            {
                              title: '启用',
                              width: 50,
                              render: (_, __, index) => (
                                <Form.Item name={[index, 'enabled']} valuePropName="checked" noStyle initialValue={true}>
                                  <Switch size="small" />
                                </Form.Item>
                              ),
                            },
                            {
                              title: '参数名',
                              width: 150,
                              render: (_, __, index) => (
                                <Form.Item name={[index, 'name']} noStyle>
                                  <Input size="small" placeholder="field_name" />
                                </Form.Item>
                              ),
                            },
                            {
                              title: '值 (支持 {{变量}})',
                              render: (_, __, index) => (
                                <Form.Item name={[index, 'value']} noStyle>
                                  <Input size="small" placeholder="值或 {{variable}}" />
                                </Form.Item>
                              ),
                            },
                            {
                              title: '',
                              width: 30,
                              render: (_, __, index) => (
                                <MinusCircleOutlined onClick={() => remove(index)} style={{ color: '#ff4d4f' }} />
                              ),
                            },
                          ]}
                        />
                        <Button type="dashed" onClick={() => add({ name: '', value: '', enabled: true })} block icon={<PlusOutlined />} size="small" className="mt-2">
                          添加表单字段
                        </Button>
                      </>
                    )}
                  </Form.List>
                )
              } else if (bodyType === 'raw') {
                return (
                  <Form.Item name={[...prefix, 'bodyRaw']} noStyle>
                    <Input.TextArea rows={4} placeholder="原始请求体内容" />
                  </Form.Item>
                )
              }
              return null
            }}
          </Form.Item>
        </Form.Item>
      </>
    )
  }

  // 渲染数据提取器编辑区域
  const renderExtractorsEditor = (formInstance: typeof form, prefix: string[] = []) => {
    return (
      <Form.List name={[...prefix, 'extractors']}>
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }) => (
              <div key={key} className="mb-2 flex items-center gap-2">
                <Form.Item
                  {...restField}
                  name={[name, 'variable']}
                  rules={[{ required: true, message: '变量名' }]}
                  noStyle
                >
                  <Input placeholder="变量名" style={{ width: 120 }} />
                </Form.Item>
                <Text type="secondary">=</Text>
                <Form.Item
                  {...restField}
                  name={[name, 'type']}
                  rules={[{ required: true, message: '类型' }]}
                  noStyle
                >
                  <Select style={{ width: 100 }} placeholder="类型">
                    <Select.Option value="json_path">响应体</Select.Option>
                    <Select.Option value="header">响应头</Select.Option>
                    <Select.Option value="status">状态码</Select.Option>
                  </Select>
                </Form.Item>
                <Text type="secondary">→</Text>
                <Form.Item
                  {...restField}
                  name={[name, 'path']}
                  noStyle
                >
                  <Input placeholder="$.data.token" style={{ flex: 1 }} />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
              </div>
            ))}
            <Button type="dashed" onClick={() => add({ type: 'json_path', variable: '', path: '' })} block icon={<PlusOutlined />} size="small">
              添加提取规则
            </Button>
          </>
        )}
      </Form.List>
    )
  }

  // 渲染断言编辑区域
  const renderAssertionsEditor = (formInstance: typeof form, prefix: string[] = []) => {
    return (
      <Form.List name={[...prefix, 'assertions']}>
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }) => (
              <div key={key} className="mb-2 flex items-center gap-2">
                <Form.Item
                  {...restField}
                  name={[name, 'type']}
                  rules={[{ required: true, message: '类型' }]}
                  noStyle
                >
                  <Select style={{ width: 100 }} placeholder="类型">
                    <Select.Option value="status">状态码</Select.Option>
                    <Select.Option value="json_path">JSON路径</Select.Option>
                    <Select.Option value="header">响应头</Select.Option>
                    <Select.Option value="response_time">响应时间</Select.Option>
                    <Select.Option value="body_contains">Body包含</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  {...restField}
                  name={[name, 'path']}
                  noStyle
                >
                  <Input placeholder="路径 (可选)" style={{ width: 120 }} />
                </Form.Item>
                <Form.Item
                  {...restField}
                  name={[name, 'operator']}
                  rules={[{ required: true, message: '操作符' }]}
                  noStyle
                >
                  <Select style={{ width: 100 }} placeholder="操作符">
                    <Select.Option value="equals">等于</Select.Option>
                    <Select.Option value="not_equals">不等于</Select.Option>
                    <Select.Option value="exists">存在</Select.Option>
                    <Select.Option value="not_exists">不存在</Select.Option>
                    <Select.Option value="contains">包含</Select.Option>
                    <Select.Option value="greater_than">大于</Select.Option>
                    <Select.Option value="less_than">小于</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  {...restField}
                  name={[name, 'expected']}
                  noStyle
                >
                  <Input placeholder="期望值" style={{ width: 100 }} />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
              </div>
            ))}
            <Button type="dashed" onClick={() => add({ type: 'status', operator: 'equals', expected: 200 })} block icon={<PlusOutlined />} size="small">
              添加断言规则
            </Button>
          </>
        )}
      </Form.List>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  if (!taskDetail) {
    return <Empty description="任务不存在" />
  }

  const { task, steps } = taskDetail

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/projects/${projectId}/tests`)}
          >
            返回
          </Button>
          <h1 className="text-2xl font-bold">{task.name}</h1>
          {task.status === 'passed' && <Tag color="success">通过</Tag>}
          {task.status === 'failed' && <Tag color="error">失败</Tag>}
          {task.status === 'running' && <Tag color="processing">执行中</Tag>}
        </Space>
        <Space>
          {projectEnvironments && projectEnvironments.length > 0 && (
            <>
              <Text type="secondary" className="text-xs shrink-0">环境:</Text>
              <Select
                size="small"
                className="min-w-[140px]"
                value={selectedEnvId}
                allowClear
                placeholder="不选择环境"
                options={projectEnvironments.map((env) => ({
                  value: env.id,
                  label: (
                    <span>
                      {env.name}
                      <span className="ml-2 text-xs opacity-50">{getPrimaryEnvironmentUrl(env)}</span>
                    </span>
                  ),
                }))}
                onChange={handleEnvChange}
              />
            </>
          )}
          <Button
            icon={<SettingOutlined />}
            onClick={() => setVariablesModalOpen(true)}
          >
            变量管理
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleExecute}
            disabled={progress.status === 'running' || steps.length === 0}
          >
            执行测试
          </Button>
          {progress.status === 'running' && (
            <Button danger onClick={abort}>
              中止
            </Button>
          )}
        </Space>
      </div>

      {task.description && (
        <Card className="mb-4">
          <Text type="secondary">{task.description}</Text>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Steps List */}
        <Card
          title="测试步骤"
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="small"
              onClick={() => setAddStepModalOpen(true)}
            >
              添加步骤
            </Button>
          }
        >
          {steps.length === 0 ? (
            <Empty description="暂无步骤" image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddStepModalOpen(true)}
              >
                添加第一个步骤
              </Button>
            </Empty>
          ) : (
            <List
              dataSource={steps}
              renderItem={(step, index) => {
                const stepResult = progress.stepResults.find((r) => r.stepId === step.id)
                const hasExtractors = step.extractorsJson && step.extractorsJson.length > 0
                const hasAssertions = step.assertionsJson && (Array.isArray(step.assertionsJson) ? step.assertionsJson.length > 0 : false)
                return (
                  <List.Item
                    actions={[
                      stepResult && (
                        <Button
                          key="detail"
                          type="link"
                          size="small"
                          onClick={() => openStepDetail({
                            stepName: step.name || `步骤 ${index + 1}`,
                            requestJson: stepResult.requestJson,
                            responseJson: stepResult.responseJson,
                            assertionResults: stepResult.assertionResults,
                            extractorResults: stepResult.extractorResults,
                            variableDeltas: stepResult.variableDeltas,
                            errorMessage: stepResult.errorMessage,
                            status: stepResult.status,
                            durationMs: stepResult.durationMs,
                          })}
                        >
                          详情
                        </Button>
                      ),
                      <Button
                        key="edit"
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(step)}
                      />,
                      <Button
                        key="delete"
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteStep(step.id)}
                      />,
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      avatar={
                        stepResult
                          ? getStatusIcon(stepResult.status)
                          : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs">
                              {index + 1}
                            </span>
                          )
                      }
                      title={
                        <Space>
                          <Text strong>{step.name || `步骤 ${index + 1}`}</Text>
                          {!step.enabled && <Tag color="warning">已禁用</Tag>}
                          {hasExtractors && <Tag color="blue">提取器</Tag>}
                          {hasAssertions && <Tag color="purple">断言</Tag>}
                        </Space>
                      }
                      description={
                        <div>
                          <Text type="secondary" className="text-xs">{step.menuItemId}</Text>
                          {stepResult && (
                            <div>
                              <Text type="secondary">
                                耗时: {stepResult.durationMs}ms
                                {stepResult.errorMessage && (
                                  <Text type="danger"> - {stepResult.errorMessage.split('\n')[0]}</Text>
                                )}
                              </Text>
                            </div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )
              }}
            />
          )}
        </Card>

        {/* Execution Progress / History */}
        <Card title="执行状态">
          {progress.status === 'running' ? (
            <div>
              <Progress
                percent={Math.round((progress.currentStepIndex / progress.totalSteps) * 100)}
                status="active"
              />
              <div className="mt-4">
                <Text>
                  正在执行: {progress.currentStepIndex + 1} / {progress.totalSteps}
                </Text>
              </div>
            </div>
          ) : progress.status !== 'idle' ? (
            <div>
              <div className="mb-4">
                <Tag color={progress.status === 'passed' ? 'success' : 'error'} className="text-lg">
                  {progress.status === 'passed' ? '测试通过' : '测试失败'}
                </Tag>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-500">
                    {progress.stepResults.filter((r) => r.status === 'passed').length}
                  </div>
                  <div>通过</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-500">
                    {progress.stepResults.filter((r) => r.status === 'failed' || r.status === 'error').length}
                  </div>
                  <div>失败</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-400">
                    {progress.stepResults.filter((r) => r.status === 'skipped').length}
                  </div>
                  <div>跳过</div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <Text strong>执行历史</Text>
                <Button
                  icon={<HistoryOutlined />}
                  onClick={() => fetchExecutions()}
                >
                  刷新
                </Button>
              </div>
              {executions.length === 0 ? (
                <Empty description="暂无执行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <List
                  dataSource={executions.slice(0, 10)}
                  renderItem={(exec) => (
                    <List.Item
                      actions={[
                        <Button
                          key="detail"
                          type="link"
                          onClick={() => handleViewExecution(exec)}
                        >
                          详情
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            {getExecutionStatusTag(exec.status)}
                            <Text>{new Date(exec.startedAt).toLocaleString()}</Text>
                          </Space>
                        }
                        description={
                          <Space>
                            <Text type="secondary">
                              通过: {exec.passedSteps}/{exec.totalSteps}
                            </Text>
                            <Text type="secondary">
                              耗时: {exec.totalDurationMs}ms
                            </Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Add Step Modal */}
      <Modal
        title="添加测试步骤"
        open={addStepModalOpen}
        onOk={handleAddStep}
        onCancel={() => {
          setAddStepModalOpen(false)
          form.resetFields()
          setSelectedApiParams(null)
        }}
        okText="添加"
        cancelText="取消"
        width={800}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical" className="max-h-[70vh] overflow-y-auto pr-2">
          <Form.Item
            name="menuItemId"
            label="选择接口"
            rules={[{ required: true, message: '请选择接口' }]}
          >
            <Select
              placeholder="请选择接口"
              showSearch
              optionFilterProp="label"
              onChange={(value) => handleApiChange(value, form)}
              options={effectiveMenuRawList
                ?.filter((item: any) => item.type === MenuItemType.ApiDetail || item.type === MenuItemType.HttpRequest)
                .map((item: any) => ({
                  label: `${('method' in (item.data || {}) ? (item.data as any)?.method : 'GET') || 'GET'} ${item.name}`,
                  value: item.id,
                }))}
            />
          </Form.Item>
          <Form.Item name="name" label="步骤名称">
            <Input placeholder="可选，留空则使用接口名称" />
          </Form.Item>

          {/* 请求参数编辑区域 */}
          {selectedApiParams && (
            <>
              <Divider>请求参数</Divider>
              {renderParamEditor(form, ['requestOverride'])}
            </>
          )}

          <Divider>数据提取器</Divider>
          <Text type="secondary" className="mb-2 block text-xs">
            从响应中提取值到变量，后续步骤可通过 {'{{变量名}}'} 引用
          </Text>
          {renderExtractorsEditor(form)}

          <Divider>结构化断言</Divider>
          <Text type="secondary" className="mb-2 block text-xs">
            验证响应是否符合预期，无需编写脚本
          </Text>
          {renderAssertionsEditor(form)}

          <Divider>
            <span className="text-gray-400">脚本 (可选)</span>
          </Divider>
          <Collapse
            ghost
            items={[
              {
                key: 'pre',
                label: '前置脚本',
                children: (
                  <Form.Item name="preScript" noStyle>
                    <Input.TextArea placeholder="JavaScript 代码，在请求发送前执行" rows={3} />
                  </Form.Item>
                ),
              },
              {
                key: 'post',
                label: '后置脚本',
                children: (
                  <Form.Item name="postScript" noStyle>
                    <Input.TextArea placeholder="JavaScript 代码，在响应接收后执行" rows={3} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      {/* Edit Step Modal */}
      <Modal
        title="编辑测试步骤"
        open={editStepModalOpen}
        onOk={handleEditStep}
        onCancel={() => {
          setEditStepModalOpen(false)
          editForm.resetFields()
          setEditingStep(null)
          setSelectedApiParams(null)
          setPendingFormValues(null)
        }}
        okText="保存"
        cancelText="取消"
        width={800}
        style={{ top: 20 }}
      >
        <Form form={editForm} layout="vertical" className="max-h-[70vh] overflow-y-auto pr-2">
          {/* 接口信息（只读） */}
          <div className="mb-4 rounded-lg bg-gray-50 p-3">
            <Text type="secondary" className="text-xs">接口信息</Text>
            <div className="mt-1">
              <Text strong>
                {(() => {
                  if (!editingStep) return '未知接口'
                  const menuItem = effectiveMenuRawList?.find((item: any) => item.id === editingStep.menuItemId)
                  if (!menuItem) return '未知接口'
                  const method = (menuItem.data as any)?.method || 'GET'
                  const path = (menuItem.data as any)?.path || ''
                  return `${method} ${menuItem.name} (${path})`
                })()}
              </Text>
            </div>
          </div>

          <Form.Item name="name" label="步骤名称">
            <Input placeholder="步骤名称" />
          </Form.Item>

          {/* 请求参数编辑区域 */}
          {selectedApiParams && (
            <>
              <Divider>请求参数</Divider>
              {renderParamEditor(editForm, ['requestOverride'])}
            </>
          )}

          <Divider>数据提取器</Divider>
          <Text type="secondary" className="mb-2 block text-xs">
            从响应中提取值到变量，后续步骤可通过 {'{{变量名}}'} 引用
          </Text>
          {renderExtractorsEditor(editForm)}

          <Divider>结构化断言</Divider>
          <Text type="secondary" className="mb-2 block text-xs">
            验证响应是否符合预期，无需编写脚本
          </Text>
          {renderAssertionsEditor(editForm)}

          <Divider>
            <span className="text-gray-400">脚本 (可选)</span>
          </Divider>
          <Collapse
            ghost
            items={[
              {
                key: 'pre',
                label: '前置脚本',
                children: (
                  <Form.Item name="preScript" noStyle>
                    <Input.TextArea placeholder="JavaScript 代码，在请求发送前执行" rows={3} />
                  </Form.Item>
                ),
              },
              {
                key: 'post',
                label: '后置脚本',
                children: (
                  <Form.Item name="postScript" noStyle>
                    <Input.TextArea placeholder="JavaScript 代码，在响应接收后执行" rows={3} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      {/* Variables Management Modal */}
      <Modal
        title="任务变量管理"
        open={variablesModalOpen}
        onCancel={() => setVariablesModalOpen(false)}
        footer={null}
        width={600}
      >
        <div className="mb-4">
          <Text type="secondary">
            定义任务级别的变量，可在所有步骤中通过 {'{{变量名}}'} 引用
          </Text>
        </div>

        {/* 手动定义的变量 */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <Text strong>手动变量</Text>
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setTaskVariables([...taskVariables, { name: '', value: '' }])}
            >
              添加变量
            </Button>
          </div>
          <Table
            size="small"
            dataSource={taskVariables.filter((v) => !v.source)}
            rowKey={(_, index) => String(index)}
            pagination={false}
            columns={[
              {
                title: '变量名',
                dataIndex: 'name',
                render: (text, _, index) => (
                  <Input
                    size="small"
                    value={text}
                    onChange={(e) => {
                      const newVars = [...taskVariables]
                      newVars[index].name = e.target.value
                      setTaskVariables(newVars)
                    }}
                    placeholder="variableName"
                  />
                ),
              },
              {
                title: '值',
                dataIndex: 'value',
                render: (text, _, index) => (
                  <Input
                    size="small"
                    value={text}
                    onChange={(e) => {
                      const newVars = [...taskVariables]
                      newVars[index].value = e.target.value
                      setTaskVariables(newVars)
                    }}
                    placeholder="常量值或 {{其他变量}}"
                  />
                ),
              },
              {
                title: '',
                width: 30,
                render: (_, __, index) => (
                  <MinusCircleOutlined
                    onClick={() => setTaskVariables(taskVariables.filter((_, i) => i !== index))}
                    style={{ color: '#ff4d4f' }}
                  />
                ),
              },
            ]}
          />
        </div>

        {/* 从步骤提取的变量 */}
        {extractedVariables.length > 0 && (
          <div>
            <Text strong className="mb-2 block">从步骤提取的变量</Text>
            <Table
              size="small"
              dataSource={extractedVariables}
              rowKey="name"
              pagination={false}
              columns={[
                { title: '变量名', dataIndex: 'name' },
                { title: '来源步骤', dataIndex: 'stepName' },
                { title: '提取规则', dataIndex: 'path' },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Step Detail Modal */}
      <Modal
        title={
          <Space>
            {selectedStepDetail?.status && getStatusIcon(selectedStepDetail.status)}
            <span>{selectedStepDetail?.stepName || '步骤详情'}</span>
          </Space>
        }
        open={stepDetailModalOpen}
        onCancel={() => {
          setStepDetailModalOpen(false)
          setSelectedStepDetail(null)
        }}
        footer={null}
        width={800}
      >
        {selectedStepDetail && renderStepDetailContent({
          requestJson: selectedStepDetail.requestJson,
          responseJson: selectedStepDetail.responseJson,
          assertionResults: selectedStepDetail.assertionResults,
          extractorResults: selectedStepDetail.extractorResults,
          variableDeltas: selectedStepDetail.variableDeltas,
          errorMessage: selectedStepDetail.errorMessage,
        })}
      </Modal>

      {/* Execution Detail Modal */}
      <Modal
        title="执行详情"
        open={!!executionDetailModal}
        onCancel={() => {
          setExecutionDetailModal(null)
          setSelectedExecutionDetail(null)
        }}
        footer={null}
        width={900}
      >
        {selectedExecutionDetail && (
          <div>
            <div className="mb-4">
              <Space>
                {getExecutionStatusTag(selectedExecutionDetail.execution.status)}
                <Text>
                  {new Date(selectedExecutionDetail.execution.startedAt).toLocaleString()}
                </Text>
                <Text type="secondary">
                  耗时: {selectedExecutionDetail.execution.totalDurationMs}ms
                </Text>
              </Space>
            </div>
            <Collapse>
              {selectedExecutionDetail.stepResults.map((result, index) => (
                <Collapse.Panel
                  key={result.id}
                  header={
                    <Space>
                      {getStatusIcon(result.status)}
                      <Text>步骤 {index + 1}</Text>
                      <Tag>{result.status}</Tag>
                      <Text type="secondary">{result.durationMs}ms</Text>
                    </Space>
                  }
                >
                  {result.errorMessage && (
                    <div className="mb-2">
                      <Text type="danger">{result.errorMessage}</Text>
                    </div>
                  )}

                  {/* HTTP 请求详情 */}
                  {result.requestJson ? (
                    <div className="mb-3">
                      <Text strong>HTTP 请求:</Text>
                      <div className="mt-1 rounded bg-gray-50 p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Tag color="blue">{(result.requestJson as any).method || 'GET'}</Tag>
                          <Text code className="text-xs break-all">{(result.requestJson as any).url || ''}</Text>
                        </div>
                        {(result.requestJson as any).headers?.length > 0 && (
                          <div className="mt-1">
                            <Text type="secondary" className="text-xs">Headers:</Text>
                            <div className="mt-1 space-y-0.5">
                              {((result.requestJson as any).headers as Array<{ name: string; value: string }>).map((h, i) => (
                                <div key={i} className="flex gap-2 text-xs">
                                  <Text code className="text-xs">{h.name}</Text>
                                  <Text type="secondary">{h.value}</Text>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(result.requestJson as any).body && (
                          <div className="mt-1">
                            <Text type="secondary" className="text-xs">Body:</Text>
                            <pre className="mt-1 rounded bg-gray-100 p-1 text-xs overflow-auto max-h-32">
                              {typeof (result.requestJson as any).body === 'string'
                                ? (result.requestJson as any).body
                                : JSON.stringify((result.requestJson as any).body, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <Text type="secondary">HTTP 请求: 无请求数据</Text>
                    </div>
                  )}

                  {/* HTTP 响应详情 */}
                  {result.responseJson ? (
                    <div className="mb-3">
                      <Text strong>HTTP 响应:</Text>
                      <div className="mt-1 rounded bg-gray-50 p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Tag color={(result.responseJson as any).status < 400 ? 'green' : 'red'}>
                            {(result.responseJson as any).status || '?'}
                          </Tag>
                        </div>
                        {(result.responseJson as any).headers && Object.keys((result.responseJson as any).headers).length > 0 && (
                          <div className="mt-1">
                            <Text type="secondary" className="text-xs">Headers:</Text>
                            <div className="mt-1 space-y-0.5">
                              {Object.entries((result.responseJson as any).headers as Record<string, string>).map(([k, v]) => (
                                <div key={k} className="flex gap-2 text-xs">
                                  <Text code className="text-xs">{k}</Text>
                                  <Text type="secondary">{v as string}</Text>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(result.responseJson as any).body && (
                          <div className="mt-1">
                            <Text type="secondary" className="text-xs">Body:</Text>
                            <pre className="mt-1 rounded bg-gray-100 p-1 text-xs overflow-auto max-h-48">
                              {typeof (result.responseJson as any).body === 'string'
                                ? (result.responseJson as any).body
                                : JSON.stringify((result.responseJson as any).body, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <Text type="secondary">HTTP 响应: 无响应数据</Text>
                    </div>
                  )}

                  {/* 变量变化 */}
                  {result.variableDeltasJson && Object.keys(result.variableDeltasJson).length > 0 && (
                    <div className="mb-3">
                      <Text strong>变量变化:</Text>
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(result.variableDeltasJson).map(([key, value]) => (
                          <div key={key} className="flex gap-2 text-xs">
                            <Tag color="green" className="text-xs">{key}</Tag>
                            <Text code className="text-xs break-all">{value as string}</Text>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assertion Results */}
                  {result.scriptResultsJson && (result.scriptResultsJson as any).assertionResults && (
                    <div className="mb-3">
                      <Text strong>断言结果:</Text>
                      <div className="mt-2 space-y-1">
                        {((result.scriptResultsJson as any).assertionResults as any[]).map((ar: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            {ar.passed ? (
                              <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            ) : (
                              <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                            )}
                            <Text>{ar.assertion.type} {ar.assertion.operator}</Text>
                            {ar.actual && <Text type="secondary">实际: {JSON.stringify(ar.actual)}</Text>}
                            {ar.error && <Text type="danger">{ar.error}</Text>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extractor Results */}
                  {result.scriptResultsJson && (result.scriptResultsJson as any).extractorResults && (
                    <div className="mb-3">
                      <Text strong>数据提取结果:</Text>
                      <div className="mt-2 space-y-1">
                        {((result.scriptResultsJson as any).extractorResults as any[]).map((er: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            {er.success ? (
                              <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            ) : (
                              <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                            )}
                            <Text>{er.extractor.variable} = {er.value || er.error}</Text>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Script Results */}
                  {result.scriptResultsJson && (
                    <div>
                      <Text strong>脚本执行结果:</Text>
                      <pre className="mt-2 rounded bg-gray-100 p-2 text-xs">
                        {JSON.stringify(result.scriptResultsJson, null, 2)}
                      </pre>
                    </div>
                  )}
                </Collapse.Panel>
              ))}
            </Collapse>
          </div>
        )}
      </Modal>
    </div>
  )
}
