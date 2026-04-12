import React, { useState, useEffect } from 'react';
import { sendMessage, listenToIncident } from '../firebase';

export default function LiveChat({ incidentId, sender }) {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');

  useEffect(() => {
    if (!incidentId) return;
    listenToIncident(incidentId, (data) => {
      if (data?.chat) {
        const msgs = Object.values(data.chat).sort((a,b) => a.time - b.time);
        setMessages(msgs);
      }
    });
  }, [incidentId]);

  const send = () => {
    if (!input.trim()) return;
    sendMessage(incidentId, input, sender);
    setInput('');
  };

  return (
    <div style={{border:'1px solid #eee',borderRadius:'10px',overflow:'hidden'}}>
      <div style={{background:'#f5f5f5',padding:'10px 14px',borderBottom:'1px solid #eee'}}>
        <b style={{fontSize:'13px'}}>Live Chat</b>
      </div>
      <div style={{padding:'12px',maxHeight:'200px',overflowY:'auto',minHeight:'80px'}}>
        {messages.map((m,i) => (
          <div key={i} style={{textAlign:m.sender===sender?'right':'left',marginBottom:'8px'}}>
            <span style={{display:'inline-block',padding:'6px 10px',borderRadius:'10px',fontSize:'12px',
              background:m.sender===sender?'#E24B4A':'#fff',
              color:m.sender===sender?'#fff':'#333',border:'1px solid #ddd'}}>
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <div style={{display:'flex',padding:'10px',borderTop:'1px solid #eee',gap:'8px'}}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && send()}
          placeholder="Type message..."
          style={{flex:1,padding:'8px',borderRadius:'8px',border:'1px solid #ccc',fontSize:'13px'}}/>
        <button onClick={send}
          style={{padding:'8px 14px',background:'#E24B4A',color:'#fff',
            border:'none',borderRadius:'8px',cursor:'pointer'}}>Send</button>
      </div>
    </div>
  );
}