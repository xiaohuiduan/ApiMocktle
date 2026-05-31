import { useCallback } from 'react'
import { Button, Input, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'

const { Text } = Typography

// ==================== 类型 ====================

export interface KVPair {
  name: string
  value: string
}

interface KVEditorProps {
  value: KVPair[]
  onChange: (pairs: KVPair[]) => void
  namePlaceholder?: string
  valuePlaceholder?: string
  nameWidth?: number
}

// ==================== 组件 ====================

export default function KVEditor({
  value,
  onChange,
  namePlaceholder = 'Key',
  valuePlaceholder = 'Value',
  nameWidth = 120,
}: KVEditorProps) {
  const handleAdd = useCallback(() => {
    onChange([...value, { name: '', value: '' }])
  }, [value, onChange])

  const handleDelete = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [value, onChange],
  )

  const handleNameChange = useCallback(
    (index: number, name: string) => {
      onChange(value.map((p, i) => (i === index ? { ...p, name } : p)))
    },
    [value, onChange],
  )

  const handleValueChange = useCallback(
    (index: number, val: string) => {
      onChange(value.map((p, i) => (i === index ? { ...p, value: val } : p)))
    },
    [value, onChange],
  )

  return (
    <div>
      {/* 表头 */}
      {value.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 4, paddingLeft: 2 }}>
          <Text type="secondary" style={{ fontSize: 11, width: nameWidth, flexShrink: 0 }}>
            {namePlaceholder}
          </Text>
          <Text type="secondary" style={{ fontSize: 11, flex: 1 }}>
            {valuePlaceholder}
          </Text>
          <div style={{ width: 28 }} />
        </div>
      )}

      {/* 行 */}
      {value.map((pair, index) => (
        <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <Input
            size="small"
            value={pair.name}
            onChange={(e) => handleNameChange(index, e.target.value)}
            placeholder={namePlaceholder}
            style={{ width: nameWidth, flexShrink: 0 }}
          />
          <Input
            size="small"
            value={pair.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            placeholder={valuePlaceholder}
            style={{ flex: 1 }}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(index)}
            style={{ width: 28, flexShrink: 0 }}
          />
        </div>
      ))}

      {/* 添加按钮 */}
      <Button
        type="dashed"
        size="small"
        icon={<PlusOutlined />}
        onClick={handleAdd}
        block
        style={{ marginTop: 4 }}
      >
        添加
      </Button>
    </div>
  )
}
