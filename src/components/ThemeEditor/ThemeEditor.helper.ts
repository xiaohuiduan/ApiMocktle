import { defaultThemeSetting, designStylePresets } from './theme-data'
import type { Density, ThemeSetting } from './ThemeEditor.type'

const densityValues: Density[] = ['compact', 'standard', 'loose']

export const storeThemeSetting = (autoSaveId: string, newThemeSetting: ThemeSetting): void => {
  window.localStorage.setItem(autoSaveId, JSON.stringify(newThemeSetting))
}

export const restoreThemeSetting = (autoSaveId: string | undefined): ThemeSetting => {
  if (autoSaveId) {
    const storage = window.localStorage.getItem(autoSaveId)

    if (storage) {
      const parsed = JSON.parse(storage) as Partial<ThemeSetting>
      // 兼容旧数据：缺失的字段用默认值填充，无效的设计风格/密度回退到默认
      const merged = { ...defaultThemeSetting, ...parsed }
      if (!(merged.designStyle in designStylePresets)) {
        merged.designStyle = defaultThemeSetting.designStyle
      }
      if (!densityValues.includes(merged.density)) {
        merged.density = defaultThemeSetting.density
      }
      return merged
    }
  }

  return defaultThemeSetting
}
