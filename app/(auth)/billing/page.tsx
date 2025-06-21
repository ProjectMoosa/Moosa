"use client";

import { useUser } from '@/components/useUser';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp, addDoc } from 'firebase/firestore';
import { saveAs } from 'file-saver';
import { utils, write } from 'xlsx';
import { CgSpinner } from 'react-icons/cg';
import { FiDownload, FiPlusCircle, FiX } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';

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

export default function BillingPage() {
  const { user } = useUser();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sales');
  const [isQrModalOpen, setQrModalOpen] = useState(false);
  const [isManualAddModalOpen, setManualAddModalOpen] = useState(false);
  const [registrationUrl, setRegistrationUrl] = useState('');
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    if (user) {
      setRegistrationUrl(`${window.location.origin}/register-customer/${user.uid}`);
    }
  }, [user]);

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

  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp.seconds * 1000).toLocaleDateString();
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
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-neutral-800">Billing</h1>
        </div>

        <div className="mb-6 border-b border-neutral-200">
          <nav className="flex space-x-4">
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-3 py-2 font-medium text-sm rounded-md ${
                activeTab === 'sales'
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Sales
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-3 py-2 font-medium text-sm rounded-md ${
                activeTab === 'customers'
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Registered Customers
            </button>
          </nav>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <CgSpinner className="animate-spin text-4xl text-primary-600" />
          </div>
        ) : (
          <div>
            {activeTab === 'sales' && (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* Summary Cards */}
                </div>
                <div className="bg-white rounded-lg shadow-sm">
                  <div className="p-4 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Sales History</h2>
                    <button
                      onClick={exportToExcel}
                      className="px-4 py-2 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 flex items-center gap-2"
                    >
                      <FiDownload />
                      Export
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    {sales.length > 0 ? (
                      <div>
                        {/* Desktop Table */}
                        <table className="min-w-full divide-y divide-neutral-200 hidden md:table">
                          <thead className="bg-neutral-50">
                            <tr>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Ref ID</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Customer</th>
                              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">Items Sold</th>
                              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Total</th>
                              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Profit</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-neutral-200">
                            {sales.map(s => {
                              const itemsSoldCount = s.items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) ?? 0;
                              const itemsSoldDisplay = itemsSoldCount > 0 ? itemsSoldCount : (s.total > 0 ? 'N/A' : 0);

                              return (
                              <tr key={s.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                                  <div title={s.items?.map(item => `${item.name} (x${item.quantity})`).join(', ')}>
                                    {s.purchaseRefId}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{formatDate(s.timestamp)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{s.customerName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-center">
                                  {itemsSoldDisplay}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-right">{formatCurrency(s.total)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-right">
                                  {calculateProfit(s.items) !== null ? formatCurrency(calculateProfit(s.items)!) : 'N/A'}
                                </td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                        {/* Mobile Cards */}
                        <div className="md:hidden">
                           {sales.map(s => {
                              const itemsSoldCount = s.items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) ?? 0;
                              const itemsSoldDisplay = itemsSoldCount > 0 ? itemsSoldCount : (s.total > 0 ? 'N/A' : 0);
                              const profit = calculateProfit(s.items);

                              return (
                                <div key={s.id} className="border-t border-neutral-200 p-4">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <div
                                        className="font-semibold text-primary-700"
                                        title={s.items?.map(item => `${item.name} (x${item.quantity})`).join(', ')}
                                      >
                                        {s.purchaseRefId}
                                      </div>
                                      <div className="text-sm text-neutral-800">{s.customerName}</div>
                                      <div className="text-xs text-neutral-500">{formatDate(s.timestamp)}</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-bold text-lg">{formatCurrency(s.total)}</div>
                                      {profit !== null && <div className="text-xs text-green-600">Profit: {formatCurrency(profit)}</div>}
                                    </div>
                                  </div>
                                  <div className="text-center mt-2 text-sm">
                                    Items Sold: {itemsSoldDisplay}
                                  </div>
                                </div>
                              )
                           })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="text-neutral-400 mb-4">
                          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900 mb-2">No Sales Recorded Yet</h3>
                        <p className="text-neutral-500">Start making sales through the POS to see them appear here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'customers' && (
              <div>
                <div className="bg-white rounded-lg shadow-sm">
                   <div className="p-4 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Registered Customers</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setManualAddModalOpen(true)}
                        className="px-4 py-2 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 flex items-center gap-2"
                      >
                        <FiPlusCircle />
                        Add Customer
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
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">{c.points}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">{formatDate(c.firstSeen)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">{formatDate(c.lastSeen)}</td>
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
                                  <div className="font-semibold text-neutral-800">{c.name}</div>
                                  <div className="text-sm text-neutral-500">{c.phone}</div>
                                </div>
                                <div className="text-right">
                                   <div className="font-bold text-primary-700">{c.points} pts</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                                <div>
                                  <div className="text-xs text-neutral-400">First Purchase</div>
                                  <div>{formatDate(c.firstSeen)}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-neutral-400">Last Purchase</div>
                                  <div>{formatDate(c.lastSeen)}</div>
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900 mb-2">No Customers Registered Yet</h3>
                        <p className="text-neutral-500">Use the buttons above to add customers or show the QR code for self-registration.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isManualAddModalOpen && (
        <ManualAddCustomerModal
          isOpen={isManualAddModalOpen}
          onClose={() => setManualAddModalOpen(false)}
          vendorId={user!.uid}
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
    </div>
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