import { useTranslation } from 'react-i18next'

import { Select, Typography } from 'antd'

import { setLanguage } from '@/i18n'
import { type LanguageSetting, readLanguageSetting } from '@/i18n/storage'

/**
 * 语言选择器。
 *
 * 三项语义（对应 PRD R6/R7）：
 * - 「跟随系统」：存 `'system'`，每次启动按系统语言解析，用户改系统语言后跟随变化。
 * - 「中文」/「English」：存具体语言，此后不被系统语言覆盖。
 *
 * 存的是**模式**而非解析结果——这是「跟随系统」能持续生效的前提。
 */
export function LanguageSettingPanel() {
  const { t } = useTranslation()

  const value = readLanguageSetting()

  return (
    <div className="max-w-lg">
      <Typography.Text className="mb-1 block text-sm font-medium">
        {t('settings.language.title')}
      </Typography.Text>

      <Select<LanguageSetting>
        options={[
          { value: 'system', label: t('settings.language.system') },
          { value: 'zh-CN', label: t('settings.language.zhCN') },
          { value: 'en-US', label: t('settings.language.enUS') },
        ]}
        style={{ width: 240 }}
        value={value}
        onChange={(next) => {
          setLanguage(next)
        }}
      />

      <Typography.Text className="mt-1 block text-sm" type="secondary">
        {t('settings.language.description')}
      </Typography.Text>
    </div>
  )
}
