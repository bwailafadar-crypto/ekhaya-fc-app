import type { Fixture, NewsItem } from './types'

export const CLUB = 'Ekhaya FC'
export const HOME_GROUND = 'Chiwembe Stadium'

export const fixtures: Fixture[] = [
  {
    id: 'f1', competition: 'FDH Championship', date: '2026-09-13T14:30:00',
    venue: 'Chiwembe Stadium', home: 'Ekhaya FC', away: 'Civo United',
    status: 'finished', homeScore: 2, awayScore: 1,
  },
  {
    id: 'f2', competition: 'FDH Championship', date: '2026-09-20T14:30:00',
    venue: 'Kamuzu Stadium', home: 'Mighty Wanderers', away: 'Ekhaya FC',
    status: 'finished', homeScore: 1, awayScore: 1,
  },
  {
    id: 'f3', competition: 'FDH Championship', date: '2026-10-04T14:30:00',
    venue: 'Chiwembe Stadium', home: 'Ekhaya FC', away: 'Dedza Dynamos',
    status: 'upcoming',
  },
  {
    id: 'f4', competition: 'FDH Championship', date: '2026-10-11T14:30:00',
    venue: 'Karonga Stadium', home: 'Karonga United', away: 'Ekhaya FC',
    status: 'upcoming',
  },
]

export const news: NewsItem[] = [
  {
    id: 'n1', category: 'Match', publishedDate: '2026-09-21',
    title: 'Hard-earned point on the road',
    summary: 'The team battled to a 1-1 draw away from home.',
    body: 'The team battled to a 1-1 draw away from home.', coverImage: '', featured: false, status: 'published',
  },
  {
    id: 'n2', category: 'Club', publishedDate: '2026-09-18',
    title: 'Fan membership registration now open',
    summary: 'Sign up to get your digital membership card and exclusive benefits.',
    body: 'Sign up to get your digital membership card and exclusive benefits.', coverImage: '', featured: false, status: 'published',
  },
  {
    id: 'n3', category: 'Community', publishedDate: '2026-09-15',
    title: 'Players visit local schools',
    summary: 'Squad members spent the afternoon coaching young players in Blantyre.',
    body: 'Squad members spent the afternoon coaching young players in Blantyre.', coverImage: '', featured: false, status: 'published',
  },
]