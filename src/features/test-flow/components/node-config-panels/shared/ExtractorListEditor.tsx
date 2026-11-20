import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Select, Space, Typography } from 'antd'
import { Plus, Trash2 } from 'lucide-react'

import { translateKey } from '@/i18n/translate'
import type { TestExtractor } from '@/types'

const { Text } = Typography

// ==================== 提取器类型选项 ====================

const EXTRACTOR_TYPE_OPTIONS = [
  { value: 'json_path', labelKey: 'flow.enum.extractorType.jsonPath' },
  { value: 'header', labelKey: 'flow.enum.extractorType.header' },
  { value: 'regex', labelKey: 'flow.enum.extractorType.regex' },
  { value: 'status', labelKey: 'flow.enum.extractorType.status' },
]

// ==================== 组件 Props ====================

interface ExtractorListEditorProps {
  extractors: TestExtractor[]
  onChange: (extractors: TestExtractor[]) => void
}

// ==================== 组件 ====================

export default function ExtractorListEditor({ extractors, onChange }: ExtractorListEditorProps) {
  const { t } = useTranslation()

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
          {t('flow.nodeConfig.editor.extractorList')}
        </Text>
        <Button
          icon={<Plus size={14} />}
          size="small"
          type="dashed"
          onClick={handleAdd}
        >
          {t('flow.nodeConfig.editor.extractorAdd')}
        </Button>
      </div>

      {extractors.length === 0
        ? (
            <Text className="text-xs italic" type="secondary">
              {t('flow.nodeConfig.editor.extractorEmpty')}
            </Text>
          )
        : (
            <div className="space-y-2">
              {extractors.map((extractor, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-md border border-[color:var(--ds-node-border-color)] bg-[color:var(--ds-node-bg-elevated)] p-2"
                >
                  {/* 第一行：类型、路径/名称 */}
                  <Space.Compact block>
                    <Select
                      options={EXTRACTOR_TYPE_OPTIONS.map((o) => ({ value: o.value, label: translateKey(o.labelKey) }))}
                      placeholder={t('flow.nodeConfig.editor.extractorTypePlaceholder')}
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
                        placeholder={t('flow.nodeConfig.editor.headerNamePlaceholder')}
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
                      placeholder={t('flow.nodeConfig.editor.extractorVariablePlaceholder')}
                      size="small"
                      style={{ width: shouldShowPattern(extractor.type) ? '50%' : '90%' }}
                      value={extractor.variable}
                      onChange={(e) => { handleUpdate(index, 'variable', e.target.value) }}
                    />
                    {shouldShowPattern(extractor.type) && (
                      <Input
                        placeholder={t('flow.nodeConfig.editor.patternPlaceholder')}
                        size="small"
                        style={{ width: '40%' }}
                        value={extractor.pattern ?? ''}
                        onChange={(e) => { handleUpdate(index, 'pattern', e.target.value) }}
                      />
                    )}
                    <Button
                      danger
                      icon={<Trash2 size={14} />}
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
