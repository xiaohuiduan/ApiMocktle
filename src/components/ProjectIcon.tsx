import type { ComponentType, SVGAttributes } from 'react'

import {
  FaBook,
  FaBug,
  FaChartBar,
  FaCloud,
  FaCode,
  FaCog,
  FaDatabase,
  FaDesktop,
  FaEnvelope,
  FaFileAlt,
  FaFire,
  FaFlask,
  FaGamepad,
  FaGlobe,
  FaHeart,
  FaHome,
  FaKey,
  FaLock,
  FaMobileAlt,
  FaMusic,
  FaPaintBrush,
  FaRocket,
  FaSearch,
  FaServer,
  FaShieldAlt,
  FaShoppingCart,
  FaStar,
  FaTerminal,
  FaUser,
  FaWifi,
} from 'react-icons/fa'
import {
  MdApi,
  MdDashboard,
  MdDevices,
  MdExtension,
  MdLayers,
  MdNotifications,
  MdPayment,
  MdPhotoCamera,
  MdStorage,
  MdTimeline,
} from 'react-icons/md'

import { theme } from 'antd'

type IconComponent = ComponentType<SVGAttributes<SVGElement> & { size?: string | number }>

const ICON_MAP: Record<string, IconComponent> = {
  FaRocket, FaBook, FaCode, FaCog, FaDatabase, FaServer, FaGlobe, FaCloud,
  FaShieldAlt, FaKey, FaLock, FaFire, FaStar, FaHeart, FaHome, FaUser,
  FaSearch, FaTerminal, FaBug, FaFlask, FaDesktop, FaMobileAlt, FaMusic,
  FaPaintBrush, FaGamepad, FaShoppingCart, FaEnvelope, FaFileAlt, FaChartBar, FaWifi,
  MdApi, MdDashboard, MdDevices, MdExtension, MdLayers, MdNotifications,
  MdPayment, MdPhotoCamera, MdStorage, MdTimeline,
}

export const ICON_OPTIONS = Object.keys(ICON_MAP)

const ICON_COLORS = [
  '#1677ff', '#52c41a', '#fa541c', '#722ed1', '#eb2f96',
  '#13c2c2', '#faad14', '#2f54eb', '#a0d911', '#f5222d',
]

function getIconColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length]
}

export function ProjectIcon({ icon, size = 32 }: { icon?: string, size?: number }) {
  const { token } = theme.useToken()
  const Component = icon ? ICON_MAP[icon] : undefined
  const iconSize = size * 0.55
  const bgSize = size

  if (!Component) {
    return (
      <div
        className="inline-flex shrink-0 items-center justify-center rounded-lg"
        style={{
          width: bgSize,
          height: bgSize,
          backgroundColor: token.colorFillSecondary,
          fontSize: iconSize,
          color: token.colorTextSecondary,
        }}
      >
        <FaRocket size={iconSize} />
      </div>
    )
  }

  const color = getIconColor(icon!)

  return (
    <div
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: bgSize,
        height: bgSize,
        backgroundColor: `${color}18`,
        color,
      }}
    >
      <Component size={iconSize} />
    </div>
  )
}
