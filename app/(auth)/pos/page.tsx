"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, writeBatch, Timestamp, addDoc, orderBy, updateDoc, increment } from 'firebase/firestore';
import { useUser } from '@/components/useUser';
import { useRouter } from 'next/navigation';
import { Search, ScanBarcode, ChevronDown, Repeat, AlertTriangle, X } from 'lucide-react';

// Interfaces
interface StockItem {
  id: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  purchasePrice?: number;
  category?: string;
}

interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  originalQuantity: number;
  purchasePrice?: number;
}

interface SaleData {
  cart: {
      id: string;
      name: string;
      quantity: number;
      price: number;
      purchasePrice?: number;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  vendorId: string;
  timestamp: Timestamp;
  purchaseRefId: string;
}

// Main Component
export default function POSPage() {
  const { user, loading, role } = useUser();
  const router = useRouter();
  
  // State Management
  const [stock, setStock] = useState<StockItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Guest');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerInfoId, setCustomerInfoId] = useState<string | null>(null);
  const [customerPoints, setCustomerPoints] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState(false);
  const [categories, setCategories] = useState<string[]>(['All Categories']);
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<SaleData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const taxRate = 0.15; // 15%

  // Effects
  useEffect(() => {
    if (!loading && role !== 'vendor') {
      router.replace('/dashboard');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (user) {
      const fetchStock = async () => {
        const q = query(collection(db, 'vendor_stocks'), where('vendorId', '==', user.uid));
        const snap = await getDocs(q);
        const stockData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
        setStock(stockData);
        
        const uniqueCategories = ['All Categories', ...Array.from(new Set(stockData.map(item => item.category).filter(Boolean) as string[]))];
        setCategories(uniqueCategories);
      };
      fetchStock();
    }
  }, [user]);
    
  const { subtotal, tax, total } = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [cart, taxRate]);

  const initiateCheckout = () => {
    if (cart.length === 0) {
      alert("Your cart is empty.");
      return;
    }
    setPaymentModalOpen(true);
  };

  const handleCustomerLookup = async () => {
    if(!user || !customerPhone || customerPhone.length < 5) return;
    setPurchaseHistory([]);
    setCustomerName('Guest');
    setCustomerInfoId(null);
    setCustomerPoints(null);

    // 1. Look for the customer in the main customer directory
    const customerQuery = query(
      collection(db, 'customer_info'),
      where('vendorId', '==', user.uid),
      where('phone', '==', customerPhone)
    );
    const customerSnap = await getDocs(customerQuery);

    if (!customerSnap.empty) {
      const customerDoc = customerSnap.docs[0];
      const customerData = customerDoc.data();
      setCustomerName(customerData.name);
      setCustomerInfoId(customerDoc.id);
      setCustomerPoints(customerData.points || 0);

      // 2. Fetch their purchase history from the sales records
      setHistoryLoading(true);
      const historyQuery = query(
          collection(db, 'customer_details'),
          where('vendorId', '==', user.uid),
          where('customerPhone', '==', customerPhone),
          orderBy('timestamp', 'desc')
      );
      const historySnap = await getDocs(historyQuery);
      setPurchaseHistory(historySnap.docs.map(doc => doc.data() as SaleData));
      setHistoryLoading(false);
    } else {
      console.log("No registered customer found with this mobile number.");
      // Allow proceeding with the sale for a new/unregistered customer
    }
  };

  const openCustomerModal = () => {
    setCustomerModalOpen(true);
  };

  const completeSale = async (andPrint: boolean) => {
    if (!user || cart.length === 0 || processing) return;

    setProcessing(true);

    const batch = writeBatch(db);
    const saleTimestamp = Timestamp.now();

    // 1. Update stock quantities
    cart.forEach(item => {
      const stockRef = doc(db, 'vendor_stocks', item.id);
      const newQuantity = item.originalQuantity - item.quantity;
      batch.update(stockRef, { quantity: newQuantity });
    });

    // 2. Create sale data object
    const saleData = {
      // Explicitly map cart items to ensure no 'undefined' values are sent to Firestore.
      cart: cart.map(({ id, name, quantity, price, purchasePrice }) => {
        const saleItem: any = { id, name, quantity, price };
        if (purchasePrice !== undefined) {
          saleItem.purchasePrice = purchasePrice;
        }
        return saleItem;
      }),
      subtotal: subtotal,
      tax: tax,
      total: total,
      paymentMethod: paymentMethod,
      customerName: customerName || 'Guest',
      customerPhone: customerPhone || '',
      vendorId: user.uid,
      timestamp: saleTimestamp,
      purchaseRefId: `#M${String(saleTimestamp.seconds).slice(-6)}`,
    };
    
    // 3. Add to top-level sales collection (for billing page)
    const saleDocRef = doc(collection(db, 'sales'));
    batch.set(saleDocRef, saleData);

    // 4. Add to customer_details collection (for customer history)
    if (customerPhone && customerName !== 'Guest') {
      const customerSaleRef = doc(collection(db, 'customer_details'));
      batch.set(customerSaleRef, saleData);
    }
    
    // 5. Commit batch
    await batch.commit();
    
    // 6. Update customer points if they are a registered customer
    if (customerInfoId) {
      const customerRef = doc(db, 'customer_info', customerInfoId);
      const pointsFromSale = Math.floor(total);
      await updateDoc(customerRef, {
        points: increment(pointsFromSale)
      });
    }

    if (andPrint) {
      console.log("Printing receipt...");
      // A proper implementation would print a dedicated receipt component, not the whole window.
      // For now, we'll just log to the console.
    }

    // 7. Clear cart and reset state
    setCart([]);
    setCustomerName('Guest');
    setCustomerPhone('');
    setCustomerInfoId(null);
    setCustomerPoints(null);
    setPaymentModalOpen(false);
    setAmountPaid(null);
    setProcessing(false);
    console.log("Sale complete!");
  };

  const handleFinalizeSale = (andPrint: boolean) => {
    if (cart.length === 0 || !user || processing) return;
    completeSale(andPrint);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === 'k') {
          e.preventDefault();
          document.getElementById('search-products')?.focus();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          initiateCheckout();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [initiateCheckout]);

  // Cart & Calculation Logic
  const addToCart = (item: StockItem) => {
    setCart(prev => {
      if (prev.find(cartItem => cartItem.id === item.id)) return prev;
      return [...prev, { 
        id: item.id, 
        name: item.productName, 
        quantity: 1, 
        price: item.sellingPrice, 
        originalQuantity: item.quantity,
        purchasePrice: item.purchasePrice 
      }];
    });
  };

  const updateQuantity = (id: string, newQuantity: number) => {
    const stockItem = stock.find(item => item.id === id);
    if (!stockItem || newQuantity < 1) {
      removeFromCart(id);
      return;
    }
    if (newQuantity > stockItem.quantity) return; // Maybe show a toast
    setCart(cart.map(item => item.id === id ? { ...item, quantity: newQuantity } : item));
  };
  
  const removeFromCart = (id: string) => setCart(cart.filter(item => item.id !== id));

  // Data Filtering
  const filteredStock = useMemo(() => {
    return stock.filter(item => {
      const matchesCategory = selectedCategory === 'All Categories' || item.category === selectedCategory;
      const matchesSearch = item.productName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [stock, searchTerm, selectedCategory]);
  
  const formatCurrency = (amount: number) => `LKR ${amount.toFixed(2)}`;
  
  if (loading || !user) {
    return <div className="w-full h-screen flex items-center justify-center">Loading...</div>;
  }
  
  const changeToReturn = useMemo(() => {
      if(amountPaid === null || amountPaid < total) return 0;
      return amountPaid - total;
  }, [amountPaid, total]);

  // UI
  return (
    <>
      <div className="h-screen bg-neutral-50 flex flex-col lg:flex-row">
        {/* Main Content - Product Selection */}
        <div className="flex-1 flex flex-col h-full">
          {/* Header */}
          <header className="bg-white border-b border-neutral-200 p-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-neutral-800">Point of Sale</h1>
            <div className="flex items-center gap-4">
              <div className="text-sm font-medium text-neutral-600">{user?.displayName || user?.email}</div>
              <button onClick={() => router.push('/dashboard')} className="text-neutral-500 hover:text-neutral-800">
                <X size={20} />
              </button>
            </div>
          </header>

          {/* Search and Filter */}
          <div className="p-4 bg-white border-b border-neutral-200">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
                <input
                  id="search-products"
                  type="text"
                  placeholder="Search products... (Ctrl+K)"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="appearance-none w-full md:w-48 bg-white border border-neutral-300 rounded-lg py-2 pl-3 pr-8 focus:ring-2 focus:ring-primary-500"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              </div>
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredStock.map(item => (
                <div
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`bg-white p-3 rounded-lg shadow-sm cursor-pointer transition-transform transform hover:scale-105 border-2 ${
                    cart.some(c => c.id === item.id) ? 'border-primary-500' : 'border-transparent'
                  } ${item.quantity === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-semibold text-sm truncate">{item.productName}</div>
                  <div className="text-xs text-neutral-500">{item.category}</div>
                  <div className="mt-2 text-right font-bold text-primary-700">{formatCurrency(item.sellingPrice)}</div>
                  {item.quantity < 10 && item.quantity > 0 && (
                     <div className="mt-1 text-xs text-yellow-600 font-bold">Only {item.quantity} left</div>
                  )}
                   {item.quantity === 0 && (
                     <div className="mt-1 text-xs text-red-600 font-bold">Out of stock</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Cart & Checkout */}
        <div className="w-full lg:w-96 bg-white border-l border-neutral-200 flex flex-col shadow-lg">
          {/* Customer Section */}
          <div className="p-4 border-b border-neutral-200">
            <h2 className="font-bold text-lg mb-2">Customer</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Customer Phone"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                onBlur={handleCustomerLookup}
                className="flex-grow border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
              />
              <button
                onClick={openCustomerModal}
                className="bg-primary-100 text-primary-700 font-semibold px-3 py-1.5 rounded-md text-sm"
              >
                {customerName === 'Guest' ? 'Details' : customerName.split(' ')[0]}
              </button>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="text-center text-neutral-500 pt-16">
                <p>Your cart is empty.</p>
                <p className="text-xs">Add products to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-neutral-500">{formatCurrency(item.price)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                        className="w-14 text-center border border-neutral-300 rounded-md p-1 text-sm"
                        min="1"
                        max={item.originalQuantity}
                      />
                      <button onClick={() => removeFromCart(item.id)} className="text-neutral-400 hover:text-red-500">
                        <X size={16}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checkout Summary & Action */}
          <div className="p-4 border-t border-neutral-200 bg-neutral-50">
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-neutral-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Tax ({taxRate * 100}%)</span>
                <span className="font-medium">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
            <button
              onClick={initiateCheckout}
              disabled={cart.length === 0 || processing}
              className="w-full bg-primary-700 text-white font-bold py-3 rounded-lg shadow-md hover:bg-primary-800 disabled:bg-primary-300 transition-all"
            >
              {processing ? 'Processing...' : 'Checkout (Ctrl+Enter)'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Payment Modal */}
      {isPaymentModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                   <div className="p-6 border-b">
                     <h2 className="text-2xl font-bold text-center">Complete Sale</h2>
                     <div className="text-center text-4xl font-extrabold my-4 text-primary-700">{formatCurrency(total)}</div>
                   </div>
                   <div className="p-6 space-y-4">
                        <select
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value)}
                            className="w-full border border-neutral-300 rounded-lg py-2.5 px-4"
                        >
                            <option>Cash</option>
                            <option>Card</option>
                            <option>Online</option>
                        </select>
                        {paymentMethod === 'Cash' && (
                            <input
                                type="number"
                                placeholder="Amount Paid (Optional)"
                                value={amountPaid ?? ''}
                                onChange={e => setAmountPaid(e.target.value ? Number(e.target.value) : null)}
                                className="w-full border border-neutral-300 rounded-lg py-2.5 px-4"
                            />
                        )}
                        {paymentMethod === 'Cash' && amountPaid && amountPaid > total && (
                             <div className="text-center bg-blue-50 text-blue-800 p-3 rounded-lg font-medium">
                                 Change Due: {formatCurrency(amountPaid - total)}
                             </div>
                        )}
                   </div>
                   <div className="p-6 bg-neutral-50 rounded-b-xl grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => handleFinalizeSale(false)}
                        disabled={processing}
                        className="w-full col-span-1 sm:col-span-1 px-4 py-3 text-sm font-semibold text-white bg-green-600 rounded-lg shadow-sm hover:bg-green-700 disabled:bg-green-300"
                      >
                        Save
                      </button>
                       <button
                        onClick={() => setPaymentModalOpen(false)}
                        className="w-full col-span-1 sm:col-span-1 px-4 py-3 text-sm font-semibold text-neutral-700 bg-neutral-200 rounded-lg shadow-sm hover:bg-neutral-300"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleFinalizeSale(true)}
                        disabled={processing}
                        className="w-full col-span-1 sm:col-span-1 px-4 py-3 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 disabled:bg-primary-300"
                      >
                        Print
                      </button>
                   </div>
              </div>
          </div>
      )}

      {/* Customer Modal */}
      {isCustomerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm mx-4">
                   <div className="flex justify-between items-center pb-3 border-b">
                      <h2 className="text-xl font-semibold">Customer Details</h2>
                      <button onClick={() => setCustomerModalOpen(false)}><X className="w-5 h-5 text-neutral-500"/></button>
                  </div>
                  <div className="space-y-4">
                     <div>
                      <label className="text-sm font-medium text-neutral-700">Mobile Number</label>
                      <input
                          type="text"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          onBlur={handleCustomerLookup}
                          placeholder="Customer's mobile"
                          className="mt-1 w-full p-2 border border-neutral-300 rounded-lg"
                      />
                    </div>
                     <div>
                      <label className="text-sm font-medium text-neutral-700">Customer Name</label>
                      <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Customer's name"
                          className="mt-1 w-full p-2 border border-neutral-300 rounded-lg"
                          readOnly={customerName !== 'Guest' && customerPhone !== ''}
                      />
                    </div>

                    {customerPoints !== null && (
                        <div className="bg-primary-50 border border-primary-200 p-3 rounded-lg text-center">
                            <p className="text-sm text-primary-700">Available Points</p>
                            <p className="text-2xl font-bold text-primary-800">{customerPoints}</p>
                        </div>
                    )}

                    {/* Purchase History Section */}
                    {purchaseHistory.length > 0 && !historyLoading && (
                        <div className="border-t pt-4 mt-4">
                            <h3 className="text-lg font-semibold mb-2">Purchase History</h3>
                            <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                                {purchaseHistory.map((sale, index) => (
                                    <div key={index} className="text-sm bg-neutral-50 p-2 rounded-md">
                                        <div className="flex justify-between">
                                            <span>{new Date(sale.timestamp.seconds * 1000).toLocaleDateString()}</span>
                                            <span className="font-medium">{formatCurrency(sale.total)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {historyLoading && <p className="text-sm text-neutral-500">Loading history...</p>}


                    <button
                      onClick={() => setCustomerModalOpen(false)}
                      className="w-full px-4 py-2 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800"
                    >
                      Done
                    </button>
                  </div>
              </div>
          </div>
      )}
    </>
  );
} 