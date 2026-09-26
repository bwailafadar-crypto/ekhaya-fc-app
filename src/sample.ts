import type { Fixture, NewsItem } from './types'

export const CLUB = 'Ekhaya FC'
export const HOME_GROUND = 'Chiwembe Stadium'

export const fixtures: Fixture[] = [
  {
    id: 'f1', competition: 'TNM Super League', date: '2026-09-13T14:30:00',
    venue: 'Chiwembe Stadium', home: 'Ekhaya FC', away: 'Civo United',
    status: 'finished', homeScore: 2, awayScore: 1,
  },
  {
    id: 'f2', competition: 'TNM Super League', date: '2026-09-20T14:30:00',
    venue: 'Kamuzu Stadium', home: 'Mighty Wanderers', away: 'Ekhaya FC',
    status: 'finished', homeScore: 1, awayScore: 1,
  },
  {
    id: 'f3', competition: 'TNM Super League', date: '2026-10-04T14:30:00',
    venue: 'Chiwembe Stadium', home: 'Ekhaya FC', away: 'Dedza Dynamos',
    status: 'upcoming',
  },
  {
    id: 'f4', competition: 'TNM Super League', date: '2026-10-11T14:30:00',
    venue: 'Karonga Stadium', home: 'Karonga United', away: 'Ekhaya FC',
    status: 'upcoming',
  },
]

export const news: NewsItem[] = [
  {
    id: 'n1', category: 'Match', date: '2026-09-21',
    title: 'Hard-earned point on the road',
    summary: 'The team battled to a 1-1 draw away from home.',
  },
  {
    id: 'n2', category: 'Club', date: '2026-09-18',
    title: 'Fan membership registration now open',
    summary: 'Sign up to get your digital membership card and exclusive benefits.',
  },
  {
    id: 'n3', category: 'Community', date: '2026-09-15',
    title: 'Players visit local schools',
    summary: 'Squad members spent the afternoon coaching young players in Blantyre.',
  },
]