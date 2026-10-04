import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastKind } from './ToastContext'

type ToastMessage = { id: number; message: string; kind: ToastKind }

function Toast({ toast, dismiss }: { toast: ToastMessage; dismiss: () => void }) {
  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info

  return (
    <div
      className={`toast toast-${toast.kind}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={19} aria-hidden="true" />
      <span>{toast.message}</span>
      <button className="toast-dismiss" type="button" onClick={dismiss} aria-label="Dismiss notification">
        <X size={17} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const nextId = useRef(0)
  const dismiss = useCallback(() => setToast(null), [])
  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    nextId.current += 1
    setToast({ id: nextId.current, message, kind })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(dismiss, 3200)
    return () => window.clearTimeout(timeout)
  }, [toast, dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-region">
        {toast && <Toast key={toast.id} toast={toast} dismiss={dismiss} />}
      </div>
    </ToastContext.Provider>
  )
}