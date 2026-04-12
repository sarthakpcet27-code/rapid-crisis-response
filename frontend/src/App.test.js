import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar       from './components/Navbar';
import SOSPage      from './pages/SOSPage';
import Dashboard    from './pages/Dashboard';
import SimulatePage from './pages/SimulatePage';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1A1A26',
            color: '#E5E7EB',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontSize: '14px',
            fontFamily: "'DM Sans', sans-serif",
          },
          success: { iconTheme: { primary:'#10B981', secondary:'#0A0A0F' } },
          error:   { iconTheme: { primary:'#E24B4A', secondary:'#0A0A0F' } },
        }}
      />
      <Navbar />
      <Routes>
        <Route path="/"          element={<SOSPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/simulate"  element={<SimulatePage />} />
      </Routes>
    </BrowserRouter>
  );
}
