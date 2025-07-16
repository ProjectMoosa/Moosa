"use client";

import { useUser } from '@/components/useUser';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { saveAs } from 'file-saver';
import { utils, write } from 'xlsx';
import { CgSpinner } from 'react-icons/cg';
import { FiDownload, FiPlusCircle, FiX, FiSettings } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import Container from '@/components/Container';

type CartItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  purchasePrice?: number; // For profit calculation
  category?: string;
  barcode?: string;
  image?: string;
};

type Sale = {
  id: string; // Document ID
  purchaseRefId: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  timestamp: Timestamp;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  firstSeen?: Timestamp;
  lastSeen?: Timestamp;
  points?: number;
};

type LoyaltyConfig = {
  pointsPerRupee: number;
  minimumPurchase: number;
  bonusPoints: number;
  bonusThreshold: number;
  welcomePoints: number;
  pointsRedemptionValue: number; // How much Rs. each point is worth when redeeming
  isEnabled: boolean;
};

export default function BillingPage() {
  const { user } = useUser();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sales');
  const [isQrModalOpen, setQrModalOpen] = useState(false);
  const [isManualAddModalOpen, setManualAddModalOpen] = useState(false);
  const [isLoyaltyConfigModalOpen, setLoyaltyConfigModalOpen] = useState(false);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig>({
    pointsPerRupee: 0.02, // 1 point per Rs. 50 spent (simpler ratio)
    minimumPurchase: 100,
    bonusPoints: 50,
    bonusThreshold: 1000,
    welcomePoints: 100,
    pointsRedemptionValue: 1.0, // 1 point = Rs. 1 (simple redemption)
    isEnabled: true
  });
  const [registrationUrl, setRegistrationUrl] = useState('');
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [salesFilter, setSalesFilter] = useState('');

  useEffect(() => {
    if (user) {
      setRegistrationUrl(`${window.location.origin}/register-customer/${user.uid}`);
    }
  }, [user]);

  // Load loyalty configuration
  useEffect(() => {
    if (!user) return;

    const loadLoyaltyConfig = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'loyalty_config', user.uid));
        if (configDoc.exists()) {
          setLoyaltyConfig(configDoc.data() as LoyaltyConfig);
        }
      } catch (error) {
        console.error('Error loading loyalty config:', error);
      }
    };

    loadLoyaltyConfig();
  }, [user]);

  const saveLoyaltyConfig = async (config: LoyaltyConfig) => {
    if (!user) return;
    
    try {
      await setDoc(doc(db, 'loyalty_config', user.uid), config);
      setLoyaltyConfig(config);
      setLoyaltyConfigModalOpen(false);
    } catch (error) {
      console.error('Error saving loyalty config:', error);
    }
  };

  const calculatePointsForPurchase = (total: number): number => {
    if (!loyaltyConfig.isEnabled || total < loyaltyConfig.minimumPurchase) {
      return 0;
    }

    let points = Math.floor(total * loyaltyConfig.pointsPerRupee);
    
    // Add bonus points if purchase exceeds threshold
    if (total >= loyaltyConfig.bonusThreshold) {
      points += loyaltyConfig.bonusPoints;
    }

    return points;
  };

  const calculatePointsValue = (points: number): number => {
    return points * loyaltyConfig.pointsRedemptionValue;
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      console.log('--- Starting Data Fetch (New Logic) ---');
      try {
        // Step 1: Fetch all documents for the vendor, without sorting.
        const salesQuery = query(
          collection(db, "customer_details"),
          where("vendorId", "==", user.uid)
        );
        const querySnapshot = await getDocs(salesQuery);
        console.log(`[1] Found ${querySnapshot.docs.length} total documents in 'customer_details'.`);

        // Step 2: Filter for documents that are actual sales.
        const saleDocuments = querySnapshot.docs.filter(doc => {
            const data = doc.data();
            // A real sale must have a 'purchaseId' or 'purchaseRefId'.
            return data.purchaseId || data.purchaseRefId;
        });
        console.log(`[2] Filtered down to ${saleDocuments.length} valid sales documents.`);

        // Step 3: Map the valid sale documents to the 'Sale' type.
        const salesData = saleDocuments.map(doc => {
          const data = doc.data();
          const items = data.cart || data.items || data.purchase?.items || [];
          return {
            id: doc.id,
            purchaseRefId: data.purchaseRefId || data.purchaseId,
            customerName: data.customerName || 'N/A',
            customerPhone: data.customerPhone || 'N/A',
            paymentMethod: data.paymentMethod || 'N/A',
            items: items,
            subtotal: data.subtotal || data.purchase?.subtotal || 0,
            tax: data.tax || data.purchase?.tax || 0,
            total: data.total || data.purchase?.total || 0,
            timestamp: data.timestamp || data.createdAt,
          } as Sale;
        });
        console.log('[3] Successfully mapped sales data:', salesData);
        setSales(salesData);

        // Step 4: Fetch customer info.
        const customersQuery = query(
          collection(db, "customer_info"),
          where("vendorId", "==", user.uid)
        );
        const customersSnap = await getDocs(customersQuery);
        const registeredCustomers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as {id: string, name: string, phone: string, createdAt: Timestamp}[];

        // Step 5: Fetch points for all customers in parallel
        const pointsPromises = registeredCustomers.map(cust => {
            const pointsQuery = query(collection(db, 'points'), where('customerId', '==', cust.id), where('vendorId', '==', user.uid));
            return getDocs(pointsQuery);
        });
        const pointsSnapshots = await Promise.all(pointsPromises);
        const customerPoints = new Map<string, number>();
        pointsSnapshots.forEach((snap, index) => {
            const customerId = registeredCustomers[index].id;
            const totalPoints = snap.docs.reduce((sum, doc) => sum + doc.data().pointsEarned, 0);
            customerPoints.set(customerId, totalPoints);
        });

        // Step 6: Augment customer list with purchase dates.
        const purchaseDates = new Map<string, { firstSeen: Timestamp; lastSeen: Timestamp }>();
        salesData.forEach(sale => {
          if (sale.customerPhone && sale.timestamp) {
            const entry = purchaseDates.get(sale.customerPhone);
            if (entry) {
              if (sale.timestamp.seconds < entry.firstSeen.seconds) entry.firstSeen = sale.timestamp;
              if (sale.timestamp.seconds > entry.lastSeen.seconds) entry.lastSeen = sale.timestamp;
            } else {
              purchaseDates.set(sale.customerPhone, { firstSeen: sale.timestamp, lastSeen: sale.timestamp });
            }
          }
        });
        
        const combinedCustomers: Customer[] = registeredCustomers.map(cust => {
          const dates = purchaseDates.get(cust.phone);
          return {
            id: cust.id,
            name: cust.name,
            phone: cust.phone,
            firstSeen: dates?.firstSeen,
            lastSeen: dates?.lastSeen,
            points: customerPoints.get(cust.id) || 0,
          };
        });
        setCustomers(combinedCustomers);
        console.log('[4] Successfully processed customer data.');

      } catch (error) {
        console.error("--- Error during data fetch ---", error);
      } finally {
        setLoading(false);
        console.log('--- Data Fetch Complete ---');
      }
    };

    fetchData();
  }, [user, refetchTrigger]);

  const onCustomerAdded = () => {
    setRefetchTrigger(t => t + 1);
  };

  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toFixed(2)}`;
  };

  // Sort sales by timestamp descending (newest first)
  const sortedSales = [...sales].sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return b.timestamp.seconds - a.timestamp.seconds;
  });

  // Filter sales by customer name, phone, or order ID
  const filteredSales = sortedSales.filter(sale => {
    const search = salesFilter.toLowerCase();
    return (
      (sale.customerName && sale.customerName.toLowerCase().includes(search)) ||
      (sale.customerPhone && sale.customerPhone.toLowerCase().includes(search)) ||
      (sale.purchaseRefId && sale.purchaseRefId.toLowerCase().includes(search))
    );
  });

  // Date format: DD/MMM/YYYY, always two digits for day
  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp.seconds * 1000);
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const calculateProfit = (items: CartItem[]): number | null => {
    if (!items || !Array.isArray(items)) return null;

    let totalProfit = 0;
    for (const item of items) {
      if (typeof item.purchasePrice === 'number' && typeof item.price === 'number') {
        totalProfit += (item.price - item.purchasePrice) * item.quantity;
      } else {
        return null;
      }
    }
    return totalProfit;
  };

  const exportToExcel = () => {
    const dataToExport = sales.map(s => {
      const profit = calculateProfit(s.items);
      return {
        'Reference ID': s.purchaseRefId,
        'Date': formatDate(s.timestamp),
        'Customer': s.customerName,
        'Items Sold': s.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
        'Total Amount': s.total,
        'Profit': profit !== null ? profit : 'N/A',
      };
    });
    const worksheet = utils.json_to_sheet(dataToExport);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Sales Report');
    const excelBuffer = write(workbook, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([excelBuffer], { type: 'application/octet-stream' }), 'sales_report.xlsx');
  };

  return (
    <>
      <Container>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800">Billing</h1>
        </div>
        <p className="text-sm sm:text-base text-neutral-600 mb-6">Manage your sales and customer data</p>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-neutral-100 p-1 rounded-lg mb-6">
          {[
            { id: 'sales', label: 'Sales History', count: filteredSales.length },
            { id: 'customers', label: 'Customers', count: customers.length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Sales Tab */}
        {activeTab === 'sales' && (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-neutral-900">Sales History</h2>
                  <p className="text-sm text-neutral-600">View and export your sales data</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search sales..."
                    value={salesFilter}
                    onChange={(e) => setSalesFilter(e.target.value)}
                    className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button
                    onClick={exportToExcel}
                    className="px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-100 rounded-lg shadow-sm hover:bg-primary-200 flex items-center gap-2"
                  >
                    <FiDownload className="w-4 h-4" />
                    Export
                  </button>
                </div>
              </div>
              
              {filteredSales.length > 0 ? (
                <div className="overflow-x-auto">
                  {/* Desktop Table */}
                  <table className="min-w-full divide-y divide-neutral-200 hidden md:table">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Order ID</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Customer</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Items</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Total</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Payment</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {filteredSales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-neutral-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-neutral-900">{sale.purchaseRefId}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-neutral-900">{sale.customerName}</div>
                              <div className="text-sm text-neutral-500">{sale.customerPhone}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">{sale.items.length} items</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-neutral-900 lato-regular">{formatCurrency(sale.total)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
                              {sale.paymentMethod}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">{formatDate(sale.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-4">
                    {filteredSales.map((sale) => (
                      <div key={sale.id} className="border border-neutral-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-semibold text-neutral-900">{sale.customerName}</div>
                            <div className="text-sm text-neutral-600">{sale.customerPhone}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-neutral-900 lato-regular">{formatCurrency(sale.total)}</div>
                            <div className="text-xs text-neutral-500">{formatDate(sale.timestamp)}</div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-sm text-neutral-600">
                          <span>Order: {sale.purchaseRefId}</span>
                          <span>{sale.items.length} items</span>
                        </div>
                        <div className="mt-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
                            {sale.paymentMethod}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-neutral-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">No Sales Found</h3>
                  <p className="text-neutral-500">No sales match your current search criteria.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-neutral-900">Customer Management</h2>
                  <p className="text-sm text-neutral-600">Manage your customer database and loyalty points</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setManualAddModalOpen(true)}
                    className="px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-100 rounded-lg shadow-sm hover:bg-primary-200 flex items-center gap-2"
                  >
                    <FiPlusCircle className="w-4 h-4" />
                    Add Customer
                  </button>
                  <button
                    onClick={() => setLoyaltyConfigModalOpen(true)}
                    className="px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-100 rounded-lg shadow-sm hover:bg-primary-200 flex items-center gap-2"
                  >
                    <FiSettings className="w-4 h-4" />
                    Loyalty Settings
                  </button>
                  <button
                    onClick={() => setQrModalOpen(true)}
                    className="px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-100 rounded-lg shadow-sm hover:bg-primary-200"
                  >
                    Show QR Code
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
              {customers.length > 0 ? (
                <div>
                  {/* Desktop Table */}
                  <table className="min-w-full divide-y divide-neutral-200 hidden md:table">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Phone</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Points</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">First Purchase</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Last Purchase</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {customers.map(c => (
                        <tr key={c.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">{c.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">{c.phone}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">{c.points || 0}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {c.firstSeen ? formatDate(c.firstSeen) : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {c.lastSeen ? formatDate(c.lastSeen) : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Mobile Cards */}
                  <div className="md:hidden">
                    {customers.map(c => (
                      <div key={c.id} className="border-t border-neutral-200 p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-neutral-900">{c.name}</div>
                            <div className="text-sm text-neutral-600">{c.phone}</div>
                            <div className="text-xs text-neutral-500">Points: {c.points || 0}</div>
                          </div>
                          <div className="text-right text-xs text-neutral-500">
                            <div>First: {c.firstSeen ? formatDate(c.firstSeen) : 'N/A'}</div>
                            <div>Last: {c.lastSeen ? formatDate(c.lastSeen) : 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-neutral-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">No Customers Registered Yet</h3>
                  <p className="text-neutral-500">Customers will appear here once they make their first purchase.</p>
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </Container>

      {isManualAddModalOpen && (
        <ManualAddCustomerModal
          isOpen={isManualAddModalOpen}
          onClose={() => setManualAddModalOpen(false)}
          vendorId={user?.uid || ''}
          onCustomerAdded={onCustomerAdded}
        />
      )}

      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={() => setQrModalOpen(false)}>
          <div className="bg-white p-8 rounded-xl shadow-2xl text-center relative" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-neutral-800 mb-4">Customer Registration</h2>
            <p className="text-neutral-600 mb-6">Scan this code to register and get exclusive offers.</p>
            <div className="p-4 bg-white inline-block rounded-lg">
              <QRCodeSVG value={registrationUrl} size={256} />
            </div>
            <p className="mt-4 text-sm text-neutral-500 break-all">{registrationUrl}</p>
            <button
                onClick={() => setQrModalOpen(false)}
                className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-800"
            >
                <FiX size={24} />
            </button>
          </div>
        </div>
      )}

      {isLoyaltyConfigModalOpen && (
        <LoyaltyConfigModal
          isOpen={isLoyaltyConfigModalOpen}
          onClose={() => setLoyaltyConfigModalOpen(false)}
          config={loyaltyConfig}
          onSave={saveLoyaltyConfig}
        />
      )}
    </>
  );
} 

// Manual Add Customer Modal Component
type ManualAddCustomerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  onCustomerAdded: () => void;
};

function ManualAddCustomerModal({ isOpen, onClose, vendorId, onCustomerAdded }: ManualAddCustomerModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      setError('Please fill in both fields.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      await addDoc(collection(db, 'customer_info'), {
        vendorId,
        name,
        phone,
        points: 0, // Initialize points for the new customer
        createdAt: Timestamp.now(),
      });
      onCustomerAdded(); // Refresh the customer list
      onClose(); // Close the modal
    } catch (err) {
      console.error(err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={onClose}>
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-neutral-800">Manual Registration</h2>
                <button onClick={onClose} className="text-neutral-500 hover:text-neutral-800"><FiX size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="manual-name" className="text-sm font-medium text-neutral-700">Full Name</label>
                <input
                  id="manual-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter customer's full name"
                  className="mt-1 w-full p-3 border border-neutral-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label htmlFor="manual-phone" className="text-sm font-medium text-neutral-700">Phone Number</label>
                <input
                  id="manual-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter customer's phone number"
                  className="mt-1 w-full p-3 border border-neutral-300 rounded-lg"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 disabled:bg-primary-300"
                >
                  {loading && <CgSpinner className="animate-spin" />}
                  Add Customer
                </button>
              </div>
            </form>
        </div>
    </div>
  );
} 

// Loyalty Configuration Modal Component
type LoyaltyConfigModalProps = {
  isOpen: boolean;
  onClose: () => void;
  config: LoyaltyConfig;
  onSave: (config: LoyaltyConfig) => void;
};

function LoyaltyConfigModal({ isOpen, onClose, config, onSave }: LoyaltyConfigModalProps) {
  const [formData, setFormData] = useState<LoyaltyConfig>(config);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData(config);
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Error saving loyalty config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof LoyaltyConfig, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: typeof value === 'string' ? parseFloat(value) || 0 : value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={onClose}>
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-neutral-800">Loyalty Points Configuration</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-800">
            <FiX size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Enable/Disable Loyalty Program */}
          <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
            <div>
              <h3 className="font-semibold text-neutral-900">Enable Loyalty Program</h3>
              <p className="text-sm text-neutral-600">Turn on or off the loyalty points system</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isEnabled}
                onChange={(e) => handleInputChange('isEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* Basic Points Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Rupees per Point (Earning)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={formData.pointsPerRupee > 0 ? Math.round(1 / formData.pointsPerRupee) : 50}
                onChange={(e) => {
                  const rupeesPerPoint = parseInt(e.target.value) || 50;
                  handleInputChange('pointsPerRupee', 1 / rupeesPerPoint);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="50"
              />
              <p className="text-xs text-neutral-500 mt-1">How many rupees spent to earn 1 point (e.g., 50 = Rs. 50 spent = 1 point earned)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Points Redemption Value (Rs.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.pointsRedemptionValue}
                onChange={(e) => handleInputChange('pointsRedemptionValue', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="1.0"
              />
              <p className="text-xs text-neutral-500 mt-1">How much Rs. each point is worth when redeeming (1.0 = 1 point = Rs. 1)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Minimum Purchase (Rs.)
              </label>
              <input
                type="number"
                min="0"
                value={formData.minimumPurchase}
                onChange={(e) => handleInputChange('minimumPurchase', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="100"
              />
              <p className="text-xs text-neutral-500 mt-1">Minimum purchase amount to earn points</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Welcome Points
              </label>
              <input
                type="number"
                min="0"
                value={formData.welcomePoints}
                onChange={(e) => handleInputChange('welcomePoints', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="100"
              />
              <p className="text-xs text-neutral-500 mt-1">Points given to new customers when they register</p>
            </div>
          </div>

          {/* Bonus Points Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Bonus Points
              </label>
              <input
                type="number"
                min="0"
                value={formData.bonusPoints}
                onChange={(e) => handleInputChange('bonusPoints', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="50"
              />
              <p className="text-xs text-neutral-500 mt-1">Extra points given when threshold is reached</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Bonus Threshold (Rs.)
              </label>
              <input
                type="number"
                min="0"
                value={formData.bonusThreshold}
                onChange={(e) => handleInputChange('bonusThreshold', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="1000"
              />
              <p className="text-xs text-neutral-500 mt-1">Purchase amount to trigger bonus points</p>
            </div>
          </div>

          {/* Example Calculation */}
          <div className="p-4 bg-primary-50 rounded-lg">
            <h4 className="font-semibold text-primary-800 mb-2">Example Calculation</h4>
            <p className="text-sm text-primary-700">
              For a Rs. 1,500 purchase:
            </p>
            <ul className="text-sm text-primary-700 mt-2 space-y-1">
              <li>• Rupees per point: {formData.pointsPerRupee > 0 ? Math.round(1 / formData.pointsPerRupee) : 50}</li>
              <li>• Base points: {Math.floor(1500 * formData.pointsPerRupee)}</li>
              <li>• Bonus points: {1500 >= formData.bonusThreshold ? formData.bonusPoints : 0}</li>
              <li>• Total points: {Math.floor(1500 * formData.pointsPerRupee) + (1500 >= formData.bonusThreshold ? formData.bonusPoints : 0)}</li>
              <li>• Points value: Rs. {((Math.floor(1500 * formData.pointsPerRupee) + (1500 >= formData.bonusThreshold ? formData.bonusPoints : 0)) * formData.pointsRedemptionValue).toFixed(2)}</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <CgSpinner className="animate-spin" />}
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 