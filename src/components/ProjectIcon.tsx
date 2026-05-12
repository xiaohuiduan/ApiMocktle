import type { ComponentType, SVGAttributes } from 'react'

import {
  Bell,
  Book,
  BookOpen,
  Box,
  Briefcase,
  Bug,
  Calendar,
  Camera,
  ChartBar,
  CheckCircle,
  Chrome,
  Clipboard,
  Clock,
  Cloud,
  Code,
  Cog,
  Command,
  Compass,
  Copy,
  Crown,
  Database,
  DollarSign,
  Download,
  Edit3,
  Eye,
  Facebook,
  Feather,
  File,
  FileText,
  Filter,
  Flag,
  Flame,
  Folder,
  FolderOpen,
  Gift,
  GitBranch,
  Github,
  Globe,
  HardDrive,
  Hash,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  Image,
  Inbox,
  Info,
  Key,
  Layers,
  LifeBuoy,
  Link,
  Lock,
  Mail,
  Map,
  MapPin,
  Megaphone,
  MessageCircle,
  Monitor,
  Moon,
  Music,
  Package,
  Palette,
  Paperclip,
  Pencil,
  PieChart,
  Play,
  Power,
  Puzzle,
  Rocket,
  Save,
  Scissors,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  Smile,
  Star,
  Sun,
  Tablet,
  Tag,
  Target,
  Terminal,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  User,
  Users,
  Video,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react'

import { theme } from 'antd'

type IconComponent = ComponentType<SVGAttributes<SVGElement> & { size?: string | number }>

export const ICON_MAP: Record<string, IconComponent> = {
  Rocket, Star, Heart, Home, User, Users, Settings, Cog,
  Search, Bell, Calendar, Clock, Map, MapPin, Compass,
  Code, Terminal, Database, Server, Globe, Cloud, Shield, Key, Lock, Wifi, Link, Zap, Power,
  Bug, Wrench, Pencil, Edit3, File, FileText, Folder, FolderOpen,
  Camera, Image, Video, Music, Headphones, Play,
  Mail, MessageCircle, Send, Share2, Megaphone,
  Briefcase, DollarSign, ShoppingCart, Package, Truck,
  Sun, Moon, Flame, Feather,
  Book, BookOpen, Copy, Crown, Eye, Flag, Gift, Hash, HelpCircle, Info,
  Layers, Palette, Paperclip, Puzzle, Save, Scissors, Smile, Tag, Target,
  ThumbsUp, Trash2, TrendingUp, Upload, Download,
  Command, Chrome, Github,
  Box, CheckCircle, Clipboard, Filter, Inbox,
  GitBranch, LifeBuoy, Monitor, Tablet, PieChart,
}

export const ICON_OPTIONS = Object.keys(ICON_MAP)

const ICON_COLORS = [
  '#1677ff', '#52c41a', '#fa541c', '#722ed1', '#eb2f96',
  '#13c2c2', '#faad14', '#2f54eb', '#a0d911', '#f5222d',
]

export function getIconColor(name: string): string {
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
        <Rocket size={iconSize} />
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
