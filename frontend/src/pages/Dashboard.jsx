import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { listenToIncidents, listenToIncident, sendMessage, updateIncident } from '../firebase';

const SEV_COLOR    = { RED:'#E24B4A', YELLOW:'#F59E0B', GREEN:'#10B981', pending:'#6B7280' };
const CRISIS_ICONS = { fire:'🔥', medical:'🏥', security:'🔒', flood:'🌊', other:'⚠️' };
const safeStr = (v, fb='—') => { if (v==null) return fb; if (typeof v==='object') return fb; return String(v); };
const fmtLoc  = (loc) => { if (!loc||typeof loc!=='object') return null; const lat=loc.lat??loc.latitude; const lng=loc.lng??loc.longitude; if (lat==null) return null; return { lat:Number(lat), lng:Number(lng) }; };
const getSevClass = (s) => s==='RED'?'severity-red':s==='YELLOW'?'severity-yellow':s==='GREEN'?'severity-green':'severity-pending';

export default function Dashboard() {
  const [incidents,setIncidents]=useState([]);
  const [selected,setSelected]=useState(null);
  const [chatMsg,setChatMsg]=useState('');
  const [chatLog,setChatLog]=useState([]);
  const [filter,setFilter]=useState('all');
  const chatEndRef=useRef(null);

  useEffect(()=>{ const u=listenToIncidents(d=>{ const s=[...d].sort((a,b)=>(b.created_at||0)-(a.created_at||0)); setIncidents(s); if(!selected&&s.length>0)setSelected(s[0]); }); return()=>typeof u==='function'&&u(); },[]);
  useEffect(()=>{ if(!selected)return; const u=listenToIncident(selected.id,d=>{ setChatLog(d?.chat?Object.values(d.chat).sort((a,b)=>a.time-b.time):[]); }); return()=>typeof u==='function'&&u(); },[selected?.id]);
  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:'smooth'}); },[chatLog]);

  const sendChat=()=>{ if(!chatMsg.trim()||!selected)return; sendMessage(selected.id,chatMsg,'staff'); setChatMsg(''); };
  const markResolved=()=>{ if(!selected)return; updateIncident(selected.id,{status:'resolved',severity:'GREEN'}); toast.success('Resolved'); };

  const active=incidents.filter(i=>i.status!=='resolved');
  const critical=incidents.filter(i=>i.severity==='RED');
  const resolved=incidents.filter(i=>i.status==='resolved');
  const filtered=filter==='all'?incidents:filter==='active'?active:incidents.filter(i=>i.severity===filter);

  return (
    <div style={{minHeight:'100vh',background:'#0A0A0F',display:'flex',flexDirection:'column'}}>
      <motion.div initial={{y:-20,opacity:0}} animate={{y:0,opacity:1}} style={{padding:'16px 20px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px'}}>
        {[{label:'Active',value:active.length,color:'#3f3030',icon:'🔴'},{label:'Critical',value:critical.length,color:'#F59E0B',icon:'⚠️'},{label:'Resolved',value:resolved.length,color:'#10B981',icon:'✅'},{label:'Total',value:incidents.length,color:'#6B7280',icon:'📋'}].map((s,i)=>(
          <motion.div key={i} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:i*0.05}} className="glass-card" style={{padding:'14px',textAlign:'center'}}>
            <div style={{fontSize:'20px',marginBottom:'4px'}}>{s.icon}</div>
            <div style={{fontSize:'28px',fontWeight:700,fontFamily:"'Bebas Neue',cursive",color:s.color,lineHeight:1}}>{s.value}</div>
            <div style={{fontSize:'11px',color:'#6B7280',marginTop:'4px',textTransform:'uppercase',letterSpacing:'0.5px'}}>{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      <div style={{display:'grid',gridTemplateColumns:'320px 1fr',flex:1,padding:'0 20px 20px',gap:'16px'}}>
        <motion.div initial={{x:-30,opacity:0}} animate={{x:0,opacity:1}} transition={{delay:0.1}} className="glass-card" style={{overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'12px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',gap:'6px',flexWrap:'wrap'}}>
            {['all','active','RED','YELLOW','GREEN'].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:'4px 10px',borderRadius:'8px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:500,fontFamily:"'DM Sans',sans-serif",background:filter===f?'rgba(226,75,74,0.15)':'transparent',color:filter===f?'#F87171':'#6B7280'}}>
                {f==='all'?'All':f==='active'?'Active':f}
              </button>
            ))}
          </div>
          <div style={{overflowY:'auto',flex:1,padding:'8px'}}>
            {filtered.length===0?(
              <div style={{padding:'40px 20px',textAlign:'center',color:'#374151'}}><div style={{fontSize:'32px',marginBottom:'8px'}}>🔍</div><p style={{fontSize:'13px',margin:0}}>No incidents</p></div>
            ):filtered.map(inc=>(
              <motion.div key={inc.id} layout onClick={()=>setSelected(inc)} style={{padding:'12px',marginBottom:'6px',cursor:'pointer',borderRadius:'12px',border:selected?.id===inc.id?'1px solid rgba(226,75,74,0.4)':'1px solid rgba(255,255,255,0.06)',background:selected?.id===inc.id?'rgba(226,75,74,0.05)':'rgba(26,26,38,0.5)',borderLeft:`3px solid ${SEV_COLOR[inc.severity||'pending']}`,transition:'all 0.15s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'3px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                    <span style={{fontSize:'14px'}}>{CRISIS_ICONS[inc.crisisType]||'⚠️'}</span>
                    <span style={{fontSize:'13px',fontWeight:600,color:'#E5E7EB'}}>{safeStr(inc.crisisType,'UNKNOWN').toUpperCase()}</span>
                  </div>
                  <span className={getSevClass(inc.severity||'pending')}>{safeStr(inc.severity,'...')}</span>
                </div>
                {inc.guestName&&<p style={{fontSize:'11px',color:'#8B5CF6',margin:'0 0 2px',fontFamily:"'DM Sans',sans-serif"}}>👤 {inc.guestName}</p>}
                <p style={{fontSize:'11px',color:'#6B7280',margin:'0 0 2px'}}>Floor {safeStr(inc.floor,'?')} · Room {safeStr(inc.room,'?')}</p>
                <p style={{fontSize:'10px',color:'#374151',margin:0}}>{inc.created_at?new Date(inc.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{x:30,opacity:0}} animate={{x:0,opacity:1}} transition={{delay:0.15}} style={{display:'flex',flexDirection:'column',gap:'12px',overflowY:'auto'}}>
          {!selected?(
            <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'12px'}}>
              <div style={{fontSize:'48px'}}>📡</div><p style={{color:'#6B7280',fontSize:'14px',margin:0}}>Select an incident</p>
            </div>
          ):(
            <>
              <div className="glass-card" style={{padding:'16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                      <span style={{fontSize:'20px'}}>{CRISIS_ICONS[selected.crisisType]||'⚠️'}</span>
                      <h2 style={{margin:0,fontSize:'20px',fontWeight:700,color:'#fff',fontFamily:"'Bebas Neue',cursive",letterSpacing:'1px'}}>{safeStr(selected.crisisType,'UNKNOWN').toUpperCase()} — Floor {safeStr(selected.floor,'?')}</h2>
                    </div>
                    <p style={{margin:0,fontSize:'12px',color:'#6B7280'}}>Room {safeStr(selected.room,'?')} · {selected.created_at?new Date(selected.created_at).toLocaleString('en-IN'):'—'}</p>
                  </div>
                  <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                    <span className={getSevClass(selected.severity||'pending')}>{safeStr(selected.severity,'Analysing...')}</span>
                    <button onClick={markResolved} style={{padding:'7px 14px',background:'rgba(16,185,129,0.15)',color:'#34D399',border:'1px solid rgba(16,185,129,0.3)',borderRadius:'10px',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>✓ Resolve</button>
                  </div>
                </div>
                <div style={{background:'rgba(255,255,255,0.03)',borderRadius:'10px',padding:'10px 12px',marginBottom:'10px'}}>
                  <span style={{fontSize:'11px',color:'#6B7280'}}>Report: </span>
                  <span style={{fontSize:'13px',color:'#D1D5DB'}}>{safeStr(selected.description,'No description')}</span>
                </div>

                {/* GUEST INFO — visible to admin */}
                <div style={{background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'10px',padding:'12px 14px'}}>
                  <p style={{fontSize:'11px',fontWeight:700,color:'#A78BFA',margin:'0 0 10px',textTransform:'uppercase',letterSpacing:'0.5px'}}>👤 Reported By</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px'}}>
                    <div>
                      <p style={{fontSize:'10px',color:'#6B7280',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.3px'}}>Name</p>
                      <p style={{fontSize:'13px',color:'#C4B5FD',margin:0,fontFamily:"'DM Sans',sans-serif",fontWeight:500}}>{safeStr(selected.guestName,'Unknown Guest')}</p>
                    </div>
                    <div>
                      <p style={{fontSize:'10px',color:'#6B7280',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.3px'}}>Email</p>
                      <p style={{fontSize:'11px',color:'#C4B5FD',margin:0,fontFamily:'monospace',wordBreak:'break-all'}}>{safeStr(selected.guestEmail,'—')}</p>
                    </div>
                    <div>
                      <p style={{fontSize:'10px',color:'#6B7280',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.3px'}}>Phone</p>
                      <p style={{fontSize:'13px',color:'#C4B5FD',margin:0,fontFamily:"'DM Sans',sans-serif"}}>{safeStr(selected.guestPhone,'—')}</p>
                    </div>
                  </div>
                </div>

                {selected.summary&&<div style={{marginTop:'10px',padding:'8px 12px',background:'rgba(226,75,74,0.06)',borderRadius:'8px',borderLeft:'3px solid #E24B4A'}}><span style={{fontSize:'12px',color:'#F87171',fontStyle:'italic'}}>{safeStr(selected.summary)}</span></div>}
              </div>

              {Array.isArray(selected.sop)&&selected.sop.length>0&&(
                <div style={{background:'rgba(99,60,255,0.06)',border:'1px solid rgba(99,60,255,0.2)',borderRadius:'16px',padding:'16px'}}>
                  <p style={{fontSize:'13px',fontWeight:700,color:'#A78BFA',margin:'0 0 12px',textTransform:'uppercase',letterSpacing:'0.5px'}}>🤖 AI Response Plan</p>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'8px'}}>
                    {selected.sop.map((s,i)=>(<div key={i} style={{background:'rgba(99,60,255,0.08)',border:'1px solid rgba(99,60,255,0.15)',borderRadius:'10px',padding:'10px 12px',display:'flex',gap:'8px'}}><span style={{fontFamily:"'Bebas Neue',cursive",fontSize:'18px',color:'#7C3AED',flexShrink:0,lineHeight:1.2}}>{i+1}</span><span style={{fontSize:'12px',color:'#C4B5FD',lineHeight:1.5}}>{safeStr(s)}</span></div>))}
                  </div>
                </div>
              )}

              {(()=>{ const loc=fmtLoc(selected.location); if(!loc)return null; return (
                <div className="glass-card" style={{padding:'16px'}}>
                  <p style={{fontSize:'13px',fontWeight:600,color:'#34D399',margin:'0 0 10px'}}>📍 Incident Location</p>
                  <div style={{background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:'10px',padding:'12px',display:'flex',gap:'16px',alignItems:'center'}}>
                    <div><p style={{fontSize:'11px',color:'#6B7280',margin:'0 0 2px'}}>Latitude</p><p style={{fontSize:'13px',color:'#34D399',margin:0,fontFamily:'monospace'}}>{loc.lat.toFixed(6)}</p></div>
                    <div><p style={{fontSize:'11px',color:'#6B7280',margin:'0 0 2px'}}>Longitude</p><p style={{fontSize:'13px',color:'#34D399',margin:0,fontFamily:'monospace'}}>{loc.lng.toFixed(6)}</p></div>
                    <a href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" style={{marginLeft:'auto',padding:'7px 12px',background:'rgba(16,185,129,0.15)',color:'#34D399',border:'1px solid rgba(16,185,129,0.3)',borderRadius:'8px',textDecoration:'none',fontSize:'12px',fontWeight:600}}>Open Maps ↗</a>
                  </div>
                </div>
              ); })()}

              <div className="glass-card" style={{overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'13px',fontWeight:600,color:'#E5E7EB'}}>💬 Live Chat with Guest</span>
                  <span style={{fontSize:'11px',color:'#6B7280'}}>{chatLog.length} messages</span>
                </div>
                <div style={{padding:'12px',maxHeight:'200px',minHeight:'80px',overflowY:'auto'}}>
                  {chatLog.length===0?<p style={{color:'#374151',fontSize:'12px',textAlign:'center',marginTop:'20px'}}>No messages yet</p>:chatLog.map((m,i)=>(
                    <div key={i} style={{textAlign:m.sender==='staff'?'right':'left',marginBottom:'8px'}}>
                      <div style={{display:'inline-block',padding:'7px 12px',borderRadius:'12px',fontSize:'12px',maxWidth:'75%',textAlign:'left',background:m.sender==='staff'?'#E24B4A':'rgba(255,255,255,0.06)',color:m.sender==='staff'?'#fff':'#D1D5DB',border:m.sender==='staff'?'none':'1px solid rgba(255,255,255,0.08)'}}>{safeStr(m.text)}</div>
                      <div style={{fontSize:'10px',color:'#374151',margin:'2px 4px 0'}}>{m.sender==='staff'?'Staff':'Guest'}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef}/>
                </div>
                <div style={{display:'flex',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                  <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="Reply to guest..." style={{flex:1,padding:'12px 14px',background:'transparent',border:'none',outline:'none',color:'#E5E7EB',fontSize:'13px',fontFamily:"'DM Sans',sans-serif"}}/>
                  <button onClick={sendChat} style={{padding:'0 20px',background:'#E24B4A',color:'#fff',border:'none',cursor:'pointer',fontWeight:600,fontSize:'13px'}}>Send</button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}