import { motion } from 'framer-motion'
import type { HTMLMotionProps } from 'framer-motion'
import {
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

type CardProps = Omit<HTMLMotionProps<'div'>, 'children'> & { children?: ReactNode; delay?: number }

export function Card({ children, className = '', delay = 0, ...props }: CardProps) {
  return (
    <motion.div
      className={`card ${className}`.trim()}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay, ease: 'easeOut' }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children?: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: ReactNode
}

export function Button({ children, className = '', variant = 'primary', icon, ...props }: ButtonProps) {
  return (
    <motion.button
      className={`button button-${variant} ${className}`.trim()}
      whileTap={{ scale: 0.97 }}
      {...props}
    >
      {icon}
      {children}
    </motion.button>
  )
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: ReactNode
  variant?: 'default' | 'gold' | 'success' | 'warning' | 'danger' | 'live'
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

export function Skeleton({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" {...props} />
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={25} strokeWidth={1.8} /></span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}