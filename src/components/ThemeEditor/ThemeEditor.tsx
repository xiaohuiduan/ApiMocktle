import { useEffect } from 'react'

import { Form, theme } from 'antd'

import { defaultThemeSetting } from './theme-data'
import { DesignStylePicker } from './DesignStylePicker'
import { storeThemeSetting } from './ThemeEditor.helper'
import type { ThemeSetting } from './ThemeEditor.type'
import { ThemePicker } from './ThemePicker'

interface ThemeEditorProps {
  value?: ThemeSetting
  onChange?: (value: ThemeEditorProps['value']) => void
  autoSaveId?: string
}

/**
 * 主题编辑器。
 */
export function ThemeEditor(props: ThemeEditorProps) {
  const { token } = theme.useToken()

  const { value, onChange, autoSaveId } = props

  const [form] = Form.useForm<ThemeSetting>()

  useEffect(() => {
    const newThemeSetting = { ...defaultThemeSetting, ...value }

    form.setFieldsValue(newThemeSetting)

    if (autoSaveId) {
      storeThemeSetting(autoSaveId, newThemeSetting)
    }
  }, [form, value, autoSaveId])

  return (
    <div>
      <Form
        form={form}
        initialValues={value}
        labelCol={{ span: 3 }}
        wrapperCol={{ offset: 1, span: 20 }}
        onValuesChange={(_, newThemeSetting) => {
          onChange?.(newThemeSetting)
        }}
      >
        <Form.Item label="主题" name="themeMode">
          <ThemePicker />
        </Form.Item>

        <Form.Item label="设计风格" name="designStyle">
          <DesignStylePicker />
        </Form.Item>
      </Form>
    </div>
  )
}
