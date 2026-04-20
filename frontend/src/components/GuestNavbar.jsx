// frontend/src/components/GuestNavbar.jsx
// UPDATED: Removed sticky, now fits inside container

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { logoutGuest } from '../firebase';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { path: '/', label: 'SOS', icon: '🆘' },
  { path: '/sos-history', label: 'SOS History', icon: '📋' },
  { path: '/chat-history', label: 'Chats', icon: '💬' },
  { path: '/profile', label: 'Profile', icon: '👤' },
];

// Custom hook for responsive mobile detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();

    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkMobile, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', checkMobile);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', checkMobile);
      clearTimeout(resizeTimeout);
    };
  }, []);

  return isMobile;
};

export default function GuestNavbar({ user }) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);

  // Close drawer when route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Close drawer on outside click
  useEffect(() => {
    if (!drawerOpen) return;

    const handleClickOutside = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setDrawerOpen(false);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [drawerOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [drawerOpen]);

  const handleLogout = async () => {
    setDrawerOpen(false);
    await logoutGuest();
    toast.success('Signed out safely');
  };

  const isActive = (path) => location.pathname === path;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Guest';
  const avatarLetter = (displayName[0] || 'G').toUpperCase();

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
          NAVBAR - PART OF CONTAINER (NOT STICKY)
      ═══════════════════════════════════════════════════════════════ */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'relative', // CHANGED FROM STICKY
          zIndex: 100,
          background: 'transparent',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          height: isMobile ? '48px' : '56px',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${isMobile ? '12px' : '16px'}`,
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          marginBottom: isMobile ? '8px' : '12px',
        }}
      >
        {/* LOGO - Responsive */}
        <Link
          to="/"
          style={{
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '6px' : '8px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: isMobile ? '24px' : '28px',
              height: isMobile ? '24px' : '28px',
              borderRadius: '6px',
              background: '#E24B4A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isMobile ? '12px' : '14px',
              flexShrink: 0,
              fontWeight: 'bold',
            }}
          >
            🆘
          </div>
          {!isMobile && (
            <span
              style={{
                fontFamily: "'Bebas Neue', cursive",
                fontSize: '18px',
                letterSpacing: '1.5px',
                color: '#fff',
                whiteSpace: 'nowrap',
              }}
            >
              Respond<span style={{ color: '#E24B4A' }}>AI</span>
            </span>
          )}
        </Link>

        {/* ─────────────────────────────────────────────────────
            DESKTOP MODE (≥768px)
        ───────────────────────────────────────────────────── */}
        {!isMobile && (
          <>
            {/* Horizontal Navigation Links */}
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
              {NAV_LINKS.map((link) => (
                <Link key={link.path} to={link.path} style={{ textDecoration: 'none' }}>
                  <motion.div
                    whileTap={{ scale: 0.96 }}
                    whileHover={{ backgroundColor: 'rgba(226,75,74,0.08)' }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '9px',
                      fontSize: '13px',
                      fontWeight: 500,
                      fontFamily: "'DM Sans', sans-serif",
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.15s ease',
                      cursor: 'pointer',
                      background: isActive(link.path)
                        ? 'rgba(226,75,74,0.15)'
                        : 'transparent',
                      color: isActive(link.path) ? '#F87171' : '#9CA3AF',
                      border: isActive(link.path)
                        ? '1px solid rgba(226,75,74,0.3)'
                        : '1px solid transparent',
                      userSelect: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>{link.icon}</span>
                    {link.label}
                  </motion.div>
                </Link>
              ))}
            </div>

            {/* User Profile & Sign Out */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(226,75,74,0.15)',
                    border: '1px solid rgba(226,75,74,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#F87171',
                    flexShrink: 0,
                  }}
                >
                  {avatarLetter}
                </div>
                <span
                  style={{
                    fontSize: '13px',
                    color: '#9CA3AF',
                    fontFamily: "'DM Sans', sans-serif",
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayName}
                </span>
              </div>
              <motion.button
                onClick={handleLogout}
                whileTap={{ scale: 0.95 }}
                whileHover={{ backgroundColor: 'rgba(226,75,74,0.1)' }}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  color: '#9CA3AF',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.2s ease',
                  WebkitTapHighlightColor: 'transparent',
                  fontWeight: 500,
                }}
              >
                Sign out
              </motion.button>
            </div>
          </>
        )}

        {/* ─────────────────────────────────────────────────────
            MOBILE MODE (<768px)
        ───────────────────────────────────────────────────── */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
            {/* SOS Quick Button */}
            <Link to="/" style={{ textDecoration: 'none' }}>
              <motion.div
                whileTap={{ scale: 0.93 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 10px',
                  borderRadius: '18px',
                  background: isActive('/') ? '#E24B4A' : 'rgba(226,75,74,0.15)',
                  border: '1px solid rgba(226,75,74,0.4)',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#fff',
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                  minHeight: '32px',
                  minWidth: '32px',
                  whiteSpace: 'nowrap',
                }}
              >
                🆘
              </motion.div>
            </Link>

            {/* Hamburger Menu Button */}
            <motion.button
              onClick={() => setDrawerOpen((prev) => !prev)}
              whileTap={{ scale: 0.88 }}
              aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={drawerOpen}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                padding: '0',
                WebkitTapHighlightColor: 'transparent',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
            >
              <motion.span
                animate={{ rotate: drawerOpen ? 45 : 0, y: drawerOpen ? 4.5 : 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: 'block',
                  width: '14px',
                  height: '1.5px',
                  background: '#E5E7EB',
                  borderRadius: '2px',
                  transformOrigin: 'center',
                }}
              />
              <motion.span
                animate={{ opacity: drawerOpen ? 0 : 1, scaleX: drawerOpen ? 0.7 : 1 }}
                transition={{ duration: 0.15 }}
                style={{
                  display: 'block',
                  width: '14px',
                  height: '1.5px',
                  background: '#E5E7EB',
                  borderRadius: '2px',
                }}
              />
              <motion.span
                animate={{ rotate: drawerOpen ? -45 : 0, y: drawerOpen ? -4.5 : 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: 'block',
                  width: '14px',
                  height: '1.5px',
                  background: '#E5E7EB',
                  borderRadius: '2px',
                  transformOrigin: 'center',
                }}
              />
            </motion.button>
          </div>
        )}
      </motion.nav>

      {/* ═══════════════════════════════════════════════════════════════
          MOBILE DRAWER - Only shows on mobile
      ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {drawerOpen && isMobile && (
          <>
            {/* Overlay Backdrop */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 300,
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
              }}
            />

            {/* Drawer Panel */}
            <motion.div
              key="drawer"
              ref={drawerRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                maxWidth: '320px',
                zIndex: 400,
                background: 'rgba(12,12,20,0.98)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderLeft: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                WebkitOverscrollBehavior: 'contain',
                boxSizing: 'border-box',
              }}
            >
              {/* Drawer Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Bebas Neue', cursive",
                    fontSize: '14px',
                    letterSpacing: '1px',
                    color: '#fff',
                  }}
                >
                  Menu
                </span>
              </div>

              {/* User Info Section */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'rgba(226,75,74,0.15)',
                    border: '1px solid rgba(226,75,74,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#F87171',
                    flexShrink: 0,
                  }}
                >
                  {avatarLetter}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      margin: '0 0 2px 0',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#E5E7EB',
                      fontFamily: "'DM Sans', sans-serif",
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayName}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '10px',
                      color: '#6B7280',
                      fontFamily: "'DM Sans', sans-serif",
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user?.email}
                  </p>
                </div>
              </div>

              {/* Navigation Links */}
              <div style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
                {NAV_LINKS.map((link, idx) => {
                  const active = isActive(link.path);
                  return (
                    <React.Fragment key={link.path}>
                      {idx === 1 && (
                        <div
                          style={{
                            height: '1px',
                            background: 'rgba(255,255,255,0.06)',
                            margin: '6px 0',
                          }}
                        />
                      )}
                      <Link
                        to={link.path}
                        style={{ textDecoration: 'none', display: 'block' }}
                      >
                        <motion.div
                          whileTap={{ scale: 0.96 }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '14px 14px',
                            borderRadius: '10px',
                            minHeight: '48px',
                            marginBottom: '4px',
                            background: active
                              ? 'rgba(226,75,74,0.12)'
                              : 'transparent',
                            border: active
                              ? '1px solid rgba(226,75,74,0.25)'
                              : '1px solid transparent',
                            cursor: 'pointer',
                            userSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span style={{ fontSize: '20px', flexShrink: 0 }}>
                            {link.icon}
                          </span>
                          <span
                            style={{
                              fontSize: '16px',
                              fontWeight: active ? 600 : 400,
                              color: active ? '#F87171' : '#D1D5DB',
                              fontFamily: "'DM Sans', sans-serif",
                              flex: 1,
                            }}
                          >
                            {link.label}
                          </span>
                          {active && (
                            <div
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#E24B4A',
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </motion.div>
                      </Link>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Sign Out Button */}
              <div
                style={{
                  padding: '12px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}
              >
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'rgba(226,75,74,0.1)',
                    border: '1px solid rgba(226,75,74,0.2)',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>🚪</span>
                  <span
                    style={{
                      fontSize: '16px',
                      color: '#F87171',
                      fontWeight: 500,
                    }}
                  >
                    Sign out
                  </span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}