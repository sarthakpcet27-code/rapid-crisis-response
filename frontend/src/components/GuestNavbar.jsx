// frontend/src/components/GuestNavbar.jsx
// FIXES:
//   Bug 3: New SVG emergency logo (pulse wave + cross) — readable on dark bg
//   Bug 4: 🚪 emoji removed from Sign out button

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { logoutGuest } from '../firebase';
import toast from 'react-hot-toast';

// ── RespondAI emergency SVG logo ──────────────────────────────
// Pulse cross on dark background — minimal, high-contrast, unique
const RespondAILogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="RespondAI logo">
    {/* Red rounded-square background */}
    <rect width="32" height="32" rx="8" fill="#E24B4A"/>
    {/* White ECG / pulse cross shape */}
    {/* Vertical bar of cross */}
    <rect x="14" y="6" width="4" height="20" rx="2" fill="white"/>
    {/* Horizontal bar of cross */}
    <rect x="6" y="14" width="20" height="4" rx="2" fill="white"/>
    {/* Small pulse wave dot — top-right accent */}
    <circle cx="24" cy="8" r="2.5" fill="white" opacity="0.7"/>
  </svg>
);

const NAV_LINKS = [
  { path:'/',             label:'SOS',         icon:'🆘' },
  { path:'/sos-history',  label:'SOS History', icon:'📋' },
  { path:'/chat-history', label:'Chats',       icon:'💬' },
  { path:'/profile',      label:'Profile',     icon:'👤' },
];

export default function GuestNavbar({ user }) {
  const location  = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile,   setIsMobile]   = useState(window.innerWidth < 768);
  const drawerRef = useRef(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setDrawerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [drawerOpen]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const handleLogout = async () => {
    setDrawerOpen(false);
    await logoutGuest();
    toast.success('Signed out safely');
  };

  const isActive = (path) => location.pathname === path;
  const displayName  = user?.displayName || user?.email?.split('@')[0] || 'Guest';
  const avatarLetter = displayName[0]?.toUpperCase() || 'G';

  return (
    <>
      <motion.nav
        initial={{ y:-60, opacity:0 }}
        animate={{ y:0, opacity:1 }}
        style={{
          position:'sticky', top:0, zIndex:200,
          background:'rgba(10,10,15,0.97)',
          backdropFilter:'blur(20px)',
          borderBottom:'1px solid rgba(255,255,255,0.06)',
          height:'56px', display:'flex', alignItems:'center',
          padding:'0 16px', justifyContent:'space-between',
        }}
      >
        {/* ── Logo — Bug 3 fixed: SVG instead of emoji ── */}
        <Link to="/" style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:'9px', flexShrink:0 }}>
          <RespondAILogo size={28} />
          <span style={{ fontFamily:"'Bebas Neue',cursive", fontSize:'20px', letterSpacing:'2px', color:'#fff' }}>
            Respond<span style={{ color:'#E24B4A' }}>AI</span>
          </span>
        </Link>

        {/* ── Desktop: horizontal links ── */}
        {!isMobile && (
          <div style={{ display:'flex', gap:'3px', alignItems:'center' }}>
            {NAV_LINKS.map(link => (
              <Link key={link.path} to={link.path} style={{ textDecoration:'none' }}>
                <motion.div whileTap={{ scale:0.96 }} style={{
                  padding:'6px 12px', borderRadius:'9px', fontSize:'12px', fontWeight:500,
                  fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', transition:'all 0.15s',
                  background: isActive(link.path) ? 'rgba(226,75,74,0.15)' : 'transparent',
                  color:       isActive(link.path) ? '#F87171' : '#6B7280',
                  border:      isActive(link.path) ? '1px solid rgba(226,75,74,0.3)' : '1px solid transparent',
                }}>
                  <span style={{ fontSize:'13px' }}>{link.icon}</span>
                  {link.label}
                </motion.div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Desktop: user + sign out ── */}
        {!isMobile && (
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
              <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'rgba(226,75,74,0.15)', border:'1px solid rgba(226,75,74,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:600, color:'#F87171' }}>
                {avatarLetter}
              </div>
              <span style={{ fontSize:'12px', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", maxWidth:'90px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {displayName}
              </span>
            </div>
            {/* Bug 4 fixed: no emoji, just text */}
            <button onClick={handleLogout} style={{ padding:'5px 10px', background:'transparent', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'8px', color:'#6B7280', fontSize:'11px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Sign out
            </button>
          </div>
        )}

        {/* ── Mobile: SOS pill + hamburger ── */}
        {isMobile && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <Link to="/" style={{ textDecoration:'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'5px', padding:'7px 14px', borderRadius:'20px', background:isActive('/')?'#E24B4A':'rgba(226,75,74,0.15)', border:'1px solid rgba(226,75,74,0.4)', fontSize:'12px', fontWeight:700, color:'#fff', fontFamily:"'DM Sans',sans-serif" }}>
                🆘 SOS
              </div>
            </Link>
            <button onClick={() => setDrawerOpen(v=>!v)} aria-label="Open menu" aria-expanded={drawerOpen}
              style={{ width:'44px', height:'44px', borderRadius:'10px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'5px', padding:'0', flexShrink:0 }}>
              <motion.span animate={{ rotate:drawerOpen?45:0, y:drawerOpen?6:0 }} transition={{ duration:0.2 }}
                style={{ display:'block', width:'18px', height:'2px', background:'#E5E7EB', borderRadius:'2px', transformOrigin:'center' }} />
              <motion.span animate={{ opacity:drawerOpen?0:1, scaleX:drawerOpen?0:1 }} transition={{ duration:0.15 }}
                style={{ display:'block', width:'18px', height:'2px', background:'#E5E7EB', borderRadius:'2px' }} />
              <motion.span animate={{ rotate:drawerOpen?-45:0, y:drawerOpen?-6:0 }} transition={{ duration:0.2 }}
                style={{ display:'block', width:'18px', height:'2px', background:'#E5E7EB', borderRadius:'2px', transformOrigin:'center' }} />
            </button>
          </div>
        )}
      </motion.nav>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {drawerOpen && isMobile && (
          <>
            <motion.div key="overlay" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.25 }}
              onClick={() => setDrawerOpen(false)}
              style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(3px)' }} />

            <motion.div key="drawer" ref={drawerRef}
              initial={{ x:'100%' }} animate={{ x:0 }} exit={{ x:'100%' }}
              transition={{ type:'spring', damping:28, stiffness:300 }}
              style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(80vw, 280px)', zIndex:400, background:'rgba(12,12,20,0.98)', backdropFilter:'blur(20px)', borderLeft:'1px solid rgba(255,255,255,0.08)', display:'flex', flexDirection:'column', overflowY:'auto' }}>

              {/* Drawer header with new logo */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'9px' }}>
                  <RespondAILogo size={24} />
                  <span style={{ fontFamily:"'Bebas Neue',cursive", fontSize:'18px', letterSpacing:'2px', color:'#fff' }}>
                    Respond<span style={{ color:'#E24B4A' }}>AI</span>
                  </span>
                </div>
                <button onClick={() => setDrawerOpen(false)} aria-label="Close menu"
                  style={{ width:'36px', height:'36px', borderRadius:'50%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', color:'#9CA3AF', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  ✕
                </button>
              </div>

              {/* User info */}
              <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'rgba(226,75,74,0.15)', border:'1px solid rgba(226,75,74,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', fontWeight:600, color:'#F87171', flexShrink:0 }}>
                  {avatarLetter}
                </div>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:'14px', fontWeight:500, color:'#E5E7EB', fontFamily:"'DM Sans',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {displayName}
                  </p>
                  <p style={{ margin:0, fontSize:'11px', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {user?.email}
                  </p>
                </div>
              </div>

              {/* Nav links */}
              <div style={{ padding:'12px', flex:1 }}>
                {NAV_LINKS.map((link, i) => {
                  const active = isActive(link.path);
                  return (
                    <React.Fragment key={link.path}>
                      {i === 1 && <div style={{ height:'1px', background:'rgba(255,255,255,0.06)', margin:'8px 0' }} />}
                      <Link to={link.path} style={{ textDecoration:'none', display:'block' }}>
                        <motion.div whileTap={{ scale:0.97 }} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'13px 16px', borderRadius:'12px', minHeight:'48px', marginBottom:'4px', transition:'all 0.15s', cursor:'pointer',
                          background: active ? 'rgba(226,75,74,0.12)' : 'transparent',
                          border:     active ? '1px solid rgba(226,75,74,0.25)' : '1px solid transparent',
                        }}>
                          <span style={{ fontSize:'20px', flexShrink:0 }}>{link.icon}</span>
                          <span style={{ fontSize:'16px', fontWeight:active?600:400, color:active?'#F87171':'#D1D5DB', fontFamily:"'DM Sans',sans-serif" }}>
                            {link.label}
                          </span>
                          {active && <div style={{ marginLeft:'auto', width:'6px', height:'6px', borderRadius:'50%', background:'#E24B4A' }} />}
                        </motion.div>
                      </Link>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Sign out — Bug 4 fixed: NO 🚪 emoji, text only */}
              <div style={{ padding:'12px 12px 28px' }}>
                <div style={{ height:'1px', background:'rgba(255,255,255,0.06)', marginBottom:'12px' }} />
                <motion.button whileTap={{ scale:0.97 }} onClick={handleLogout}
                  style={{ width:'100%', minHeight:'48px', display:'flex', alignItems:'center', justifyContent:'center', padding:'13px 16px', borderRadius:'12px', background:'rgba(226,75,74,0.08)', border:'1px solid rgba(226,75,74,0.2)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {/* No emoji here — just text as requested */}
                  <span style={{ fontSize:'16px', color:'#F87171', fontWeight:500 }}>Sign out</span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}