// frontend/src/utils/useMobile.js
// Simple hook — returns true when screen is under 768px (mobile)
// Use: const isMobile = useMobile();

import { useState, useEffect } from 'react';

export const useMobile = (breakpoint = 768) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < breakpoint);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, [breakpoint]);

    return isMobile;
};