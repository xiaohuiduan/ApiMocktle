export type ThemeMode = 'lightDefault' | 'darkDefault'

export type DesignStyle = 'default' | 'glassmorphism' | 'skeuomorphism' | 'neumorphism'

/** 界面密度档位：紧凑（默认）/ 标准 / 宽松 */
export type Density = 'compact' | 'standard' | 'loose'

export interface ThemeSetting {
  themeMode: ThemeMode
  designStyle: DesignStyle
  density: Density
}
