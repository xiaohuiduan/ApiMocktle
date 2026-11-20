import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Form } from 'antd'

import { DensityPicker } from './DensityPicker'
import { DesignStylePicker } from './DesignStylePicker'
import { defaultThemeSetting } from './theme-data'
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
  const { value, onChange, autoSaveId } = props

  const { t } = useTranslation()

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
        <Form.Item label={t('ui.theme.label')} name="themeMode">
          <ThemePicker />
        </Form.Item>

        <Form.Item label={t('ui.designStyle.label')} name="designStyle">
          <DesignStylePicker />
        </Form.Item>

        <Form.Item label={t('ui.density.label')} name="density">
          <DensityPicker />
        </Form.Item>
      </Form>
    </div>
  )
}
