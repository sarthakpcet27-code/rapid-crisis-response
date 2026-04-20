import React from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { logoutGuest } from './firebase';
import toast from 'react-hot-toast';

export default function Navbar({ user }) {
  const location = useLocation();

  const links = [
    { path: '/',          label: 'SOS',       icon: '🆘' },
    { path: '/dashboard', label: 'Dashboard', icon: '📡' },
    { path: '/simulate',  label: 'Simulate',  icon: '🎬' },
    { path: '/profile',   label: 'Profile',   icon: '👤' },
  ];

  const handleLogout = async () => {
    await logoutGuest();
    toast.success('Signed out');
  };

  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,10,15,0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '56px',
      }}
    >
      {/* Logo */}
      <Link to="/" style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:'8px' }}>
        <div style={{ width:'28px', height:'28px', borderRadius:'7px', background:'#E24B4A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}>🆘</div>
        <span style={{ fontFamily:"'Bebas Neue', cursive", fontSize:'20px', letterSpacing:'2px', color:'#fff' }}>
          Respond<span style={{ color:'#E24B4A' }}>AI</span>
        </span>
      </Link>

      {/* Nav links */}
      <div style={{ display:'flex', gap:'3px', alignItems:'center' }}>
        {links.map(link => {
          const isActive = location.pathname === link.path;
          return (
            <Link key={link.path} to={link.path} style={{ textDecoration:'none' }}>
              <motion.div whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }} style={{
                padding: '6px 12px', borderRadius:'9px', fontSize:'12px', fontWeight:500,
                color:       isActive ? '#fff'    : '#6B7280',
                background:  isActive ? 'rgba(226,75,74,0.15)' : 'transparent',
                border:      isActive ? '1px solid rgba(226,75,74,0.3)' : '1px solid transparent',
                cursor: 'pointer', display:'flex', alignItems:'center', gap:'5px', transition:'all 0.15s',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                <span style={{ fontSize:'13px' }}>{link.icon}</span>
                {link.label}
              </motion.div>
            </Link>
          );
        })}
      </div>

      {/* User + sign out */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
        {user && (
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'rgba(226,75,74,0.15)', border:'1px solid rgba(226,75,74,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:500, color:'#F87171', fontFamily:"'DM Sans', sans-serif" }}>
              {(user.displayName || user.email || 'G')[0].toUpperCase()}
            </div>
            <span style={{ fontSize:'12px', color:'#6B7280', fontFamily:"'DM Sans', sans-serif", maxWidth:'80px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user.displayName || user.email?.split('@')[0]}
            </span>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
          <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#10B981', boxShadow:'0 0 5px #10B981' }} />
          <span style={{ fontSize:'11px', color:'#6B7280', fontFamily:"'DM Sans', sans-serif" }}>Online</span>
        </div>
      </div>
    </motion.nav>
  );
}