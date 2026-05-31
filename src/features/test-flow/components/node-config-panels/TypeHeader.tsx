import { Tag, Typography } from 'antd'
import { FlowNodeType } from '../../types/flow.types'
import {
  PlayCircleOutlined,
  StopOutlined,
  GlobalOutlined,
  BranchesOutlined,
  ReloadOutlined,
  PartitionOutlined,
  ClockCircleOutlined,
  ApartmentOutlined,
  SettingOutlined,
  SafetyOutlined,
} from '@ant-design/icons'

const { Text } = Typography

// ==================== 节点类型标签映射 ====================

const NODE_TYPE_LABELS: Record<string, string> = {
  start: '开始节点',
  end: '结束节点',
  httpRequest: 'HTTP 请求',
  condition: '条件判断',
  loop: '循环',
  parallel: '并行',
  wait: '等待',
  subFlow: '子流程',
  setVariable: '变量赋值',
  assert: '断言',
}

// ==================== 节点类型颜色映射 ====================

const NODE_TYPE_COLORS: Record<string, string> = {
  start: '#6b7280',
  end: '#6b7280',
  httpRequest: '#3b82f6',
  condition: '#f97316',
  loop: '#a855f7',
  parallel: '#14b8a6',
  wait: '#eab308',
  subFlow: '#6366f1',
  setVariable: '#22c55e',
  assert: '#ef4444',
}

// ==================== 节点类型图标映射 ====================

const NODE_TYPE_ICONS: Record<string, React.ReactNode> = {
  start: <PlayCircleOutlined />,
  end: <StopOutlined />,
  httpRequest: <GlobalOutlined />,
  condition: <BranchesOutlined />,
  loop: <ReloadOutlined />,
  parallel: <PartitionOutlined />,
  wait: <ClockCircleOutlined />,
  subFlow: <ApartmentOutlined />,
  setVariable: <SettingOutlined />,
  assert: <SafetyOutlined />,
}

// ==================== 组件 Props ====================

interface TypeHeaderProps {
  nodeType: FlowNodeType
  nodeId: string
}

// ==================== 组件 ====================

export default function TypeHeader({ nodeType, nodeId }: TypeHeaderProps) {
  const label = NODE_TYPE_LABELS[nodeType] || nodeType
  const color = NODE_TYPE_COLORS[nodeType] || '#3b82f6'
  const icon = NODE_TYPE_ICONS[nodeType] || null

  return (
    <div className="space-y-2">
      {/* 节点类型标签 */}
      <div>
        <Tag
          color={color}
          icon={icon}
          className="text-sm"
        >
          {label}
        </Tag>
      </div>

      {/* 节点 ID */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          节点 ID
        </Text>
        <Text code className="text-xs">
          {nodeId}
        </Text>
      </div>
    </div>
  )
}
