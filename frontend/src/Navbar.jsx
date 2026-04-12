import { useLocation, Link } from 'react-router-dom';

export default function Navbar() {
  const { pathname } = useLocation();
  return (
    <nav className="navbar">
      <span className="navbar-logo">⚡ RespondAI</span>
      <div className="navbar-links">
        <Link to="/"          className={`nav-btn ${pathname==='/'          ? 'active':''}`}>🆘 SOS</Link>
        <Link to="/dashboard" className={`nav-btn ${pathname==='/dashboard' ? 'active':''}`}>📊 Dashboard</Link>
        <Link to="/simulate"  className={`nav-btn ${pathname==='/simulate'  ? 'active':''}`}>🎬 Simulate</Link>
      </div>
    </nav>
  );
}