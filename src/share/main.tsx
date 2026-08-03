import { createRoot } from 'react-dom/client'

import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { ThemeProviderClient } from '@/components/ThemeEditor'

import { ShareApp } from './ShareApp'

import '@/styles/globals.css'

// 分享页跟随主应用主题（同域共享 localStorage 设置；独立域时自动使用默认主题）
createRoot(document.getElementById('root')!).render(
  <ThemeProviderClient autoSaveId="theme:persistence">
    <ConfigProvider locale={zhCN}>
      <ShareApp />
    </ConfigProvider>
  </ThemeProviderClient>,
)
