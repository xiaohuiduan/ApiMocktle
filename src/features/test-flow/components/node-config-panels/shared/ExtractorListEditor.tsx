import { useCallback } from 'react'
import { Button, Select, Input, Space, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
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
        if (i !== index) return extractor
        return { ...extractor, [field]: value }
      })
      onChange(newExtractors)
    },
    [extractors, onChange],
  )

  // 判断是否需要显示 path 字段
  const shouldShowPath = (type: string) => {
    return type === 'json_path' || type === 'regex'
  }

  // 判断是否需要显示 pattern 字段
  const shouldShowPattern = (type: string) => {
    return type === 'regex'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Text type="secondary" className="text-xs">
          提取器列表
        </Text>
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          添加提取器
        </Button>
      </div>

      {extractors.length === 0 ? (
        <Text type="secondary" className="text-xs italic">
          暂无提取器
        </Text>
      ) : (
        <div className="space-y-2">
          {extractors.map((extractor, index) => (
            <div
              key={index}
              className="p-2 border border-gray-200 rounded-md space-y-2 bg-gray-50"
            >
              {/* 第一行：类型、路径/名称 */}
              <Space.Compact block>
                <Select
                  value={extractor.type}
                  onChange={(value) => handleUpdate(index, 'type', value)}
                  options={EXTRACTOR_TYPE_OPTIONS}
                  size="small"
                  style={{ width: '35%' }}
                  placeholder="提取类型"
                />
                {shouldShowPath(extractor.type) && (
                  <Input
                    value={extractor.path || ''}
                    onChange={(e) => handleUpdate(index, 'path', e.target.value)}
                    size="small"
                    placeholder={
                      extractor.type === 'json_path'
                        ? '$.data.token'
                        : '正则表达式'
                    }
                    style={{ width: '65%' }}
                  />
                )}
                {extractor.type === 'header' && (
                  <Input
                    value={extractor.name || ''}
                    onChange={(e) => handleUpdate(index, 'name', e.target.value)}
                    size="small"
                    placeholder="Header 名称"
                    style={{ width: '65%' }}
                  />
                )}
              </Space.Compact>

              {/* 第二行：变量名、pattern（如果需要）、删除按钮 */}
              <Space.Compact block>
                <Input
                  value={extractor.variable}
                  onChange={(e) => handleUpdate(index, 'variable', e.target.value)}
                  size="small"
                  placeholder="变量名（必填）"
                  style={{ width: shouldShowPattern(extractor.type) ? '50%' : '90%' }}
                />
                {shouldShowPattern(extractor.type) && (
                  <Input
                    value={extractor.pattern || ''}
                    onChange={(e) => handleUpdate(index, 'pattern', e.target.value)}
                    size="small"
                    placeholder="提取模式"
                    style={{ width: '40%' }}
                  />
                )}
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(index)}
                  style={{ width: '10%' }}
                />
              </Space.Compact>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
