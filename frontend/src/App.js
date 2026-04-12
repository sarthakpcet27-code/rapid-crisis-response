import { BrowserRouter, Routes, Route } from 'react-router-dom';

import SOSPage                    from './pages/SOSPage';

import DashboardWithSOSListener   from './components/DashboardWithSOSListener';

import SimulatePage               from './pages/SimulatePage';

export default function App() {

  return (

    <BrowserRouter>

      <Routes>

        <Route path="/"          element={<SOSPage />} />

        <Route path="/dashboard" element={<DashboardWithSOSListener />} />

        <Route path="/simulate"  element={<SimulatePage />} />

      </Routes>

    </BrowserRouter>

  );

}