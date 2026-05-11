'use client'

import { useEffect, useRef } from 'react'

import clsx from 'clsx'

import { useThemeContext } from '@/components/ThemeEditor/ThemeContext'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
}

interface GeometricShape {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  rotationSpeed: number
  sides: number // 3 = triangle, 6 = hexagon
  opacity: number
}

interface ParticleCanvasProps {
  variant: 'fullscreen' | 'embedded'
  preset?: 'login' | 'projects'
  particleCount?: number
  connectionDistance?: number
  mouseInteraction?: boolean
  primaryColor?: string
  className?: string
  style?: React.CSSProperties
}

// ─── Engine ───────────────────────────────────────────────────────────────────

interface ThemeColors {
  particle: (opacity: number) => string
  line: (opacity: number) => string
  shape: (opacity: number) => string
}

const LIGHT_COLORS: ThemeColors = {
  particle: (o) => `rgba(100,120,150,${o})`,
  line: (o) => `rgba(100,120,150,${o})`,
  shape: (o) => `rgba(100,120,150,${o})`,
}

const DARK_COLORS: ThemeColors = {
  particle: (o) => `rgba(180,200,230,${o})`,
  line: (o) => `rgba(180,200,230,${o})`,
  shape: (o) => `rgba(180,200,230,${o})`,
}

class ParticleEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private particles: Particle[] = []
  private shapes: GeometricShape[] = []
  private animationId = 0
  private mouse = { x: -9999, y: -9999 }
  private colors: ThemeColors
  private connectionDistance: number
  private mouseInteractionEnabled: boolean
  private primaryColor: string

  constructor(
    canvas: HTMLCanvasElement,
    isDark: boolean,
    particleCount: number,
    connectionDistance: number,
    mouseInteraction: boolean,
    primaryColor: string,
  ) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.colors = isDark ? DARK_COLORS : LIGHT_COLORS
    this.connectionDistance = connectionDistance
    this.mouseInteractionEnabled = mouseInteraction
    this.primaryColor = primaryColor

    this.initParticles(particleCount)
    this.initShapes()
    this.bindEvents()
    this.animate()
  }

  // ── Particle helpers ──────────────────────────────────────────────────────

  private rand(min: number, max: number): number {
    return min + Math.random() * (max - min)
  }

  private initParticles(count: number): void {
    const { width, height } = this.canvas
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: this.rand(-0.4, 0.4),
      vy: this.rand(-0.4, 0.4),
      radius: this.rand(1.5, 3),
      opacity: this.rand(0.3, 0.7),
    }))
  }

  private initShapes(): void {
    const { width, height } = this.canvas
    const count = Math.floor(this.rand(3, 6))
    this.shapes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: this.rand(-0.15, 0.15),
      vy: this.rand(-0.15, 0.15),
      size: this.rand(20, 40),
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: this.rand(-0.003, 0.003),
      sides: Math.random() > 0.5 ? 3 : 6,
      opacity: this.rand(0.06, 0.12),
    }))
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private onMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = e.clientX - rect.left
    this.mouse.y = e.clientY - rect.top
  }

  private onLeave = (): void => {
    this.mouse.x = -9999
    this.mouse.y = -9999
  }

  private bindEvents(): void {
    if (this.mouseInteractionEnabled) {
      this.canvas.addEventListener('mousemove', this.onMove)
      this.canvas.addEventListener('mouseleave', this.onLeave)
    }
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener('mousemove', this.onMove)
    this.canvas.removeEventListener('mouseleave', this.onLeave)
  }

  // ── Update ────────────────────────────────────────────────────────────────

  private updateParticle(p: Particle): void {
    const { width, height } = this.canvas

    // Mouse attraction (damped spring)
    if (this.mouseInteractionEnabled) {
      const dx = this.mouse.x - p.x
      const dy = this.mouse.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 150 && dist > 0) {
        const force = 0.0005
        p.vx += dx * force
        p.vy += dy * force
      }
    }

    p.x += p.vx
    p.y += p.vy

    // Edge wrapping
    if (p.x < -10) p.x = width + 10
    if (p.x > width + 10) p.x = -10
    if (p.y < -10) p.y = height + 10
    if (p.y > height + 10) p.y = -10
  }

  private updateShape(s: GeometricShape): void {
    const { width, height } = this.canvas
    s.x += s.vx
    s.y += s.vy
    s.rotation += s.rotationSpeed

    if (s.x < -50) s.x = width + 50
    if (s.x > width + 50) s.x = -50
    if (s.y < -50) s.y = height + 50
    if (s.y > height + 50) s.y = -50
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private drawParticle(p: Particle): void {
    const { ctx, colors } = this
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.fillStyle = colors.particle(p.opacity)
    ctx.fill()
  }

  private drawConnections(): void {
    const { ctx, particles, colors, connectionDistance } = this
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < connectionDistance) {
          const opacity = (1 - dist / connectionDistance) * 0.25
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = colors.line(opacity)
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
    }
  }

  private drawShape(s: GeometricShape): void {
    const { ctx, colors } = this
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.rotate(s.rotation)
    ctx.beginPath()
    for (let i = 0; i < s.sides; i++) {
      const angle = (i / s.sides) * Math.PI * 2 - Math.PI / 2
      const px = Math.cos(angle) * s.size
      const py = Math.sin(angle) * s.size
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.strokeStyle = colors.shape(s.opacity)
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  private drawHexGrid(): void {
    const { ctx, canvas, primaryColor } = this
    const gridSize = 70
    const hexRadius = gridSize / 2
    const rowHeight = gridSize * Math.sqrt(3) / 2
    const { width, height } = canvas
    const dpr = window.devicePixelRatio || 1
    const w = width / dpr
    const h = height / dpr

    ctx.strokeStyle = primaryColor
    ctx.globalAlpha = 0.1
    ctx.lineWidth = 0.8

    for (let row = -1; row * rowHeight < h + hexRadius; row++) {
      for (let col = -1; col * gridSize < w + hexRadius; col++) {
        const cx = col * gridSize + (row % 2 !== 0 ? gridSize / 2 : 0)
        const cy = row * rowHeight
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 6
          const px = cx + Math.cos(angle) * hexRadius
          const py = cy + Math.sin(angle) * hexRadius
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  // ── Loop ──────────────────────────────────────────────────────────────────

  private animate = (): void => {
    const { ctx, canvas } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    this.drawHexGrid()
    for (const p of this.particles) this.updateParticle(p)
    for (const s of this.shapes) this.updateShape(s)

    this.drawConnections()
    for (const p of this.particles) this.drawParticle(p)
    for (const s of this.shapes) this.drawShape(s)

    this.animationId = requestAnimationFrame(this.animate)
  }

  // ── Public API ────────────────────────────────────────────────────────────

  updateTheme(isDark: boolean): void {
    this.colors = isDark ? DARK_COLORS : LIGHT_COLORS
  }

  updatePrimaryColor(color: string): void {
    this.primaryColor = color
  }

  resize(): void {
    const parent = this.canvas.parentElement
    if (!parent) return
    const dpr = window.devicePixelRatio || 1
    const w = parent.clientWidth
    const h = parent.clientHeight
    this.canvas.width = w * dpr
    this.canvas.height = h * dpr
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  destroy(): void {
    cancelAnimationFrame(this.animationId)
    this.unbindEvents()
  }
}

// ─── React Component ──────────────────────────────────────────────────────────

export function ParticleCanvas(props: ParticleCanvasProps) {
  const {
    variant,
    preset = 'login',
    particleCount = preset === 'login' ? 70 : 50,
    connectionDistance = 120,
    mouseInteraction = variant === 'fullscreen',
    primaryColor = '#1677ff',
    className,
    style,
  } = props

  const { isDarkMode } = useThemeContext()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ParticleEngine | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialise engine
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new ParticleEngine(
      canvas,
      isDarkMode,
      particleCount,
      connectionDistance,
      mouseInteraction,
      primaryColor,
    )
    engineRef.current = engine
    engine.resize()

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [particleCount, connectionDistance, mouseInteraction, isDarkMode, primaryColor])

  // Theme sync
  useEffect(() => {
    engineRef.current?.updateTheme(isDarkMode)
  }, [isDarkMode])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      engineRef.current?.resize()
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  const isFullscreen = variant === 'fullscreen'

  return (
    <div
      ref={containerRef}
      className={clsx(
        isFullscreen
          ? 'fixed inset-0 z-0'
          : 'absolute inset-0 z-0 overflow-hidden pointer-events-none',
        className,
      )}
      style={style}
    >
      <canvas
        ref={canvasRef}
        style={{
          pointerEvents: mouseInteraction && isFullscreen ? 'auto' : 'none',
          display: 'block',
        }}
      />
    </div>
  )
}
