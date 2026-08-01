import { useCallback } from 'react'

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Select, Space, Typography } from 'antd'

import type { TestExtractor } from '@/types'

const { Text } = Typography

// ==================== 提取器类型选项 ====================

const EXTRACTOR_TYPE_OPTIONS = [
  { value: 'json_path', label: 'JSON 路径' },
  { value: 'header', label: '响应头' },
  { value: 'regex', label: '正则表达式' },
  { value: 'status', label: '状态码' },
]

// ==================== 组件 Props ====================

interface ExtractorListEditorProps {
  extractors: TestExtractor[]
  onChange: (extractors: TestExtractor[]) => void
}

// ==================== 组件 ====================

export default function ExtractorListEditor({ extractors, onChange }: ExtractorListEditorProps) {
  // 添加新提取器
  const handleAdd = useCallback(() => {
    const newExtractor: TestExtractor = {
      type: 'json_path',
      variable: '',
    }
    onChange([...extractors, newExtractor])
  }, [extractors, onChange])

  // 删除提取器
  const handleDelete = useCallback(
    (index: number) => {
      const newExtractors = extractors.filter((_, i) => i !== index)
      onChange(newExtractors)
    },
    [extractors, onChange],
  )

  // 更新提取器字段
  const handleUpdate = useCallback(
    (index: number, field: keyof TestExtractor, value: any) => {
      const newExtractors = extractors.map((extractor, i) => {
        if (i !== index) { return extractor }

        return { ...extractor, [field]: value }
      })
      onChange(newExtractors)
    },
    [extractors, onChange],
  )

  // 判断是否需要显示 path 字段
  const shouldShowPath = (type: string) => {
    return type === 'json_path'
  }

  // 判断是否需要显示 pattern 字段
  const shouldShowPattern = (type: string) => {
    return type === 'regex'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Text className="text-xs" type="secondary">
          提取器列表
        </Text>
        <Button
          icon={<PlusOutlined />}
          size="small"
          type="dashed"
          onClick={handleAdd}
        >
          添加提取器
        </Button>
      </div>

      {extractors.length === 0
        ? (
            <Text className="text-xs italic" type="secondary">
              暂无提取器
            </Text>
          )
        : (
            <div className="space-y-2">
              {extractors.map((extractor, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-md border border-[color:var(--ds-node-border-color,#e5e7eb)] bg-[color:var(--ds-node-bg-elevated,#f9fafb)] p-2"
                >
                  {/* 第一行：类型、路径/名称 */}
                  <Space.Compact block>
                    <Select
                      options={EXTRACTOR_TYPE_OPTIONS}
                      placeholder="提取类型"
                      size="small"
                      style={{ width: '35%' }}
                      value={extractor.type}
                      onChange={(value) => { handleUpdate(index, 'type', value) }}
                    />
                    {shouldShowPath(extractor.type) && (
                      <Input
                        placeholder="data.token"
                        size="small"
                        style={{ width: '65%' }}
                        value={extractor.path ?? ''}
                        onChange={(e) => { handleUpdate(index, 'path', e.target.value) }}
                      />
                    )}
                    {extractor.type === 'header' && (
                      <Input
                        placeholder="Header 名称"
                        size="small"
                        style={{ width: '65%' }}
                        value={extractor.name ?? ''}
                        onChange={(e) => { handleUpdate(index, 'name', e.target.value) }}
                      />
                    )}
                  </Space.Compact>

                  {/* 第二行：变量名、pattern（如果需要）、删除按钮 */}
                  <Space.Compact block>
                    <Input
                      placeholder="变量名（必填）"
                      size="small"
                      style={{ width: shouldShowPattern(extractor.type) ? '50%' : '90%' }}
                      value={extractor.variable}
                      onChange={(e) => { handleUpdate(index, 'variable', e.target.value) }}
                    />
                    {shouldShowPattern(extractor.type) && (
                      <Input
                        placeholder="提取模式"
                        size="small"
                        style={{ width: '40%' }}
                        value={extractor.pattern ?? ''}
                        onChange={(e) => { handleUpdate(index, 'pattern', e.target.value) }}
                      />
                    )}
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      size="small"
                      style={{ width: '10%' }}
                      type="text"
                      onClick={() => { handleDelete(index) }}
                    />
                  </Space.Compact>
                </div>
              ))}
            </div>
          )}
    </div>
  )
}
