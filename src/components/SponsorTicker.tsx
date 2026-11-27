// A continuous scrolling band of the club's sponsors, like a sports-news ticker.
const SPONSORS = [
  'Union Building Contractors',
  'Stevensons',
  'Enkosi',
  'Khomarys Security Systems',
  'Mkokomo',
  'DODA',
]

export default function SponsorTicker() {
  // The list is rendered twice back-to-back so the scroll loops seamlessly.
  const run = [...SPONSORS, ...SPONSORS]
  return (
    <section className="sponsor-ticker" aria-label="Our sponsors">
      <span className="sponsor-ticker-tag">Proud sponsors</span>
      <div className="sponsor-ticker-viewport">
        <div className="sponsor-ticker-track" aria-hidden="true">
          {run.map((name, index) => (
            <span className="sponsor-ticker-item" key={index}>
              <i className="sponsor-ticker-dot" />
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
