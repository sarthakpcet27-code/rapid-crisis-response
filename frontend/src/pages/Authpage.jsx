import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { registerGuest, loginGuest } from '../firebase';

export default function AuthPage() {
  const [mode,     setMode]     = useState('login'); // 'login' | 'register'
  const [loading,  setLoading]  = useState(false);
  const [form,     setForm]     = useState({ name:'', email:'', password:'', phone:'' });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error('Email and password required'); return; }
    if (mode === 'register' && !form.name) { toast.error('Name is required'); return; }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      if (mode === 'register') {
        await registerGuest(form.name, form.email, form.password, form.phone);
        toast.success(`Welcome, ${form.name}!`);
      } else {
        await loginGuest(form.email, form.password);
        toast.success('Welcome back!');
      }
      // App.js will detect auth state change and redirect automatically
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use' ? 'Email already registered'
        : err.code === 'auth/user-not-found'               ? 'No account found with this email'
        : err.code === 'auth/wrong-password'               ? 'Incorrect password'
        : err.code === 'auth/invalid-email'                ? 'Invalid email address'
        : err.message;
      toast.error(msg);
    }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px', color: '#E5E7EB',
    fontSize: '14px', outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };
  const labelStyle = {
    display: 'block', fontSize: '12px',
    color: '#6B7280', marginBottom: '6px',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ width: '100%', maxWidth: '400px' }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#E24B4A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '28px' }}>🆘</div>
          <h1 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '32px', letterSpacing: '3px', color: '#fff', margin: '0 0 6px' }}>
            Respond<span style={{ color: '#E24B4A' }}>AI</span>
          </h1>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>Emergency Response System</p>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '5px', marginBottom: '24px' }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '10px', borderRadius: '9px', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.15s',
              background: mode === m ? '#E24B4A' : 'transparent',
              color:       mode === m ? '#fff'    : '#6B7280',
            }}>
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ background: 'rgba(26,26,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <AnimatePresence>
              {mode === 'register' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <label style={labelStyle}>Full Name</label>
                  <input style={inputStyle} placeholder="e.g. Sarthak Ghogare" value={form.name} onChange={set('name')} />
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label style={labelStyle}>Email Address</label>
              <input style={inputStyle} type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} />
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <input style={inputStyle} type="password" placeholder="Min 6 characters" value={form.password} onChange={set('password')} />
            </div>

            <AnimatePresence>
              {mode === 'register' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <label style={labelStyle}>Phone (optional)</label>
                  <input style={inputStyle} placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} />
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading ? '#4B5563' : '#E24B4A',
                border: 'none', borderRadius: '12px',
                color: '#fff', fontSize: '15px', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.2s',
                boxShadow: loading ? 'none' : '0 0 20px rgba(226,75,74,0.3)',
              }}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </motion.button>
          </div>
        </form>

        {/* Guest mode notice */}
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#374151', marginTop: '16px', fontFamily: "'DM Sans', sans-serif" }}>
          Your account keeps your SOS history safe and enables emergency contacts.
        </p>
      </motion.div>
    </div>
  );
}