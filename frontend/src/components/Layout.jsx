import { Link, NavLink, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Spinner } from './ui.jsx';

const navCls = ({ isActive }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-soft text-brand-dark' : 'text-muted hover:text-ink'}`;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="font-display text-xl font-bold text-brand">EventHub</Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            <NavLink to="/" end className={navCls}>Discover</NavLink>
            {user?.role === 'attendee' && <NavLink to="/bookings" className={navCls}>My bookings</NavLink>}
            {user?.role === 'organizer' && (
              <>
                <NavLink to="/organizer" end className={navCls}>My events</NavLink>
                <NavLink to="/organizer/events/new" className={navCls}>Create event</NavLink>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="hidden text-muted sm:inline">
                  {user.name} <span className="rounded bg-paper px-1.5 py-0.5 text-xs">{user.role}</span>
                </span>
                <button onClick={() => { logout(); navigate('/'); }} className="font-semibold text-brand hover:underline">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
                <Link to="/register" className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-dark">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8"><Outlet /></main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        EventHub demo · Bookings are reservations only — no payment is taken.
      </footer>
    </div>
  );
}


export function RequireAuth({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (role && user.role !== role) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-2xl font-bold">This page is for {role}s</h1>
        <p className="mt-2 text-muted">You are signed in as {user.role}. Sign in with a {role} account to continue.</p>
      </div>
    );
  }
  return children;
}
