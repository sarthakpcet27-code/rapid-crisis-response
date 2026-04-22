import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { onAuthChange, getGuestProfile } from './firebase';

// ✅ ADD THESE IMPORTS (NEW)
import { startSyncListener, syncOfflineData } from './utils/sync-manager';
import { initDB } from './utils/db';

// ── Shared pages
import AuthPage from './pages/Authpage';

// ── Guest pages
import SOSPage          from './pages/SOSPage';
import GuestProfilePage from './pages/GuestProfilePage';
import SOSHistoryPage   from './pages/SOSHistoryPage';
import ChatHistoryPage  from './pages/ChatHistoryPage';

// ── Admin pages
import SimulatePage              from './pages/SimulatePage';
import DashboardWithSOSListener  from './components/DashboardWithSOSListener';

// ── Navbars
import GuestNavbar from './components/GuestNavbar';
import AdminNavbar from './components/AdminNavbar';

// ── Admin email list — add your email here to get admin access
const ADMIN_EMAILS = [
  'admin@respondai.com',
  'sarthakpcet27@gmail.com',
];

export default function App() {
  const [user, setUser] = useState(undefined);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ ADD THIS NEW useEffect (FIRST useEffect - runs once on mount)
  useEffect(() => {
    const initOfflineSync = async () => {
      try {
        console.log('[App] Initializing offline sync...');
        
        // Initialize IndexedDB
        await initDB();
        console.log('[App] ✅ IndexedDB initialized');

        // Start listening for online/offline events
        startSyncListener();
        console.log('[App] ✅ Sync listener started');

        // If already online, sync immediately
        if (navigator.onLine) {
          setTimeout(async () => {
            console.log('[App] App loaded online - checking for pending offline data...');
            await syncOfflineData();
          }, 2000);
        }
      } catch (err) {
        console.error('[App] ❌ Failed to initialize offline sync:', err);
      }
    };

    initOfflineSync();
  }, []); // Empty dependency array - runs only once on mount

  // ✅ KEEP YOUR EXISTING AUTH useEffect (SECOND useEffect)
  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      if (!u) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }
      setUser(u);

      // Check role: email in admin list OR role field in database = 'admin'/'staff'
      if (ADMIN_EMAILS.includes(u.email)) {
        setRole('admin');
      } else {
        try {
          const profile = await getGuestProfile(u.uid);
          const dbRole = profile?.role || 'guest';
          setRole(dbRole === 'admin' || dbRole === 'staff' ? 'admin' : 'guest');
        } catch {
          setRole('guest');
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const isAdmin = role === 'admin';
  const isGuest = role === 'guest';

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid #2A2A3A', borderTopColor: '#E24B4A', animation: 'spin 1s linear infinite' }} />
      <p style={{ color: '#6B7280', fontSize: '13px', fontFamily: "'DM Sans',sans-serif" }}>Loading RespondAI...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{
        style: { background: '#1A1A26', color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '14px', fontFamily: "'DM Sans',sans-serif" },
        success: { iconTheme: { primary: '#10B981', secondary: '#0A0A0F' } },
        error: { iconTheme: { primary: '#E24B4A', secondary: '#0A0A0F' } },
      }} />

      {/* Show correct navbar based on role */}
      {user && isGuest && <GuestNavbar user={user} />}
      {user && isAdmin && <AdminNavbar user={user} />}

      <Routes>
        {/* ── Public ── */}
        <Route path="/auth" element={
          !user ? <AuthPage /> : <Navigate to="/" replace />
        } />

        {/* ── Guest routes ── */}
        <Route path="/" element={
          !user ? <Navigate to="/auth" replace />
            : isAdmin ? <Navigate to="/dashboard" replace />
            : <SOSPage />
        } />
        <Route path="/profile" element={
          !user ? <Navigate to="/auth" replace />
            : isAdmin ? <Navigate to="/dashboard" replace />
            : <GuestProfilePage />
        } />
        <Route path="/sos-history" element={
          !user ? <Navigate to="/auth" replace />
            : isAdmin ? <Navigate to="/dashboard" replace />
            : <SOSHistoryPage />
        } />
        <Route path="/chat-history" element={
          !user ? <Navigate to="/auth" replace />
            : isAdmin ? <Navigate to="/dashboard" replace />
            : <ChatHistoryPage />
        } />

        {/* ── Admin routes ── */}
        <Route path="/dashboard" element={
          !user ? <Navigate to="/auth" replace />
            : isGuest ? <Navigate to="/" replace />
            : <DashboardWithSOSListener />
        } />
        <Route path="/simulate" element={
          !user ? <Navigate to="/auth" replace />
            : isGuest ? <Navigate to="/" replace />
            : <SimulatePage />
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={user ? '/' : '/auth'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}