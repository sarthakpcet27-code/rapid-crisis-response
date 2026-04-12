import React, { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { createIncident, updateIncident } from '../firebase.js';

const SCENARIOS = [
  { type:'fire',     label:'Fire Emergency',          subtitle:'Smoke on floor 3, Room 302',   icon:'🔥', color:'#E24B4A', bg:'rgba(226,75,74,0.1)' },
  { type:'medical',  label:'Medical Emergency',        subtitle:'Guest collapsed in lobby',      icon:'🏥', color:'#12100d', bg:'rgba(245,158,11,0.1)' },
  { type:'security', label:'Security Threat',          subtitle:'Aggressive intruder at gate',   icon:'🔒', color:'#8B5CF6', bg:'rgba(139,92,246,0.1)' },
  { type:'flood',    label:'Flood Warning',            subtitle:'Water leakage basement floor',  icon:'🌊', color:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
];

export default function SimulatePage() {
  const [loading, setLoading] = useState(null);

  const trigger = async (type) => {
    setLoading(type);
    try {
      const { data } = await axios.post('http://localhost:3001/api/simulate', { type });
      const id = await createIncident(data);
      await updateIncident(id, { severity:data.severity, sop:data.sop, summary:data.summary });
      toast.success(`Scenario triggered! Check dashboard.`);
    } catch(e) {
      toast.error('Make sure backend is running on port 3001');
    }
    setLoading(null);
  };

  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', padding:'40px 20px' }}>
      <div style={{ maxWidth:'600px', margin:'0 auto' }}>

        <motion.div initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }} style={{ textAlign:'center', marginBottom:'40px' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'rgba(226,75,74,0.1)', border:'1px solid rgba(226,75,74,0.2)', borderRadius:'20px', padding:'6px 16px', marginBottom:'16px' }}>
            <span style={{ fontSize:'12px', color:'#F87171', fontWeight:500 }}>🎬 DEMO MODE</span>
          </div>
          <h1 style={{ fontFamily:"'Bebas Neue'", fontSize:'48px', letterSpacing:'3px', color:'#fff', margin:'0 0 8px' }}>
            Scenario <span style={{ color:'#E24B4A' }}>Simulator</span>
          </h1>
          <p style={{ color:'#6B7280', fontSize:'14px', margin:0 }}>
            Trigger realistic incidents for demo. Open dashboard to see them live.
          </p>
        </motion.div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'32px' }}>
          {SCENARIOS.map((s, i) => (
            <motion.div key={s.type}
              initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:i*0.1 }}
              whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
              onClick={() => trigger(s.type)}
              style={{
                background: s.bg, border:`1px solid ${s.color}30`,
                borderRadius:'16px', padding:'20px', cursor:'pointer',
                opacity: loading && loading!==s.type ? 0.5 : 1,
                transition:'all 0.2s',
              }}>
              <div style={{ fontSize:'32px', marginBottom:'10px' }}>{s.icon}</div>
              <h3 style={{ margin:'0 0 4px', fontSize:'15px', fontWeight:600, color:'#E5E7EB' }}>{s.label}</h3>
              <p style={{ margin:0, fontSize:'12px', color:'#6B7280', lineHeight:1.4 }}>{s.subtitle}</p>
              {loading === s.type && (
                <div style={{ marginTop:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
                  <motion.div animate={{ rotate:360 }} transition={{ duration:1, repeat:Infinity, ease:'linear' }}
                    style={{ width:'14px', height:'14px', borderRadius:'50%', border:`2px solid ${s.color}40`, borderTopColor:s.color }}/>
                  <span style={{ fontSize:'11px', color:s.color }}>Triggering...</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.5 }}
          style={{ textAlign:'center', color:'#374151', fontSize:'13px' }}>
          After triggering, open{' '}
          <a href="/dashboard" style={{ color:'#F87171', textDecoration:'none' }}>/dashboard</a>
          {' '}to see the live incident with AI response plan
        </motion.div>
      </div>
    </div>
  );
}