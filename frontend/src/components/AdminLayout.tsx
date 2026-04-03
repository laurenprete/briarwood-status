import { NavLink, Outlet } from 'react-router-dom'
import { logout } from '../auth'

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <nav className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight text-teal-400">
            <i className="fa-solid fa-signal mr-2" />
            Status Monitor
          </span>
          <div className="flex gap-1">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `rounded px-3 py-1.5 text-sm transition ${
                  isActive
                    ? 'bg-zinc-800 text-teal-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `rounded px-3 py-1.5 text-sm transition ${
                  isActive
                    ? 'bg-zinc-800 text-teal-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`
              }
            >
              Admin
            </NavLink>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <NavLink
              to="/"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              View Public Page &rarr;
            </NavLink>
            <button
              onClick={logout}
              className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
