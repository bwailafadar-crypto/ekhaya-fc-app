// A drawn Ekhaya shirt, used when a product has no photo and for the
// name-and-number preview (the back of the shirt).
import type { ShopProduct } from '../utils/shop'

const COLOURS: Record<NonNullable<ShopProduct['colour']>, { body: string; trim: string; text: string }> = {
  home: { body: '#C9A227', trim: '#0E0E0E', text: '#0E0E0E' },
  away: { body: '#0E0E0E', trim: '#C9A227', text: '#E8C95A' },
  third: { body: '#F6F5F1', trim: '#C9A227', text: '#0E0E0E' },
  training: { body: '#1C1C1C', trim: '#E8C95A', text: '#E8C95A' },
  purple: { body: '#5B21B6', trim: '#F6F5F1', text: '#F6F5F1' },
}

export default function ShirtArt({ colour = 'home', back = false, name = '', number = '', className = '' }: { colour?: ShopProduct['colour']; back?: boolean; name?: string; number?: string; className?: string }) {
  const c = COLOURS[colour ?? 'home']
  const label = name.toUpperCase().slice(0, 12)
  return <svg className={`shirt-art ${className}`} viewBox="0 0 200 200" role="img" aria-label={back ? `Shirt back: ${label} ${number}` : 'Ekhaya shirt'}>
    <path d="M62 22 L40 30 L10 62 L32 88 L48 76 L48 182 L152 182 L152 76 L168 88 L190 62 L160 30 L138 22 Q100 44 62 22 Z" fill={c.body} stroke={c.trim} strokeWidth="3" strokeLinejoin="round" />
    <path d="M10 62 L32 88 M190 62 L168 88" stroke={c.trim} strokeWidth="7" />
    {back
      ? <>
        <path d="M70 24 Q100 34 130 24" fill="none" stroke={c.trim} strokeWidth="5" />
        <text x="100" y="66" textAnchor="middle" fill={c.text} fontFamily="Oswald, Arial Narrow, sans-serif" fontWeight="700" fontSize={label.length > 9 ? 13 : 16} letterSpacing="1.5">{label}</text>
        <text x="100" y="140" textAnchor="middle" fill={c.text} fontFamily="Oswald, Arial Narrow, sans-serif" fontWeight="700" fontSize="68">{number}</text>
      </>
      : <>
        <path d="M70 24 Q100 52 130 24" fill="none" stroke={c.trim} strokeWidth="5" />
        <image href="./team-logos/ekhaya-fc.png" x="112" y="58" width="24" height="24" />
        <path d="M48 120 L152 120" stroke={c.trim} strokeWidth="2" opacity=".35" />
      </>}
  </svg>
}
