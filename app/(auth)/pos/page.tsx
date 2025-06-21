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
  lowStockThreshold?: number;
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

  const hasLowStockItems = useMemo(() => {
    return stock.some(item => item.quantity > 0 && item.quantity < (item.lowStockThreshold || 5));
  }, [stock]);

  const getStockStatus = (item: StockItem) => {
    const threshold = item.lowStockThreshold || 5;
    if (item.quantity === 0) return { text: 'Out of Stock', color: 'bg-red-500' };
    if (item.quantity < threshold) return { text: 'Low Stock', color: 'bg-yellow-500' };
    return { text: 'In Stock', color: 'bg-green-500' };
  };

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
      const customerId = customerDoc.id;
      
      setCustomerName(customerData.name);
      setCustomerInfoId(customerId);

      // 2. Calculate total points from the 'points' collection
      const pointsQuery = query(
        collection(db, 'points'), 
        where('customerId', '==', customerId),
        where('vendorId', '==', user.uid) // Added vendorId to comply with security rules
      );
      const pointsSnap = await getDocs(pointsQuery);
      const totalPoints = pointsSnap.docs.reduce((sum, doc) => sum + doc.data().pointsEarned, 0);
      setCustomerPoints(totalPoints);

      // 3. Fetch their purchase history from the sales records
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
    
    // 6. Add a record to the new 'points' collection if customer is registered
    if (customerInfoId) {
      const pointsFromSale = Math.floor(total / 200);
      if (pointsFromSale > 0) {
        await addDoc(collection(db, 'points'), {
          vendorId: user.uid,
          customerId: customerInfoId,
          pointsEarned: pointsFromSale,
          purchaseTotal: total,
          purchaseRefId: saleData.purchaseRefId,
          timestamp: saleTimestamp
        });
      }
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

  // Render JSX
  return (
    <>
      {/* Desktop View */}
      <div className="hidden lg:block bg-neutral-50 min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <header className="py-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-neutral-800">Point of Sale</h1>
            <div className="flex items-center gap-2">
              <button 
                onClick={openCustomerModal}
                className="px-4 py-2 text-sm font-medium bg-white border border-neutral-200 rounded-lg shadow-sm hover:bg-neutral-100">
                Customer Details
              </button>
              <button 
                onClick={initiateCheckout} 
                disabled={processing || cart.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 disabled:bg-primary-300"
              >
                {processing ? 'Processing...' : 'Complete Sale (Ctrl + Enter)'}
              </button>
            </div>
          </header>

          {/* Main Content */}
          <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel: Products */}
            <div className="lg:col-span-2">
              <div className="p-4 bg-white rounded-lg border border-neutral-200 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      id="search-products"
                      type="text"
                      placeholder="Search products... (Ctrl + K)"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button className="px-4 py-2 text-sm font-medium bg-white border border-neutral-300 rounded-lg shadow-sm hover:bg-neutral-100 flex items-center justify-center gap-2">
                      <ScanBarcode className="w-5 h-5" /> Scan
                    </button>
                    <div className="relative">
                      <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="w-full h-full px-4 py-2 text-sm text-left bg-white border border-neutral-300 rounded-lg shadow-sm appearance-none hover:bg-neutral-100"
                      >
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                    <button className="px-3 py-1.5 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full hover:bg-yellow-200 flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" />Repeat Last Sale</button>
                    {hasLowStockItems && (
                      <button className="px-3 py-1.5 text-xs font-semibold text-red-800 bg-red-100 rounded-full hover:bg-red-200 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Low Stock Alert</button>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-6">
                {filteredStock.map(item => {
                  const status = getStockStatus(item);
                  return (
                    <div 
                      key={item.id} 
                      onClick={() => addToCart(item)}
                      className="bg-white rounded-lg p-3 border border-neutral-200 shadow-sm cursor-pointer hover:border-primary-500 hover:ring-1 hover:ring-primary-500 relative"
                    >
                      <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${status.color}`} title={status.text}></span>
                      <h3 className="text-sm font-semibold text-neutral-800 truncate pr-4">{item.productName}</h3>
                      <p className="text-sm text-neutral-600 mt-1">{formatCurrency(item.sellingPrice)}</p>
                      <p className="text-xs text-neutral-400 mt-1">Stock: {item.quantity}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Panel: Cart */}
            <div className="bg-white rounded-lg border border-neutral-200 shadow-sm self-start lg:sticky top-6">
              <div className="p-5 border-b border-neutral-200">
                <h2 className="text-lg font-semibold text-neutral-800">Current Sale ({customerName})</h2>
              </div>
              <div className="p-5">
                <div className="mb-4">
                  <label className="text-sm font-medium text-neutral-600">Payment Method</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg">
                    <option>Cash</option>
                    <option>Card</option>
                    <option>Online</option>
                  </select>
                </div>
                <div className="max-h-60 overflow-y-auto pr-2 -mr-2">
                  {cart.length === 0 ? (
                    <p className="text-sm text-center text-neutral-400 py-10">No items in sale</p>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className="flex items-start gap-3 py-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-neutral-800">{item.name}</p>
                          <p className="text-sm text-neutral-500">{formatCurrency(item.price)}</p>
                        </div>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateQuantity(item.id, parseInt(e.target.value, 10))}
                          className="w-16 py-1 px-2 text-sm border-neutral-300 border rounded-md"
                          min="0"
                        />
                        <button onClick={() => removeFromCart(item.id)}><X className="w-4 h-4 text-neutral-500 hover:text-red-500"/></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="p-5 bg-neutral-50 rounded-b-lg border-t border-neutral-200">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Subtotal</span>
                    <span className="font-medium text-neutral-800">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Tax ({taxRate * 100}%)</span>
                    <span className="font-medium text-neutral-800">{formatCurrency(tax)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-neutral-200">
                  <span className="text-lg font-bold text-neutral-900">Total</span>
                  <span className="text-xl font-bold text-neutral-900">{formatCurrency(total)}</span>
                </div>
                <button 
                  onClick={initiateCheckout} 
                  disabled={processing || cart.length === 0}
                  className="mt-4 w-full px-4 py-3 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 disabled:bg-primary-300"
                >
                  {processing ? 'Processing...' : 'Complete Sale'}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile View */}
      <div className="lg:hidden min-h-screen bg-neutral-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-neutral-200 p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-neutral-800">Point of Sale</h1>
          <div className="flex items-center gap-3">
            <button 
              onClick={openCustomerModal}
              className="px-3 py-1.5 text-sm font-medium bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200"
            >
              Customer
            </button>
            <button onClick={() => router.push('/dashboard')} className="text-neutral-500 hover:text-neutral-800">
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Search and Filter Bar */}
        <div className="bg-white border-b border-neutral-200 p-4">
          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
              <input
                id="search-products-mobile"
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-base"
              />
            </div>
            
            {/* Filter Row */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="appearance-none w-full bg-white border border-neutral-300 rounded-lg py-2.5 pl-3 pr-8 focus:ring-2 focus:ring-primary-500 text-sm"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              </div>
              <button className="px-4 py-2.5 text-sm font-medium bg-white border border-neutral-300 rounded-lg shadow-sm hover:bg-neutral-100 flex items-center gap-2">
                <ScanBarcode className="w-4 h-4" /> Scan
              </button>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full hover:bg-yellow-200 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5" />Repeat Last Sale
              </button>
              {hasLowStockItems && (
                <button className="px-3 py-1.5 text-xs font-semibold text-red-800 bg-red-100 rounded-full hover:bg-red-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />Low Stock Alert
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filteredStock.map(item => {
              const status = getStockStatus(item);
              const isInCart = cart.some(c => c.id === item.id);
              const cartItem = cart.find(c => c.id === item.id);
              
              return (
                <div
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`bg-white p-4 rounded-lg shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md border-2 relative ${
                    isInCart ? 'border-primary-500 ring-2 ring-primary-200' : 'border-transparent'
                  } ${item.quantity === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {/* Status Indicator */}
                  <span 
                    className={`absolute top-2 right-2 w-3 h-3 rounded-full ${status.color} shadow-sm`} 
                    title={status.text}
                  ></span>
                  
                  {/* Product Info */}
                  <div className="font-semibold text-sm truncate pr-6 mb-1">{item.productName}</div>
                  {item.category && (
                    <div className="text-xs text-neutral-500 mb-2">{item.category}</div>
                  )}
                  
                  {/* Price */}
                  <div className="text-lg font-bold text-primary-700 mb-2">
                    {formatCurrency(item.sellingPrice)}
                  </div>
                  
                  {/* Stock Info */}
                  <div className="text-xs text-neutral-600">
                    Stock: {item.quantity}
                  </div>
                  
                  {/* Cart Indicator */}
                  {isInCart && (
                    <div className="absolute -top-1 -right-1 bg-primary-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {cartItem?.quantity || 1}
                    </div>
                  )}
                  
                  {/* Low Stock Warning */}
                  {item.quantity < (item.lowStockThreshold || 5) && item.quantity > 0 && (
                    <div className="mt-2 text-xs text-yellow-600 font-semibold">
                      Only {item.quantity} left
                    </div>
                  )}
                  
                  {/* Out of Stock */}
                  {item.quantity === 0 && (
                    <div className="mt-2 text-xs text-red-600 font-semibold">
                      Out of stock
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Checkout Footer - positioned at bottom of content */}
        {cart.length > 0 && (
          <div className="bg-white border-t border-neutral-200 shadow-lg p-4 mt-auto">
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <div className="text-sm text-neutral-600">
                  {cart.length} item{cart.length !== 1 ? 's' : ''} • {cart.reduce((sum, item) => sum + item.quantity, 0)} total
                </div>
                <div className="text-xl font-bold text-neutral-900">
                  {formatCurrency(total)}
                </div>
              </div>
              <button
                onClick={initiateCheckout}
                disabled={processing}
                className="bg-primary-700 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-primary-800 disabled:bg-primary-300 transition-colors"
              >
                {processing ? 'Processing...' : 'Checkout'}
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Payment Modal */}
      {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm mx-4">
                  <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold text-neutral-800">Payment Received</h2>
                      <button onClick={() => setPaymentModalOpen(false)}><X className="w-5 h-5 text-neutral-500"/></button>
                  </div>
                  <div>
                      <label htmlFor="amount-paid" className="text-sm font-medium text-neutral-600">Amount Paid</label>
                      <input 
                          id="amount-paid"
                          type="number" 
                          value={amountPaid ?? ''}
                          onChange={e => setAmountPaid(e.target.value === '' ? null : parseFloat(e.target.value))}
                          onFocus={e => e.target.select()}
                          className="mt-1 w-full p-2 border border-neutral-300 rounded-lg text-lg"
                          autoFocus
                      />
                  </div>
                  <div className="mt-4 text-lg font-medium">
                      Change to Return: <span className="font-bold text-green-600">{formatCurrency(changeToReturn)}</span>
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                     <button
                        onClick={() => setPaymentModalOpen(false)}
                        className="w-full px-4 py-2 text-sm font-semibold text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-lg shadow-sm hover:bg-neutral-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleFinalizeSale(false)}
                        disabled={processing}
                        className="w-full px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg shadow-sm hover:bg-primary-700 disabled:bg-neutral-400"
                      >
                        {processing ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => handleFinalizeSale(true)}
                        disabled={processing}
                        className="w-full px-4 py-2 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 disabled:bg-neutral-400 col-span-1 md:col-auto"
                      >
                        {processing ? 'Saving...' : 'Save & Print'}
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