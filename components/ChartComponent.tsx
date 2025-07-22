import React, { memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartData {
  date: string;
  revenue?: number;
  vendors?: number;
}

interface ChartComponentProps {
  data: ChartData[];
  type: 'revenue' | 'vendors';
  loading: boolean;
  timePeriod: string;
  onTimePeriodChange: (period: '7days' | '30days' | '12months') => void;
}

const ChartComponent = memo<ChartComponentProps>(({ 
  data, 
  type, 
  loading, 
  timePeriod, 
  onTimePeriodChange 
}) => {
  const isRevenue = type === 'revenue';
  const color = isRevenue ? '#10b981' : '#3b82f6';
  const bgColor = isRevenue ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4 sm:p-6 min-h-[120px] sm:min-h-[140px] flex flex-col justify-between">
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm font-semibold text-neutral-800">
            {isRevenue ? 'Revenue Trends' : 'Vendor Growth'}
          </div>
          <div className="flex gap-1">
            {['7days', '30days', '12months'].map((period) => (
              <button
                key={period}
                onClick={() => onTimePeriodChange(period as any)}
                className={`px-2 py-1 text-xs rounded ${timePeriod === period ? bgColor : 'text-neutral-500 hover:bg-neutral-50'}`}
              >
                {period === '7days' ? '7D' : period === '30days' ? '30D' : '12M'}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-neutral-400 mb-2">
          {timePeriod === '7days' ? 'Last 7 Days' : timePeriod === '30days' ? 'Last 30 Days' : 'Last 12 Months'}
        </div>
        <div className="flex-1 flex items-center justify-center text-neutral-300">
          Loading...
        </div>
        <div className="text-xs font-semibold text-green-600 mt-2">
          {isRevenue ? '+15%' : '+5%'}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4 sm:p-6 min-h-[120px] sm:min-h-[140px] flex flex-col justify-between">
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm font-semibold text-neutral-800">
            {isRevenue ? 'Revenue Trends' : 'Vendor Growth'}
          </div>
          <div className="flex gap-1">
            {['7days', '30days', '12months'].map((period) => (
              <button
                key={period}
                onClick={() => onTimePeriodChange(period as any)}
                className={`px-2 py-1 text-xs rounded ${timePeriod === period ? bgColor : 'text-neutral-500 hover:bg-neutral-50'}`}
              >
                {period === '7days' ? '7D' : period === '30days' ? '30D' : '12M'}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-neutral-400 mb-2">
          {timePeriod === '7days' ? 'Last 7 Days' : timePeriod === '30days' ? 'Last 30 Days' : 'Last 12 Months'}
        </div>
        <div className="flex-1 flex items-center justify-center text-neutral-300">
          No data available
        </div>
        <div className="text-xs font-semibold text-green-600 mt-2">
          {isRevenue ? '+15%' : '+5%'}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4 sm:p-6 min-h-[120px] sm:min-h-[140px] flex flex-col justify-between">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm font-semibold text-neutral-800">
          {isRevenue ? 'Revenue Trends' : 'Vendor Growth'}
        </div>
        <div className="flex gap-1">
          {['7days', '30days', '12months'].map((period) => (
            <button
              key={period}
              onClick={() => onTimePeriodChange(period as any)}
              className={`px-2 py-1 text-xs rounded ${timePeriod === period ? bgColor : 'text-neutral-500 hover:bg-neutral-50'}`}
            >
              {period === '7days' ? '7D' : period === '30days' ? '30D' : '12M'}
            </button>
          ))}
        </div>
      </div>
      <div className="text-xs text-neutral-400 mb-2">
        {timePeriod === '7days' ? 'Last 7 Days' : timePeriod === '30days' ? 'Last 30 Days' : 'Last 12 Months'}
      </div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fontSize: 10 }}
              tickFormatter={isRevenue ? (value) => `Rs ${value}` : undefined}
            />
            <Tooltip 
              formatter={isRevenue ? 
                (value: any) => [`Rs ${value}`, 'Revenue'] : 
                (value: any) => [value, 'Vendors']
              }
              labelStyle={{ fontSize: 12 }}
            />
            <Line 
              type="monotone" 
              dataKey={isRevenue ? 'revenue' : 'vendors'} 
              stroke={color} 
              strokeWidth={2}
              dot={{ fill: color, strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, stroke: color, strokeWidth: 2, fill: color }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs font-semibold text-green-600 mt-2">
        {isRevenue ? '+15%' : '+5%'}
      </div>
    </div>
  );
});

ChartComponent.displayName = 'ChartComponent';

export default ChartComponent; 