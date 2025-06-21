"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useUser } from '@/components/useUser';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import Container from '@/components/Container';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

// Add this type above the component
interface Sales {
  id: string;
  timestamp: any; // Firestore Timestamp or string
  total: number;
  items: { name: string; qty: number }[];
  [key: string]: any; // for any extra fields
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function VendorAnalyticsPage() {
  const { user, vendor, loading } = useUser();
  const [sales, setSales] = useState<Sales[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [from, setFrom] = useState(formatDate(new Date(new Date().setDate(new Date().getDate() - 30))));
  const [to, setTo] = useState(formatDate(new Date()));
  const [trend, setTrend] = useState<{percent: number, up: boolean} | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [performanceScore, setPerformanceScore] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoadingSales(true);
    const fetchSales = async () => {
      let q = query(collection(db, 'sales'), where('vendorId', '==', user.uid));
      const snap = await getDocs(q);
      let salesArr = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp ?? null,
          total: data.total ?? 0,
          items: data.items ?? [],
          ...data,
        } as Sales;
      });
      // Filter by date range
      salesArr = salesArr.filter(s => {
        const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
        return d >= new Date(from) && d <= new Date(to + 'T23:59:59');
      });
      setSales(salesArr);
      setLoadingSales(false);
      
      // Calculate trend
      const thisMonth = new Date().getMonth();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const thisMonthSales = salesArr.filter(s => (s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp)).getMonth() === thisMonth).reduce((sum, s) => sum + (s.total || 0), 0);
      const lastMonthSales = salesArr.filter(s => (s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp)).getMonth() === lastMonth).reduce((sum, s) => sum + (s.total || 0), 0);
      const percent = lastMonthSales === 0 ? 0 : ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100;
      setTrend({ percent: Math.abs(percent), up: percent >= 0 });

      // Generate smart insights
      const totalSales = salesArr.reduce((sum, s) => sum + (s.total || 0), 0);
      const avgOrderValue = salesArr.length > 0 ? totalSales / salesArr.length : 0;
      const bestSeller = (() => {
        const map = new Map();
        salesArr.forEach(s => {
          (s.items || []).forEach((item: any) => {
            map.set(item.name, (map.get(item.name) || 0) + (item.qty || 1));
          });
        });
        let max = 0, best = '';
        map.forEach((qty, name) => { if (qty > max) { max = qty; best = name; } });
        return { name: best || '-', qty: max };
      })();

      const newInsights = [];
      if (percent > 20) newInsights.push("🚀 Excellent growth! Your sales are soaring above expectations.");
      else if (percent > 0) newInsights.push("📈 Good progress! Sales are trending upward.");
      else if (percent < -10) newInsights.push("⚠️ Sales are declining. Consider promotional strategies.");
      
      if (avgOrderValue > 5000) newInsights.push("💰 High average order value indicates strong customer spending.");
      else if (avgOrderValue < 2000) newInsights.push("💡 Consider upselling strategies to increase order values.");
      
      if (bestSeller.qty > 50) newInsights.push(`🔥 ${bestSeller.name} is your superstar product! Stock up on this winner.`);
      
      if (salesArr.length > 20) newInsights.push("📊 You have substantial data for reliable insights.");
      else newInsights.push("📝 More sales data will provide better analytics insights.");

      setInsights(newInsights);

      // Calculate performance score (0-100)
      let score = 0;
      if (percent > 0) score += 30;
      if (avgOrderValue > 3000) score += 25;
      if (salesArr.length > 10) score += 20;
      if (bestSeller.qty > 20) score += 25;
      setPerformanceScore(Math.min(100, score));
    };
    fetchSales();
  }, [user, from, to]);

  // Chart data
  const grouped = sales.reduce((acc, s) => {
    const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
    const key = d.toISOString().slice(0, 7); // YYYY-MM
    acc[key] = (acc[key] || 0) + (s.total || 0);
    return acc;
  }, {} as Record<string, number>);
  const labels = Object.keys(grouped).sort();
  const data = labels.map(l => grouped[l]);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Sales (LKR)',
        data,
        backgroundColor: chartType === 'bar' 
          ? 'rgba(99, 111, 83, 0.8)' 
          : 'rgba(99, 111, 83, 0.1)',
        borderColor: '#636f53',
        borderWidth: 3,
        tension: 0.4,
        pointBackgroundColor: '#636f53',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#636f53',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: function(context: any) {
            return `Sales: LKR ${context.parsed.y.toLocaleString()}`;
          }
        }
      },
    },
    scales: {
      x: { 
        grid: { display: false },
        ticks: { color: '#6b7280', font: { size: 12 } }
      },
      y: { 
        grid: { color: '#e5e7eb' },
        ticks: { 
          color: '#6b7280', 
          font: { size: 12 },
          callback: function(value: any) {
            return 'LKR ' + value.toLocaleString();
          }
        }
      },
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
  };

  // Category breakdown for doughnut chart
  const categoryData = sales.reduce((acc, s) => {
    (s.items || []).forEach((item: any) => {
      const category = item.category || 'Other';
      acc[category] = (acc[category] || 0) + (item.qty || 1);
    });
    return acc;
  }, {} as Record<string, number>);

  const doughnutData = {
    labels: Object.keys(categoryData),
    datasets: [{
      data: Object.values(categoryData),
      backgroundColor: [
        '#636f53', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
        '#ef4444', '#ec4899', '#84cc16', '#f97316', '#6366f1'
      ],
      borderWidth: 0,
      hoverOffset: 4,
    }]
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { 
          padding: 20,
          usePointStyle: true,
          font: { size: 11 }
        }
      }
    }
  };

  // Summary cards
  const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalStockIntake = sales.reduce((sum, s) => sum + ((s.items || []).reduce((a: number, i: any) => a + (i.qty || 1), 0)), 0);
  const avgOrderValue = sales.length > 0 ? totalSales / sales.length : 0;
  const bestSeller = (() => {
    const map = new Map();
    sales.forEach(s => {
      (s.items || []).forEach((item: any) => {
        map.set(item.name, (map.get(item.name) || 0) + (item.qty || 1));
      });
    });
    let max = 0, best = '';
    map.forEach((qty, name) => { if (qty > max) { max = qty; best = name; } });
    return best || '-';
  })();
  const growth = trend ? (trend.up ? trend.percent : -trend.percent) : 0;

  // Breakdown table
  const breakdown = labels.map((month, i) => {
    const monthSales = sales.filter(s => {
      const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
      return d.toISOString().slice(0, 7) === month;
    });
    const salesSum = monthSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const stockSum = monthSales.reduce((sum, s) => sum + ((s.items || []).reduce((a: number, it: any) => a + (it.qty || 1), 0)), 0);
    const productMap = new Map();
    monthSales.forEach(s => {
      (s.items || []).forEach((item: any) => {
        productMap.set(item.name, (productMap.get(item.name) || 0) + (item.qty || 1));
      });
    });
    let max = 0, top = '';
    productMap.forEach((qty, name) => { if (qty > max) { max = qty; top = name; } });
    return { month, sales: salesSum, stock: stockSum, topProduct: top || '-' };
  });

  if (loading || loadingSales) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-8">
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-700"></div>
      </div>
    </div>
  );

  return (
    <Container>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-8">
        {/* Header with greeting and trend */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary-700 mb-2">
              {getGreeting()}, {vendor?.businessName || 'Vendor'}!
            </h1>
            <p className="text-neutral-600">Here's your business performance overview</p>
          </div>
          {trend && (
            <div className="flex items-center gap-3">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm ${trend.up ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800' : 'bg-gradient-to-r from-red-100 to-red-200 text-red-800'}`}>
                {trend.up ? '📈' : '📉'} {trend.percent.toFixed(1)}% {trend.up ? 'Growth' : 'Decline'}
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm border">
                <div className="text-xs text-neutral-500">Performance Score</div>
                <div className="text-lg font-bold text-primary-700">{performanceScore}/100</div>
              </div>
            </div>
          )}
        </div>

        {/* Chart Controls */}
        <div className="flex flex-wrap gap-3 items-center mb-6 bg-white rounded-xl border border-neutral-100 shadow-sm p-4">
          <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
            <button 
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${chartType === 'bar' ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-600 hover:text-primary-700'}`} 
              onClick={() => setChartType('bar')}
            >
              Bar Chart
            </button>
            <button 
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${chartType === 'line' ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-600 hover:text-primary-700'}`} 
              onClick={() => setChartType('line')}
            >
              Line Chart
            </button>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-sm font-medium text-neutral-700">Date Range:</span>
            <input 
              type="date" 
              value={from} 
              onChange={e => setFrom(e.target.value)} 
              className="border border-neutral-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
            />
            <span className="text-neutral-500">to</span>
            <input 
              type="date" 
              value={to} 
              onChange={e => setTo(e.target.value)} 
              className="border border-neutral-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
            />
          </div>
        </div>

        {/* Main Chart */}
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 text-neutral-800">Sales Performance</h2>
          <div className="h-96">
            {chartType === 'bar' ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <Line data={chartData} options={chartOptions} />
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-green-800">Total Sales</div>
              <div className="text-green-600">💰</div>
            </div>
            <div className="text-2xl font-bold text-green-900">LKR {totalSales.toLocaleString()}</div>
            <div className="text-xs text-green-700 mt-1">All time revenue</div>
          </div>
          
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-blue-800">Avg Order Value</div>
              <div className="text-blue-600">📊</div>
            </div>
            <div className="text-2xl font-bold text-blue-900">LKR {avgOrderValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
            <div className="text-xs text-blue-700 mt-1">Per transaction</div>
          </div>
          
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border border-yellow-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-yellow-800">Top Product</div>
              <div className="text-yellow-600">🏆</div>
            </div>
            <div className="text-lg font-bold text-yellow-900 truncate">{bestSeller}</div>
            <div className="text-xs text-yellow-700 mt-1">Best seller</div>
          </div>
          
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-purple-800">Growth Rate</div>
              <div className="text-purple-600">📈</div>
            </div>
            <div className="text-2xl font-bold text-purple-900">{growth.toFixed(1)}%</div>
            <div className="text-xs text-purple-700 mt-1">Month over month</div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Category Breakdown */}
          <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4 text-neutral-800">Category Performance</h3>
            <div className="h-64">
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          </div>

          {/* Smart Insights */}
          <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl border border-primary-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4 text-primary-800 flex items-center gap-2">
              🤖 Smart Insights
            </h3>
            <div className="space-y-3">
              {insights.map((insight, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-white/50 rounded-lg">
                  <div className="text-primary-600 mt-0.5">💡</div>
                  <p className="text-sm text-primary-900 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6 text-neutral-800">Monthly Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="min-w-[600px] w-full text-sm">
              <thead>
                <tr className="text-neutral-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left bg-neutral-50">Month</th>
                  <th className="px-4 py-3 text-left bg-neutral-50">Sales</th>
                  <th className="px-4 py-3 text-left bg-neutral-50">Stock Intake</th>
                  <th className="px-4 py-3 text-left bg-neutral-50">Top Product</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row, i) => (
                  <tr key={i} className="border-t border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.month}</td>
                    <td className="px-4 py-3 text-green-700 font-semibold">LKR {row.sales.toLocaleString()}</td>
                    <td className="px-4 py-3">{row.stock} units</td>
                    <td className="px-4 py-3 text-primary-700">{row.topProduct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Container>
  );
} 