// frontend/src/pages/GuestProfilePage.jsx — mobile-responsive

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { auth, getGuestProfile, updateGuestProfile, logoutGuest } from '../firebase';
import { useMobile } from '../utils/useMobile';

export default function GuestProfilePage() {
  const isMobile = useMobile();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    getGuestProfile(user.uid).then(p => {
      setProfile(p);
      setForm({ name: p?.name || user.displayName || '', phone: p?.phone || '' });
      setLoading(false);
    });
  }, [user]);

  const saveProfile = async () => {
    if (!form.name.trim()) { toast.error('Name cannot be empty'); return; }
    try {
      await updateGuestProfile(user.uid, { name: form.name, phone: form.phone });
      setProfile(p => ({ ...p, ...form }));
      setEditing(false);
      toast.success('Profile updated');
    } catch { toast.error('Update failed'); }
  };

  const handleLogout = async () => {
    await logoutGuest();
    toast.success('Signed out safely');
  };

  const inputStyle = {
    width: '100%', padding: '13px 14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', color: '#E5E7EB', fontSize: '16px', outline: 'none',
    fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box',
  };

  const cardStyle = {
    background: 'rgba(26,26,38,0.8)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '16px', padding: isMobile ? '16px' : '20px', marginBottom: '12px',
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{ width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #2A2A3A', borderTopColor: '#E24B4A' }} />
    </div>
  );

  const displayName = profile?.name || user?.displayName || 'Guest';

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', padding: isMobile ? '16px' : '20px' }}>
      <div style={{ maxWidth: '460px', margin: '0 auto' }}>

        {/* Header */}
        <motion.div initial={{ y: -15, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ fontFamily: "'Bebas Neue',cursive", fontSize: isMobile ? '24px' : '28px', letterSpacing: '2px', color: '#fff', margin: 0 }}>
            My Profile
          </h1>
          <button onClick={handleLogout} style={{ padding: isMobile ? '9px 16px' : '7px 14px', background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.25)', borderRadius: '10px', color: '#F87171', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", minHeight: '44px' }}>
            Sign Out
          </button>
        </motion.div>

        {/* Avatar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ width: isMobile ? '72px' : '72px', height: isMobile ? '72px' : '72px', borderRadius: '50%', background: 'rgba(226,75,74,0.15)', border: '2px solid rgba(226,75,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: isMobile ? '28px' : '26px', fontWeight: 600, color: '#F87171', fontFamily: "'DM Sans',sans-serif" }}>
            {displayName[0].toUpperCase()}
          </div>
          <p style={{ color: '#E5E7EB', fontSize: isMobile ? '17px' : '16px', fontWeight: 500, margin: '0 0 3px', fontFamily: "'DM Sans',sans-serif" }}>
            {displayName}
          </p>
          <p style={{ color: '#6B7280', fontSize: '12px', margin: 0, fontFamily: "'DM Sans',sans-serif" }}>
            Member since {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'}
          </p>
        </motion.div>

        {/* Personal info */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#E5E7EB', fontFamily: "'DM Sans',sans-serif" }}>Personal Information</span>
            {!editing ? (
              <button onClick={() => setEditing(true)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#9CA3AF', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", minHeight: '44px' }}>Edit</button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={saveProfile} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', color: '#34D399', fontSize: '13px', cursor: 'pointer', minHeight: '44px' }}>Save</button>
                <button onClick={() => setEditing(false)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#6B7280', fontSize: '13px', cursor: 'pointer', minHeight: '44px' }}>Cancel</button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Name */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'DM Sans',sans-serif" }}>Full Name</label>
              {editing
                ? <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" />
                : <p style={{ margin: 0, fontSize: '15px', color: '#E5E7EB', fontFamily: "'DM Sans',sans-serif" }}>{profile?.name || displayName}</p>
              }
            </div>

            {/* Email (read-only) */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'DM Sans',sans-serif" }}>Email</label>
              <p style={{ margin: 0, fontSize: '15px', color: '#6B7280', fontFamily: "'DM Sans',sans-serif", wordBreak: 'break-all' }}>{user?.email}</p>
            </div>

            {/* Phone */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'DM Sans',sans-serif" }}>Phone</label>
              {editing
                ? <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" type="tel" />
                : <p style={{ margin: 0, fontSize: '15px', color: profile?.phone ? '#E5E7EB' : '#4B5563', fontFamily: "'DM Sans',sans-serif" }}>{profile?.phone || 'Not set'}</p>
              }
            </div>
          </div>
        </motion.div>

        {/* Account details */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          style={cardStyle}>
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#E5E7EB', margin: '0 0 14px', fontFamily: "'DM Sans',sans-serif" }}>Account Details</p>
          {[
            { label: 'Role', value: 'Guest' },
            { label: 'Auth type', value: 'Email / Password' },
            { label: 'User ID', value: user?.uid ? `${user.uid.slice(0, 14)}...` : '—' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#6B7280', fontFamily: "'DM Sans',sans-serif" }}>{row.label}</span>
              <span style={{ fontSize: '13px', color: '#9CA3AF', fontFamily: 'monospace' }}>{row.value}</span>
            </div>
          ))}
        </motion.div>

        {/* Sign out button at bottom */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
          <button onClick={handleLogout} style={{ width: '100%', padding: '15px', background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.2)', borderRadius: '12px', color: '#F87171', fontSize: '15px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", minHeight: '52px' }}>
            Sign Out
          </button>
        </motion.div>

      </div>
    </div>
  );
}