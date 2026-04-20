// frontend/src/pages/ChatHistoryPage.jsx — mobile-responsive
// Mobile: full-width list → tap to open full-screen chat
// Desktop: split panel (list left, chat right)

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listenToMyIncidents, listenToIncident, sendMessage } from '../firebase';
import { useMobile } from '../utils/useMobile';

const CRISIS_ICONS = { fire: '🔥', medical: '🏥', security: '🔒', flood: '🌊', other: '⚠️' };

export default function ChatHistoryPage() {
  const isMobile = useMobile();
  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const unsub = listenToMyIncidents((data) => { setIncidents(data); setLoading(false); });
    return () => typeof unsub === 'function' && unsub();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const unsub = listenToIncident(selected.id, (data) => {
      if (data?.chat) setMessages(Object.values(data.chat).sort((a, b) => a.time - b.time));
      else setMessages([]);
    });
    return () => typeof unsub === 'function' && unsub();
  }, [selected?.id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendReply = () => { if (!newMsg.trim() || !selected) return; sendMessage(selected.id, newMsg, 'guest'); setNewMsg(''); };

  const lastMsg = (inc) => { if (!inc.chat) return null; const msgs = Object.values(inc.chat).sort((a, b) => a.time - b.time); return msgs[msgs.length - 1] || null; };
  const msgCount = (inc) => inc.chat ? Object.values(inc.chat).length : 0;

  const openChat = (inc) => { setSelected(inc); setMessages([]); };
  const closeChat = () => { setSelected(null); setMessages([]); };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{ width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #2A2A3A', borderTopColor: '#E24B4A' }} />
    </div>
  );

  // ── Chat window (shared between mobile fullscreen and desktop panel) ──
  const ChatWindow = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0A0A0F' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(26,26,38,0.9)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {isMobile && (
            <button onClick={closeChat} style={{ background: 'transparent', border: 'none', color: '#9CA3AF', fontSize: '20px', cursor: 'pointer', padding: '4px', flexShrink: 0, lineHeight: 1 }}>←</button>
          )}
          <span style={{ fontSize: '18px', flexShrink: 0 }}>{CRISIS_ICONS[selected.crisisType] || '⚠️'}</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#E5E7EB', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(selected.crisisType || 'Unknown').toUpperCase()}{selected.floor ? ` — Floor ${selected.floor}` : ''}
            </p>
            <p style={{ margin: 0, fontSize: '11px', color: '#6B7280', fontFamily: "'DM Sans',sans-serif" }}>
              {selected.created_at ? new Date(selected.created_at).toLocaleString('en-IN') : '—'}
            </p>
          </div>
        </div>
        {!isMobile && (
          <button onClick={closeChat} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#6B7280', fontSize: '12px', cursor: 'pointer' }}>Close</button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>💬</div>
            <p style={{ fontSize: '14px', margin: 0, color: '#6B7280', fontFamily: "'DM Sans',sans-serif" }}>No messages yet</p>
            <p style={{ fontSize: '12px', margin: '6px 0 0', color: '#374151', fontFamily: "'DM Sans',sans-serif" }}>Staff will reply after seeing your SOS</p>
          </div>
        ) : messages.map((m, i) => {
          const isGuest = m.sender === 'guest';
          const t = m.time ? new Date(m.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isGuest ? 'flex-end' : 'flex-start', marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', color: '#4B5563', marginBottom: '4px', fontFamily: "'DM Sans',sans-serif" }}>
                {isGuest ? 'You' : '🟢 Staff'} · {t}
              </span>
              <div style={{ padding: '10px 14px', borderRadius: isGuest ? '16px 16px 2px 16px' : '16px 16px 16px 2px', maxWidth: isMobile ? '85%' : '72%', fontSize: '15px', lineHeight: 1.5, fontFamily: "'DM Sans',sans-serif", background: isGuest ? '#E24B4A' : 'rgba(255,255,255,0.07)', color: isGuest ? '#fff' : '#D1D5DB', border: isGuest ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '10px', flexShrink: 0, background: 'rgba(10,10,15,0.9)' }}>
        <input value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()}
          placeholder="Reply to staff..."
          style={{ flex: 1, padding: '13px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#E5E7EB', fontSize: '16px', outline: 'none', fontFamily: "'DM Sans',sans-serif" }} />
        <button onClick={sendReply} disabled={!newMsg.trim()} style={{ padding: '13px 20px', background: newMsg.trim() ? '#E24B4A' : '#2A2A3A', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: newMsg.trim() ? 'pointer' : 'default', fontFamily: "'DM Sans',sans-serif", minWidth: '72px' }}>
          Send
        </button>
      </div>
    </div>
  );

  // ── MOBILE: fullscreen chat overlays the list ──
  if (isMobile) return (
    <div style={{ background: '#0A0A0F', minHeight: 'calc(100vh - 56px)', position: 'relative' }}>
      {/* Incident list */}
      <div style={{ padding: '16px' }}>
        <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ marginBottom: '16px' }}>
          <h1 style={{ fontFamily: "'Bebas Neue',cursive", fontSize: '26px', letterSpacing: '2px', color: '#fff', margin: '0 0 4px' }}>
            Chat <span style={{ color: '#E24B4A' }}>History</span>
          </h1>
          <p style={{ color: '#6B7280', fontSize: '12px', margin: 0 }}>{incidents.length} incident{incidents.length !== 1 ? 's' : ''}</p>
        </motion.div>

        {incidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💬</div>
            <p style={{ fontSize: '14px', margin: 0, color: '#6B7280' }}>No chats yet</p>
            <p style={{ fontSize: '12px', margin: '6px 0 0', color: '#374151' }}>Send an SOS to start chatting with staff</p>
          </div>
        ) : incidents.map((inc, idx) => {
          const last = lastMsg(inc);
          const count = msgCount(inc);
          const time = (last?.time || inc.created_at) ? new Date(last?.time || inc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
          return (
            <motion.div key={inc.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.04, 0.3) }}
              onClick={() => openChat(inc)}
              style={{ padding: '14px 16px', borderRadius: '14px', marginBottom: '10px', cursor: 'pointer', background: 'rgba(26,26,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '64px' }}>
              <span style={{ fontSize: '22px', flexShrink: 0 }}>{CRISIS_ICONS[inc.crisisType] || '⚠️'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#E5E7EB' }}>{(inc.crisisType || 'Unknown').toUpperCase()}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {count > 0 && <span style={{ fontSize: '11px', background: 'rgba(226,75,74,0.15)', color: '#F87171', padding: '1px 6px', borderRadius: '8px', border: '1px solid rgba(226,75,74,0.3)' }}>{count}</span>}
                    <span style={{ fontSize: '11px', color: '#374151' }}>{time}</span>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {last ? `${last.sender === 'guest' ? 'You' : 'Staff'}: ${last.text}` : (inc.description || 'No messages yet')}
                </p>
              </div>
              <span style={{ color: '#374151', fontSize: '18px', flexShrink: 0 }}>›</span>
            </motion.div>
          );
        })}
      </div>

      {/* Full-screen chat overlay */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key="chat-overlay"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{ position: 'fixed', inset: 0, zIndex: 150, top: '56px' }}
          >
            <ChatWindow />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ── DESKTOP: split panel ──
  return (
    <div style={{ background: '#0A0A0F', display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* List */}
      <div style={{ overflowY: 'auto', padding: '20px', borderRight: selected ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontFamily: "'Bebas Neue',cursive", fontSize: '28px', letterSpacing: '2px', color: '#fff', margin: '0 0 4px' }}>Chat <span style={{ color: '#E24B4A' }}>History</span></h1>
          <p style={{ color: '#6B7280', fontSize: '12px', margin: 0 }}>{incidents.length} incident{incidents.length !== 1 ? 's' : ''} · Your chats only</p>
        </div>
        {incidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💬</div>
            <p style={{ fontSize: '13px', margin: 0, color: '#6B7280' }}>No chats yet</p>
          </div>
        ) : incidents.map((inc, idx) => {
          const last = lastMsg(inc), count = msgCount(inc), isActive = selected?.id === inc.id;
          const time = (last?.time || inc.created_at) ? new Date(last?.time || inc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
          return (
            <motion.div key={inc.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.04, 0.3) }}
              onClick={() => setSelected(isActive ? null : inc)}
              style={{ padding: '12px 14px', borderRadius: '12px', marginBottom: '8px', cursor: 'pointer', background: isActive ? 'rgba(226,75,74,0.08)' : 'rgba(26,26,38,0.8)', border: `1px solid ${isActive ? 'rgba(226,75,74,0.35)' : 'rgba(255,255,255,0.06)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px' }}>{CRISIS_ICONS[inc.crisisType] || '⚠️'}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#E5E7EB' }}>{(inc.crisisType || 'Unknown').toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {count > 0 && <span style={{ fontSize: '10px', background: 'rgba(226,75,74,0.15)', color: '#F87171', padding: '1px 6px', borderRadius: '8px', border: '1px solid rgba(226,75,74,0.3)' }}>{count}</span>}
                  <span style={{ fontSize: '10px', color: '#374151' }}>{time}</span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {last ? `${last.sender === 'guest' ? 'You' : 'Staff'}: ${last.text}` : (inc.description || 'No messages yet')}
              </p>
            </motion.div>
          );
        })}
      </div>
      {/* Chat panel */}
      {selected && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} style={{ overflow: 'hidden' }}>
          <ChatWindow />
        </motion.div>
      )}
    </div>
  );
}