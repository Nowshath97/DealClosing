import React from 'react';
import { LogOut } from 'lucide-react';

export default function SideLayout({ children, navItems, user, onSignOut }) {
  const initials = user.name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <div className="app-shell shared-shell">
      <aside className="sidebar expanded-sidebar">
        <div className="sidebar-title"><span className="sidebar-logo">DC</span><span>Deal Closing</span></div>
        <div className="sidebar-nav">
          {navItems.map(({ label, icon: Icon, active, onClick }) => (
            <button key={label} className={`sidebar-nav-item ${active ? 'active' : ''}`} onClick={onClick}>
              <Icon size={18}/><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-copy"><strong>{user.name}</strong><span>{user.email}</span></div>
          <button className="sidebar-signout" title="Sign out" onClick={onSignOut}><LogOut size={17}/></button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
