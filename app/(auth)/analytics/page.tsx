"use client";
import { useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from "firebase/firestore";
import { useUser } from '@/components/useUser';
import { Bar, Line, Doughnut, Pie } from 'react-chartjs-2';
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
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Package, 
  Calendar,
  Clock,
  Star,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Target
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

// Enhanced interfaces
interface SaleData {
  id: string;
  timestamp: Timestamp;
  total: number;
  subtotal: number;
  tax: number;
  cart: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    category?: string;
  }>;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  vendorId: string;
  purchaseRefId: string;
}

interface StockItem {
  id: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  purchasePrice?: number;
  category?: string;
  lowStockThreshold?: number;
}

interface CustomerData {
  id: string;
  name: string;
  phone: string;
  totalSpent: number;
  totalOrders: number;
  lastPurchase: Date;
  points: number;
}

function formatCurrency(amount: number) {
  return `LKR ${amount.toLocaleString()}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTimeAgo(date: Date) {
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
  return `${Math.floor(diffInHours / 168)}w ago`;
}

export default function AnalyticsPage() {
  const { user, vendor, loading } = useUser();
  const [sales, setSales] = useState<SaleData[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Calculate date range based on selection
  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date();
    
    switch (timeRange) {
      case '7d':
        start.setDate(now.getDate() - 7);
        break;
      case '30d':
        start.setDate(now.getDate() - 30);
        break;
      case '90d':
        start.setDate(now.getDate() - 90);
        break;
      case '1y':
        start.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    return { start, end: now };
  }, [timeRange]);

  // Fetch all data from Firebase
  useEffect(() => {
    if (!user) return;
    
    const fetchAllData = async () => {
      setLoadingData(true);
      
      try {
        // Fetch sales data
        const salesQuery = query(
          collection(db, 'sales'),
          where('vendorId', '==', user.uid),
          orderBy('timestamp', 'desc')
        );
        const salesSnap = await getDocs(salesQuery);
        const salesData = salesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as SaleData));
        
        // Filter by date range
        const filteredSales = salesData.filter(sale => {
          const saleDate = sale.timestamp.toDate();
          return saleDate >= dateRange.start && saleDate <= dateRange.end;
        });
        
        setSales(filteredSales);

        // Fetch stock data
        const stockQuery = query(
          collection(db, 'vendor_stocks'),
          where('vendorId', '==', user.uid)
        );
        const stockSnap = await getDocs(stockQuery);
        const stockData = stockSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        setStock(stockData);

        // Fetch customer data
        const customerQuery = query(
          collection(db, 'customer_info'),
          where('vendorId', '==', user.uid)
        );
        const customerSnap = await getDocs(customerQuery);
        const customerData = customerSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as CustomerData));
        setCustomers(customerData);

      } catch (error) {
        console.error('Error fetching analytics data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchAllData();
  }, [user, dateRange]);

  // Calculate key metrics
  const metrics = useMemo(() => {
    const totalRevenue = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const totalOrders = sales.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // Calculate growth (compare with previous period)
    const currentPeriodSales = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const previousPeriodStart = new Date(dateRange.start);
    const previousPeriodEnd = new Date(dateRange.end);
    const periodLength = dateRange.end.getTime() - dateRange.start.getTime();
    
    previousPeriodStart.setTime(previousPeriodStart.getTime() - periodLength);
    previousPeriodEnd.setTime(previousPeriodEnd.getTime() - periodLength);
    
    // This would need to be calculated with actual previous period data
    const previousPeriodSales = 0; // Placeholder
    const growthRate = previousPeriodSales > 0 
      ? ((currentPeriodSales - previousPeriodSales) / previousPeriodSales) * 100 
      : 0;

    // Top products
    const productSales = new Map<string, { quantity: number; revenue: number }>();
    sales.forEach(sale => {
      // Check if cart exists and is an array
      if (sale.cart && Array.isArray(sale.cart)) {
        sale.cart.forEach(item => {
          if (item && item.name) {
            const existing = productSales.get(item.name) || { quantity: 0, revenue: 0 };
            productSales.set(item.name, {
              quantity: existing.quantity + (item.quantity || 0),
              revenue: existing.revenue + ((item.price || 0) * (item.quantity || 0))
            });
          }
        });
      }
    });

    const topProducts = Array.from(productSales.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    // Category breakdown
    const categorySales = new Map<string, number>();
    sales.forEach(sale => {
      if (sale.cart && Array.isArray(sale.cart)) {
        sale.cart.forEach(item => {
          if (item && item.name) {
            const category = item.category || 'Uncategorized';
            categorySales.set(category, (categorySales.get(category) || 0) + ((item.price || 0) * (item.quantity || 0)));
          }
        });
      }
    });

    // Payment method breakdown
    const paymentMethods = new Map<string, number>();
    sales.forEach(sale => {
      if (sale.paymentMethod) {
        paymentMethods.set(sale.paymentMethod, (paymentMethods.get(sale.paymentMethod) || 0) + 1);
      }
    });

    // Low stock items
    const lowStockItems = stock.filter(item => 
      item.quantity > 0 && item.quantity < (item.lowStockThreshold || 5)
    );

    // Out of stock items
    const outOfStockItems = stock.filter(item => item.quantity === 0);

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      growthRate,
      topProducts,
      categorySales,
      paymentMethods,
      lowStockItems,
      outOfStockItems,
      uniqueCustomers: new Set(sales.map(sale => sale.customerPhone).filter(Boolean)).size
    };
  }, [sales, stock, dateRange]);

  // Chart data
  const chartData = useMemo(() => {
    const groupedData = new Map<string, number>();
    
    sales.forEach(sale => {
      if (sale.timestamp && sale.total) {
        let key: string;
        const saleDate = sale.timestamp.toDate();
        
        switch (selectedPeriod) {
          case 'daily':
            key = saleDate.toISOString().split('T')[0];
            break;
          case 'weekly':
            const weekStart = new Date(saleDate);
            weekStart.setDate(saleDate.getDate() - saleDate.getDay());
            key = weekStart.toISOString().split('T')[0];
            break;
          case 'monthly':
            key = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            key = saleDate.toISOString().split('T')[0];
        }
        
        groupedData.set(key, (groupedData.get(key) || 0) + sale.total);
      }
    });

    const sortedKeys = Array.from(groupedData.keys()).sort();
    
    return {
      labels: sortedKeys,
      datasets: [{
        label: 'Revenue',
        data: sortedKeys.map(key => groupedData.get(key) || 0),
        backgroundColor: 'rgba(99, 111, 83, 0.8)',
        borderColor: '#636f53',
        borderWidth: 2,
        tension: 0.4,
        pointBackgroundColor: '#636f53',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
      }]
    };
  }, [sales, selectedPeriod]);

  const categoryChartData = {
    labels: Array.from(metrics.categorySales.keys()),
    datasets: [{
      data: Array.from(metrics.categorySales.values()),
      backgroundColor: [
        '#636f53', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
        '#ef4444', '#ec4899', '#84cc16', '#f97316', '#6366f1'
      ],
      borderWidth: 0,
      hoverOffset: 4,
    }]
  };

  const paymentChartData = {
    labels: Array.from(metrics.paymentMethods.keys()),
    datasets: [{
      data: Array.from(metrics.paymentMethods.values()),
      backgroundColor: ['#10b981', '#3b82f6', '#f59e0b'],
      borderWidth: 0,
      hoverOffset: 4,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
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
            return `Revenue: ${formatCurrency(context.parsed.y)}`;
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
            return formatCurrency(value);
          }
        }
      },
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-700 mx-auto mb-4"></div>
          <p className="text-neutral-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-2">
                {getGreeting()}, {vendor?.businessName || 'Vendor'}!
              </h1>
              <p className="text-sm sm:text-base text-neutral-600">Your business analytics dashboard</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex bg-white rounded-lg border border-neutral-200 p-1">
                {(['7d', '30d', '90d', '1y'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                      timeRange === range
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
              </div>
              <div className={`flex items-center gap-1 text-xs sm:text-sm font-medium ${
                metrics.growthRate >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {metrics.growthRate >= 0 ? (
                  <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4" />
                )}
                {Math.abs(metrics.growthRate).toFixed(1)}%
              </div>
            </div>
            <h3 className="text-lg sm:text-2xl font-bold text-neutral-900 mb-1">
              {formatCurrency(metrics.totalRevenue)}
            </h3>
            <p className="text-xs sm:text-sm text-neutral-600">Total Revenue</p>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                <ShoppingCart className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
              </div>
            </div>
            <h3 className="text-lg sm:text-2xl font-bold text-neutral-900 mb-1">
              {metrics.totalOrders}
            </h3>
            <p className="text-xs sm:text-sm text-neutral-600">Total Orders</p>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
                <Target className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" />
              </div>
            </div>
            <h3 className="text-lg sm:text-2xl font-bold text-neutral-900 mb-1">
              {formatCurrency(metrics.avgOrderValue)}
            </h3>
            <p className="text-xs sm:text-sm text-neutral-600">Avg Order Value</p>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-1.5 sm:p-2 bg-orange-100 rounded-lg">
                <Users className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
            <h3 className="text-lg sm:text-2xl font-bold text-neutral-900 mb-1">
              {metrics.uniqueCustomers}
            </h3>
            <p className="text-xs sm:text-sm text-neutral-600">Unique Customers</p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 mb-6 sm:mb-8">
          {/* Main Revenue Chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-neutral-900">Revenue Trend</h2>
              <div className="flex bg-neutral-100 rounded-lg p-1">
                {(['daily', 'weekly', 'monthly'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                      selectedPeriod === period
                        ? 'bg-white text-primary-700 shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-64 sm:h-80">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 mb-4">Category Sales</h3>
            <div className="h-64 sm:h-80">
              <Doughnut 
                data={categoryChartData} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: { 
                        padding: 10,
                        usePointStyle: true,
                        font: { size: 10 }
                      }
                    }
                  }
                }} 
              />
            </div>
          </div>
        </div>

        {/* Additional Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 mb-6 sm:mb-8">
          {/* Top Products */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 mb-4">Top Products</h3>
            <div className="space-y-3 sm:space-y-4">
              {metrics.topProducts.map((product, index) => (
                <div key={product[0]} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                      <span className="text-xs sm:text-sm font-bold text-primary-700">{index + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900 text-sm sm:text-base truncate">{product[0]}</p>
                      <p className="text-xs sm:text-sm text-neutral-600">{product[1].quantity} units sold</p>
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    <p className="font-semibold text-neutral-900 text-sm sm:text-base">{formatCurrency(product[1].revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 mb-4">Payment Methods</h3>
            <div className="h-56 sm:h-64">
              <Pie 
                data={paymentChartData} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: { 
                        padding: 10,
                        usePointStyle: true,
                        font: { size: 10 }
                      }
                    }
                  }
                }} 
              />
            </div>
          </div>
        </div>

        {/* Inventory Alerts */}
        {(metrics.lowStockItems.length > 0 || metrics.outOfStockItems.length > 0) && (
          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm mb-6 sm:mb-8">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
              Inventory Alerts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {metrics.lowStockItems.length > 0 && (
                <div>
                  <h4 className="font-medium text-yellow-800 mb-3 text-sm sm:text-base">Low Stock Items ({metrics.lowStockItems.length})</h4>
                  <div className="space-y-2">
                    {metrics.lowStockItems.slice(0, 5).map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2 sm:p-3 bg-yellow-50 rounded-lg">
                        <span className="font-medium text-yellow-900 text-sm sm:text-base truncate">{item.productName}</span>
                        <span className="text-xs sm:text-sm text-yellow-700 ml-2">{item.quantity} left</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {metrics.outOfStockItems.length > 0 && (
                <div>
                  <h4 className="font-medium text-red-800 mb-3 text-sm sm:text-base">Out of Stock Items ({metrics.outOfStockItems.length})</h4>
                  <div className="space-y-2">
                    {metrics.outOfStockItems.slice(0, 5).map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2 sm:p-3 bg-red-50 rounded-lg">
                        <span className="font-medium text-red-900 text-sm sm:text-base truncate">{item.productName}</span>
                        <span className="text-xs sm:text-sm text-red-700 ml-2">0 in stock</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Sales */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold text-neutral-900 mb-4">Recent Sales</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-neutral-700 text-xs sm:text-sm">Order ID</th>
                  <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-neutral-700 text-xs sm:text-sm">Customer</th>
                  <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-neutral-700 text-xs sm:text-sm">Items</th>
                  <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-neutral-700 text-xs sm:text-sm">Total</th>
                  <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-neutral-700 text-xs sm:text-sm">Payment</th>
                  <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-neutral-700 text-xs sm:text-sm">Date</th>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 10).map((sale) => (
                  <tr key={sale.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 sm:py-3 px-2 sm:px-4 font-mono text-xs sm:text-sm text-neutral-600">
                      {sale.purchaseRefId || 'N/A'}
                    </td>
                    <td className="py-2 sm:py-3 px-2 sm:px-4">
                      <div>
                        <p className="font-medium text-neutral-900 text-xs sm:text-sm">{sale.customerName || 'Guest'}</p>
                        <p className="text-xs text-neutral-600">{sale.customerPhone || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-neutral-600">
                      {sale.cart && Array.isArray(sale.cart) ? sale.cart.length : 0} items
                    </td>
                    <td className="py-2 sm:py-3 px-2 sm:px-4 font-semibold text-neutral-900 text-xs sm:text-sm">
                      {formatCurrency(sale.total || 0)}
                    </td>
                    <td className="py-2 sm:py-3 px-2 sm:px-4">
                      <span className="inline-flex items-center px-1.5 sm:px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
                        {sale.paymentMethod || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-neutral-600">
                      {sale.timestamp ? formatDate(sale.timestamp.toDate()) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
} 