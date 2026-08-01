import { createRoot } from 'react-dom/client'

import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { ShareApp } from './ShareApp'

import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN}>
    <ShareApp />
  </ConfigProvider>,
)
