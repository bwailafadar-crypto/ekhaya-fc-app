// A continuous scrolling band of the club's sponsor logos, like a sports-news ticker.
type Sponsor = { name: string; logo: string }

const SPONSORS: Sponsor[] = [
  { name: 'Union Building Contractors', logo: '/sponsors/union.png' },
  { name: 'Stevensons', logo: '/sponsors/stevensons.png' },
  { name: 'Enkosi', logo: '/sponsors/enkosi.png' },
  { name: 'Khomarys Security Systems', logo: '/sponsors/khomarys.png' },
  { name: 'Mkokomo', logo: '/sponsors/mkokomo.png' },
]

export default function SponsorTicker() {
  // The list is rendered twice back-to-back so the scroll loops seamlessly.
  const run = [...SPONSORS, ...SPONSORS]
  return (
    <section className="sponsor-ticker" aria-label="Our sponsors">
      <span className="sponsor-ticker-tag">Proud sponsors</span>
      <div className="sponsor-ticker-viewport">
        <div className="sponsor-ticker-track" aria-hidden="true">
          {run.map((sponsor, index) => (
            <span className="sponsor-ticker-item" key={index}>
              <img
                className="sponsor-ticker-logo"
                src={sponsor.logo}
                alt=""
                loading="lazy"
                draggable={false}
              />
            </span>
          ))}
        </div>
      </div>
      {/* Screen-reader list of sponsors (the scrolling track is decorative). */}
      <p className="sponsor-ticker-sr">
        Our sponsors: {SPONSORS.map((s) => s.name).join(', ')}.
      </p>
    </section>
  )
}
