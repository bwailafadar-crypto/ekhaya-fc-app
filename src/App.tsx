import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Fixtures from './pages/Fixtures'
import Results from './pages/Results'
import LeagueTable from './pages/LeagueTable'
import LiveMatch from './pages/LiveMatch'
import Squad from './pages/Squad'
import News from './pages/News'
import FanZone from './pages/FanZone'
import Membership from './pages/Membership'
import Profile from './pages/Profile'
import More from './pages/More'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/fixtures" element={<Fixtures />} />
          <Route path="/results" element={<Results />} />
          <Route path="/table" element={<LeagueTable />} />
          <Route path="/live" element={<LiveMatch />} />
          <Route path="/squad" element={<Squad />} />
          <Route path="/news" element={<News />} />
          <Route path="/fanzone" element={<FanZone />} />
          <Route path="/membership" element={<Membership />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/more" element={<More />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
