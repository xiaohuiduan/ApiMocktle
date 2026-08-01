import { useCallback } from 'react'

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Typography } from 'antd'

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
          <Text style={{ fontSize: 11, width: nameWidth, flexShrink: 0 }} type="secondary">
            {namePlaceholder}
          </Text>
          <Text style={{ fontSize: 11, flex: 1 }} type="secondary">
            {valuePlaceholder}
          </Text>
          <div style={{ width: 28 }} />
        </div>
      )}

      {/* 行 */}
      {value.map((pair, index) => (
        <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <Input
            placeholder={namePlaceholder}
            size="small"
            style={{ width: nameWidth, flexShrink: 0 }}
            value={pair.name}
            onChange={(e) => { handleNameChange(index, e.target.value) }}
          />
          <Input
            placeholder={valuePlaceholder}
            size="small"
            style={{ flex: 1 }}
            value={pair.value}
            onChange={(e) => { handleValueChange(index, e.target.value) }}
          />
          <Button
            danger
            icon={<DeleteOutlined />}
            size="small"
            style={{ width: 28, flexShrink: 0 }}
            type="text"
            onClick={() => { handleDelete(index) }}
          />
        </div>
      ))}

      {/* 添加按钮 */}
      <Button
        block
        icon={<PlusOutlined />}
        size="small"
        style={{ marginTop: 4 }}
        type="dashed"
        onClick={handleAdd}
      >
        添加
      </Button>
    </div>
  )
}
