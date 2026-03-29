import { Link, Route, Routes } from 'react-router-dom';
import { ReplayPage } from './pages/ReplayPage';
import { SearchPage } from './pages/SearchPage';

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">RRWeb BigQuery Replay</p>
          <h1>Session Explorer</h1>
        </div>
        <Link className="header-link" to="/">
          Search sessions
        </Link>
      </header>

      <Routes>
        <Route element={<SearchPage />} path="/" />
        <Route element={<ReplayPage />} path="/sessions/:sessionId" />
      </Routes>
    </div>
  );
}
