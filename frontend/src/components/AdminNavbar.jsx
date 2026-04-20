import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { logoutGuest } from '../firebase';
import toast from 'react-hot-toast';

// Custom hook for responsive mobile detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};

export default function AdminNavbar({ user }) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);

  const links = [
    { path:'/dashboard', label:'Dashboard', icon:'📡' },
    { path:'/simulate',  label:'Simulate',  icon:'🎬' },
  ];

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    setDrawerOpen(false);
    await logoutGuest();
    toast.success('Signed out');
  };

  const currentLetter = (user?.displayName || user?.email || 'A')[0].toUpperCase();
  const currentName = user?.displayName || user?.email?.split('@')[0];

  return (
    <>
      <motion.nav
        initial={{ y:-60, opacity:0 }}
        animate={{ y:0, opacity:1 }}
        style={{
          position:'sticky', top:0, zIndex:100,
          background:'rgba(10,10,15,0.95)',
          backdropFilter:'blur(20px)',
          borderBottom:'1px solid rgba(139,92,246,0.2)',
          height: isMobile ? '48px' : '56px',
        }}
      >
        <div style={{ padding: isMobile ? '0 12px' : '0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:'100%' }}>
          {/* Logo with STAFF badge */}
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <Link to="/dashboard" style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:isMobile ? '24px' : '28px', height:isMobile ? '24px' : '28px', borderRadius:'7px', background:'#8B5CF6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:isMobile ? '12px':'14px' }}>📡</div>
              <span style={{ fontFamily:"'Bebas Neue',cursive", fontSize:isMobile ? '18px':'20px', letterSpacing:'2px', color:'#fff' }}>
                Respond<span style={{ color:'#8B5CF6' }}>AI</span>
              </span>
            </Link>
            {!isMobile && (
              <span style={{ fontSize:'10px', background:'rgba(139,92,246,0.15)', color:'#C4B5FD', padding:'2px 8px', borderRadius:'8px', border:'1px solid rgba(139,92,246,0.3)', fontWeight:600, letterSpacing:'0.5px' }}>
                STAFF
              </span>
            )}
          </div>

          {!isMobile ? (
            <>
              {/* Admin links Desktop */}
              <div style={{ display:'flex', gap:'3px' }}>
                {links.map(link => {
                  const active = location.pathname === link.path;
                  return (
                    <Link key={link.path} to={link.path} style={{ textDecoration:'none' }}>
                      <motion.div whileTap={{ scale:0.96 }} style={{
                        padding:'6px 12px', borderRadius:'9px',
                        fontSize:'12px', fontWeight:500,
                        fontFamily:"'DM Sans',sans-serif",
                        display:'flex', alignItems:'center', gap:'5px',
                        transition:'all 0.15s',
                        background: active ? 'rgba(139,92,246,0.15)' : 'transparent',
                        color:       active ? '#C4B5FD' : '#6B7280',
                        border:      active ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                        cursor:'pointer',
                      }}>
                        <span style={{ fontSize:'13px' }}>{link.icon}</span>
                        {link.label}
                      </motion.div>
                    </Link>
                  );
                })}
              </div>

              {/* Admin user + logout */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'rgba(139,92,246,0.15)', border:'1px solid rgba(139,92,246,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:600, color:'#C4B5FD' }}>
                    {currentLetter}
                  </div>
                  <span style={{ fontSize:'12px', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", maxWidth:'90px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {currentName}
                  </span>
                </div>
                <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#10B981', boxShadow:'0 0 5px #10B981' }} />
                <button onClick={handleLogout} style={{ padding:'5px 10px', background:'transparent', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'8px', color:'#6B7280', fontSize:'11px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            /* Hamburger Menu Button */
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'9px', background:'rgba(139,92,246,0.15)', color:'#C4B5FD', padding:'2px 6px', borderRadius:'6px', border:'1px solid rgba(139,92,246,0.3)', fontWeight:700 }}>
                STAFF
              </span>
              <motion.button
                onClick={() => setDrawerOpen(prev => !prev)}
                whileTap={{ scale: 0.88 }}
                style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '3px',
                  padding: 0, WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{ width: '14px', height: '1.5px', background: '#E5E7EB', borderRadius: '2px' }} />
                <div style={{ width: '14px', height: '1.5px', background: '#E5E7EB', borderRadius: '2px' }} />
                <div style={{ width: '14px', height: '1.5px', background: '#E5E7EB', borderRadius: '2px' }} />
              </motion.button>
            </div>
          )}
        </div>
      </motion.nav>

      {/* DRAWER */}
      <AnimatePresence mode="wait">
        {drawerOpen && isMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: '100vw', maxWidth: '320px',
                zIndex: 400, background: 'rgba(12,12,20,0.98)',
                borderLeft: '1px solid rgba(139,92,246,0.2)', display: 'flex', flexDirection: 'column'
              }}
            >
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '14px', color: '#fff' }}>Admin Menu</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, color: '#C4B5FD' }}>
                  {currentLetter}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 500, color: '#E5E7EB', fontFamily: "'DM Sans', sans-serif" }}>{currentName}</p>
                </div>
              </div>

              <div style={{ flex: 1, padding: '8px' }}>
                {links.map(link => {
                  const active = location.pathname === link.path;
                  return (
                    <Link key={link.path} to={link.path} style={{ textDecoration: 'none', display: 'block' }}>
                      <motion.div whileTap={{ scale: 0.96 }} style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '10px',
                        marginBottom: '4px', background: active ? 'rgba(139,92,246,0.12)' : 'transparent',
                        border: active ? '1px solid rgba(139,92,246,0.25)' : '1px solid transparent',
                      }}>
                        <span style={{ fontSize: '20px' }}>{link.icon}</span>
                        <span style={{ fontSize: '16px', fontWeight: active ? 600 : 400, color: active ? '#C4B5FD' : '#D1D5DB', fontFamily: "'DM Sans', sans-serif" }}>{link.label}</span>
                      </motion.div>
                    </Link>
                  );
                })}
              </div>

              <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <motion.button onClick={handleLogout} whileTap={{ scale: 0.96 }} style={{ width: '100%', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '10px', background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.2)', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  <span style={{ fontSize: '18px' }}>🚪</span>
                  <span style={{ fontSize: '16px', color: '#F87171', fontWeight: 500 }}>Sign out</span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}