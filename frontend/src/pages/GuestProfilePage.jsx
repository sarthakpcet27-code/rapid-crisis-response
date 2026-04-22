// frontend/src/pages/GuestProfilePage.jsx
// Fixes: permission denied crash → shows error message instead
// Fixes: null profile → shows placeholder instead of crashing

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { auth, getGuestProfile, updateGuestProfile, logoutGuest } from '../firebase';

export default function GuestProfilePage() {
  const [profile,  setProfile]  = useState(null);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState({ name:'', phone:'' });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null); // ← NEW: track permission errors

  const user = auth.currentUser;

  useEffect(() => {
    if (!user) {
      setError('Not logged in');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await getGuestProfile(user.uid);
        if (cancelled) return;

        if (p === null) {
          // Could be a new user with no profile written yet, or a rules issue.
          // Either way, fall back to Firebase Auth displayName/email.
          console.warn('[Profile] getGuestProfile returned null — using Auth fallback');
          setProfile({
            name:      user.displayName || '',
            email:     user.email       || '',
            phone:     '',
            createdAt: null,
          });
          setForm({ name: user.displayName || '', phone: '' });
        } else {
          setProfile(p);
          setForm({ name: p.name || '', phone: p.phone || '' });
        }
      } catch (e) {
        if (cancelled) return;
        console.error('[Profile] Fatal load error:', e);
        setError(e?.code === 'PERMISSION_DENIED' || e?.message?.includes('Permission')
          ? 'Permission denied — your account may not have access to this profile. Try signing out and back in.'
          : `Could not load profile: ${e?.message || 'Unknown error'}`
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user]);

  const saveProfile = async () => {
    if (!form.name.trim()) { toast.error('Name cannot be empty'); return; }
    try {
      await updateGuestProfile(user.uid, { name: form.name, phone: form.phone });
      setProfile(p => ({ ...p, name: form.name, phone: form.phone }));
      setEditing(false);
      toast.success('Profile updated');
    } catch (e) {
      console.error('[Profile] Update failed:', e);
      toast.error(e?.code === 'PERMISSION_DENIED'
        ? 'Permission denied — check Firebase rules'
        : 'Update failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    await logoutGuest();
    toast.success('Signed out safely');
  };

  // ── Styles ────────────────────────────────────────────────
  const inputStyle = {
    width:'100%', padding:'11px 14px',
    background:'rgba(255,255,255,0.05)',
    border:'1px solid rgba(255,255,255,0.1)',
    borderRadius:'10px', color:'#E5E7EB',
    fontSize:'14px', outline:'none',
    fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box',
  };
  const cardStyle = {
    background:'rgba(26,26,38,0.8)',
    border:'1px solid rgba(255,255,255,0.06)',
    borderRadius:'16px', padding:'20px', marginBottom:'12px',
  };

  // ── Loading ───────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <motion.div animate={{ rotate:360 }} transition={{ duration:1, repeat:Infinity, ease:'linear' }}
        style={{ width:'44px', height:'44px', borderRadius:'50%', border:'3px solid #2A2A3A', borderTopColor:'#E24B4A' }} />
    </div>
  );

  // ── Error state (permission denied, etc.) ─────────────────
  if (error) return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ maxWidth:'400px', textAlign:'center' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🔒</div>
        <h2 style={{ fontFamily:"'Bebas Neue',cursive", fontSize:'24px', color:'#F87171', margin:'0 0 12px', letterSpacing:'1px' }}>
          Profile Unavailable
        </h2>
        <p style={{ fontSize:'14px', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", lineHeight:1.6, marginBottom:'20px' }}>
          {error}
        </p>
        <div style={{ display:'flex', gap:'10px', justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={() => { setError(null); setLoading(true); }}
            style={{ padding:'10px 20px', background:'rgba(226,75,74,0.15)', border:'1px solid rgba(226,75,74,0.3)', borderRadius:'10px', color:'#F87171', fontSize:'13px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Retry
          </button>
          <button onClick={handleLogout}
            style={{ padding:'10px 20px', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', color:'#6B7280', fontSize:'13px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Sign Out
          </button>
        </div>
        <p style={{ fontSize:'11px', color:'#374151', marginTop:'16px', fontFamily:'monospace' }}>
          Debug: Check browser console for exact Firebase error code
        </p>
      </div>
    </div>
  );

  const displayName = profile?.name || user?.displayName || 'Guest';

  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', padding:'20px' }}>
      <div style={{ maxWidth:'460px', margin:'0 auto' }}>

        {/* Header */}
        <motion.div initial={{ y:-15, opacity:0 }} animate={{ y:0, opacity:1 }}
          style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
          <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontSize:'28px', letterSpacing:'2px', color:'#fff', margin:0 }}>
            My Profile
          </h1>
          <button onClick={handleLogout}
            style={{ padding:'7px 14px', background:'rgba(226,75,74,0.1)', border:'1px solid rgba(226,75,74,0.25)', borderRadius:'10px', color:'#F87171', fontSize:'12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Sign Out
          </button>
        </motion.div>

        {/* Avatar */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.1 }}
          style={{ textAlign:'center', marginBottom:'24px' }}>
          <div style={{ width:'72px', height:'72px', borderRadius:'50%', background:'rgba(226,75,74,0.15)', border:'2px solid rgba(226,75,74,0.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px', fontSize:'26px', fontWeight:600, color:'#F87171', fontFamily:"'DM Sans',sans-serif" }}>
            {displayName[0]?.toUpperCase() || '?'}
          </div>
          <p style={{ color:'#E5E7EB', fontSize:'16px', fontWeight:500, margin:'0 0 3px', fontFamily:"'DM Sans',sans-serif" }}>
            {displayName}
          </p>
          <p style={{ color:'#6B7280', fontSize:'12px', margin:0, fontFamily:"'DM Sans',sans-serif" }}>
            {profile?.createdAt
              ? `Member since ${new Date(profile.createdAt).toLocaleDateString('en-IN', { month:'long', year:'numeric' })}`
              : user?.email}
          </p>
        </motion.div>

        {/* Personal Information */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.15 }}
          style={cardStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <span style={{ fontSize:'13px', fontWeight:500, color:'#E5E7EB', fontFamily:"'DM Sans',sans-serif" }}>
              Personal Information
            </span>
            {!editing
              ? <button onClick={() => setEditing(true)} style={{ padding:'5px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#9CA3AF', fontSize:'12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
              : <div style={{ display:'flex', gap:'6px' }}>
                  <button onClick={saveProfile} style={{ padding:'5px 12px', background:'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:'8px', color:'#34D399', fontSize:'12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Save</button>
                  <button onClick={() => setEditing(false)} style={{ padding:'5px 12px', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#6B7280', fontSize:'12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                </div>
            }
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
            {/* Name */}
            <div>
              <label style={{ display:'block', fontSize:'11px', color:'#6B7280', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px', fontFamily:"'DM Sans',sans-serif" }}>Full Name</label>
              {editing
                ? <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder="Your name" />
                : <p style={{ margin:0, fontSize:'14px', color:'#E5E7EB', fontFamily:"'DM Sans',sans-serif" }}>{profile?.name || user?.displayName || '—'}</p>
              }
            </div>

            {/* Email */}
            <div>
              <label style={{ display:'block', fontSize:'11px', color:'#6B7280', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px', fontFamily:"'DM Sans',sans-serif" }}>Email</label>
              <p style={{ margin:0, fontSize:'14px', color:'#6B7280', fontFamily:"'DM Sans',sans-serif" }}>{user?.email}</p>
            </div>

            {/* Phone */}
            <div>
              <label style={{ display:'block', fontSize:'11px', color:'#6B7280', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px', fontFamily:"'DM Sans',sans-serif" }}>Phone</label>
              {editing
                ? <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone:e.target.value }))} placeholder="+91 98765 43210" />
                : <p style={{ margin:0, fontSize:'14px', color: profile?.phone ? '#E5E7EB' : '#4B5563', fontFamily:"'DM Sans',sans-serif" }}>{profile?.phone || 'Not set'}</p>
              }
            </div>
          </div>
        </motion.div>

        {/* Account Details */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }}
          style={cardStyle}>
          <p style={{ fontSize:'13px', fontWeight:500, color:'#E5E7EB', margin:'0 0 14px', fontFamily:"'DM Sans',sans-serif" }}>Account Details</p>
          {[
            { label:'Role',      value:'Guest' },
            { label:'Auth type', value:'Email / Password' },
            { label:'User ID',   value: user?.uid ? `${user.uid.slice(0,14)}...` : '—' },
          ].map((row, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ fontSize:'12px', color:'#6B7280', fontFamily:"'DM Sans',sans-serif" }}>{row.label}</span>
              <span style={{ fontSize:'12px', color:'#9CA3AF', fontFamily:'monospace' }}>{row.value}</span>
            </div>
          ))}
        </motion.div>

        {/* Sign out */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.25 }}>
          <button onClick={handleLogout}
            style={{ width:'100%', padding:'13px', background:'rgba(226,75,74,0.08)', border:'1px solid rgba(226,75,74,0.2)', borderRadius:'12px', color:'#F87171', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Sign Out
          </button>
        </motion.div>
      </div>
    </div>
  );
}