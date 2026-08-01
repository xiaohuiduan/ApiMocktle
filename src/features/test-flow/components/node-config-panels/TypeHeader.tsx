import { Tag, Typography } from 'antd'
import { FlowNodeType, NODE_TYPE_LABELS } from '../../types/flow.types'
import { NODE_TYPE_COLORS } from '../../nodes/nodeColors'
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
  const label = NODE_TYPE_LABELS[nodeType]
  const color = NODE_TYPE_COLORS[nodeType]
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
