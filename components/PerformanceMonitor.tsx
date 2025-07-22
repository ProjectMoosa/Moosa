import { useEffect, useRef } from 'react';

interface PerformanceMonitorProps {
  componentName: string;
  onRenderComplete?: (duration: number) => void;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({ 
  componentName, 
  onRenderComplete 
}) => {
  const renderStartTime = useRef<number>(performance.now());

  useEffect(() => {
    const renderDuration = performance.now() - renderStartTime.current;
    
    // Log performance metrics in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`${componentName} render time: ${renderDuration.toFixed(2)}ms`);
    }
    
    // Call callback if provided
    if (onRenderComplete) {
      onRenderComplete(renderDuration);
    }
    
    // Update start time for next render
    renderStartTime.current = performance.now();
  });

  return null;
};

export default PerformanceMonitor; 