export type ThemeMode = 'lightDefault' | 'darkDefault'

export type DesignStyle = 'default' | 'glassmorphism' | 'skeuomorphism' | 'neumorphism'

export interface ThemeSetting {
  themeMode: ThemeMode
  designStyle: DesignStyle
}
