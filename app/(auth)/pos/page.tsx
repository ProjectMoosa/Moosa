"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, writeBatch, Timestamp, addDoc, orderBy, updateDoc, increment, getDoc } from 'firebase/firestore';
import { useUser } from '@/components/useUser';
import { useRouter } from 'next/navigation';
import { Search, ScanBarcode, ChevronDown, Repeat, AlertTriangle, X, Percent, Tag } from 'lucide-react';
import BarcodeScanner from '@/components/BarcodeScanner';

// Interfaces
interface StockBatch {
  batchId: string;
  quantity: number;
  expiryDate?: string;
  barcode?: string;
  receivedDate?: string;
}

interface StockItem {
  id: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  purchasePrice?: number;
  category?: string;
  lowStockThreshold?: number;
  barcode?: string;
  batches?: StockBatch[];
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
  discount: number;
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
  
  // Add refs for scrolling
  const cartRef = useRef<HTMLDivElement>(null);
  const cartItemsRef = useRef<HTMLDivElement>(null);
  
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
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  
  // Tax and Discount State
  const [taxPercentage, setTaxPercentage] = useState(0); // Default 0%
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);

  // Add state for accordion
  const [showTaxDiscount, setShowTaxDiscount] = useState(false);

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
    
  const { subtotal, tax, total, discount } = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const taxRate = taxPercentage / 100;
    const tax = subtotal * taxRate;
    
    // Calculate discount
    let discountAmount = 0;
    if (discountValue > 0) {
      if (discountType === 'percentage') {
        discountAmount = subtotal * (discountValue / 100);
      } else {
        discountAmount = discountValue;
      }
    }
    
    const total = subtotal + tax - discountAmount;
    return { subtotal, tax, total, discount: discountAmount };
  }, [cart, taxPercentage, discountType, discountValue]);

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

    try {
      // Debug: Check user authentication and vendor status
      console.log('🔍 Debug: User authentication check...');
      console.log('🔍 Debug: User UID:', user.uid);
      console.log('🔍 Debug: User email:', user.email);
      
      // Check if user exists in vendor_accounts collection
      const vendorAccountRef = doc(db, 'vendor_accounts', user.uid);
      const vendorAccountSnap = await getDoc(vendorAccountRef);
      console.log('🔍 Debug: Vendor account exists:', vendorAccountSnap.exists());
      if (vendorAccountSnap.exists()) {
        console.log('🔍 Debug: Vendor account data:', vendorAccountSnap.data());
      }

      const batch = writeBatch(db);
      const saleTimestamp = Timestamp.now();

      console.log('🔍 Debug: Starting sale completion...');
      console.log('🔍 Debug: Cart items:', cart.length);

      // 1. Update stock quantities
      console.log('🔍 Debug: Updating stock quantities...');
      cart.forEach(item => {
        const stockRef = doc(db, 'vendor_stocks', item.id);
        const newQuantity = item.originalQuantity - item.quantity;
        console.log(`🔍 Debug: Updating stock ${item.id} from ${item.originalQuantity} to ${newQuantity}`);
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
        discount: discount,
        total: total,
        paymentMethod: paymentMethod,
        customerName: customerName || 'Guest',
        customerPhone: customerPhone || '',
        vendorId: user.uid,
        timestamp: saleTimestamp,
        purchaseRefId: `#M${String(saleTimestamp.seconds).slice(-6)}`,
      };
      
      console.log('🔍 Debug: Sale data to be saved:', saleData);
      
      // 3. Add to top-level sales collection (for billing page)
      console.log('🔍 Debug: Adding to sales collection...');
      const saleDocRef = doc(collection(db, 'sales'));
      batch.set(saleDocRef, saleData);

      // 4. Add to customer_details collection (for customer history)
      if (customerPhone && customerName !== 'Guest') {
        console.log('🔍 Debug: Adding to customer_details collection...');
        const customerSaleRef = doc(collection(db, 'customer_details'));
        batch.set(customerSaleRef, saleData);
      }
      
      // 5. Commit batch
      console.log('🔍 Debug: Committing batch...');
      await batch.commit();
      console.log('🔍 Debug: Batch committed successfully!');
      
      // 6. Add a record to the new 'points' collection if customer is registered
      if (customerInfoId) {
        console.log('🔍 Debug: Adding points record...');
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
          console.log('🔍 Debug: Points record added successfully!');
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
      setAmountPaid(null);
      setPaymentModalOpen(false);
      setProcessing(false);
      alert("Sale completed successfully!");
      
    } catch (error: any) {
      console.error('❌ Error in completeSale:', error);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error message:', error.message);
      
      // More specific error handling
      if (error.code === 'permission-denied') {
        alert(`Permission denied: ${error.message}. Please check your Firestore rules.`);
      } else if (error.code === 'unavailable') {
        alert('Network error. Please check your internet connection and try again.');
      } else {
        alert(`Error completing sale: ${error.message}`);
      }
      
      setProcessing(false);
    }
  };

  const addToCart = useCallback((item: StockItem) => {
    if (item.quantity <= 0) {
      alert(`${item.productName} is out of stock.`);
      return;
    }
    setCart(currentCart => {
      const existingItem = currentCart.find(cartItem => cartItem.id === item.id);
      if (existingItem) {
        // If item exists, increase quantity, but not beyond available stock
        const newQuantity = Math.min(existingItem.quantity + 1, item.quantity);
        return currentCart.map(cartItem =>
          cartItem.id === item.id ? { ...cartItem, quantity: newQuantity } : cartItem
        );
      }
      // If item doesn't exist, add it to the cart
      return [...currentCart, { id: item.id, name: item.productName, quantity: 1, price: item.sellingPrice, originalQuantity: item.quantity, purchasePrice: item.purchasePrice }];
    });
    
    // Auto-scroll within cart items after adding item
    setTimeout(() => {
      if (cartItemsRef.current) {
        cartItemsRef.current.scrollTo({
          top: cartItemsRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);
  }, []);

  // Test function to add 3 items to cart (for demonstration)
  const addTestItems = useCallback(() => {
    const testItems = stock.slice(0, 3); // Take first 3 items
    testItems.forEach(item => {
      if (item.quantity > 0) {
        setCart(currentCart => {
          const existingItem = currentCart.find(cartItem => cartItem.id === item.id);
          if (existingItem) {
            return currentCart.map(cartItem =>
              cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
            );
          }
          return [...currentCart, { id: item.id, name: item.productName, quantity: 1, price: item.sellingPrice, originalQuantity: item.quantity, purchasePrice: item.purchasePrice }];
        });
      }
    });
    
    // Auto-scroll within cart items after adding test items
    setTimeout(() => {
      if (cartItemsRef.current) {
        cartItemsRef.current.scrollTo({
          top: cartItemsRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 300);
  }, [stock]);

  const updateQuantity = useCallback((id: string, newQuantity: number) => {
    setCart(currentCart => {
      const stockItem = stock.find(s => s.id === id);
      if (!stockItem) return currentCart;

      const updatedQuantity = Math.max(0, Math.min(newQuantity, stockItem.quantity));
      
      if (updatedQuantity === 0) {
        return currentCart.filter(item => item.id !== id);
      }

      return currentCart.map(item =>
        item.id === id ? { ...item, quantity: updatedQuantity } : item
      );
    });
  }, [stock]);

  const removeFromCart = (id: string) => setCart(cart.filter(item => item.id !== id));

  const handleScanSuccess = useCallback((barcode: string) => {
    setIsScannerOpen(false);
    const item = stock.find(s => s.barcode === barcode);
    if (item) {
      if (item.quantity > 0) {
        addToCart(item);
      } else {
        alert(`${item.productName} is out of stock.`);
      }
    } else {
      alert("Product with this barcode not found in your stock.");
    }
  }, [stock, addToCart]);

  const handleScannerClose = useCallback(() => {
    setIsScannerOpen(false);
  }, []);

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

  // Data Filtering
  const filteredStock = useMemo(() => {
    return stock.filter(item => {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      const matchesCategory = selectedCategory === 'All Categories' || item.category === selectedCategory;
      const matchesSearch = 
        item.productName.toLowerCase().includes(lowerCaseSearchTerm) ||
        (item.barcode && item.barcode.toLowerCase().includes(lowerCaseSearchTerm));
      
      return matchesCategory && (searchTerm === '' || matchesSearch);
    });
  }, [stock, searchTerm, selectedCategory]);
  
  const formatCurrency = (amount: number) => `LKR ${amount.toFixed(2)}`;
  
  const changeToReturn = useMemo(() => {
      if(amountPaid === null || amountPaid < total) return 0;
      return amountPaid - total;
  }, [amountPaid, total]);
  
  if (loading || !user) {
    return <div className="w-full h-screen flex items-center justify-center">Loading...</div>;
  }
  
  // Render JSX
  return (
    <>
      {/* Desktop View */}
      <div className="hidden lg:block bg-gradient-to-br from-neutral-50 to-neutral-100 min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-4 lg:px-6">
          {/* Page Header */}
          <header className="py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m6 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800">Point of Sale</h1>
                <p className="text-xs text-neutral-600 mt-0.5">Quick and efficient sales management</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={addTestItems}
                className="px-3 py-2 text-xs font-medium bg-yellow-100 border border-yellow-200 rounded-lg shadow-sm hover:bg-yellow-200 transition-all duration-200 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add 3 Items
              </button>
              <button 
                onClick={openCustomerModal}
                className="px-4 py-2 text-sm font-medium bg-white border border-neutral-200 rounded-lg shadow-sm hover:bg-neutral-50 hover:border-neutral-300 transition-all duration-200 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Customer Details
              </button>
              <button 
                onClick={initiateCheckout} 
                disabled={processing || cart.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg shadow-lg hover:from-primary-700 hover:to-primary-800 disabled:from-neutral-300 disabled:to-neutral-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {processing ? 'Processing...' : 'Complete Sale (Ctrl + Enter)'}
              </button>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 flex flex-col lg:flex-row gap-6 pb-4">
            {/* Left Panel: Products */}
            <div className="lg:w-3/5 xl:w-2/3">
              {/* Search and Controls */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      id="search-products"
                      type="text"
                      placeholder="Search by name or barcode... (Ctrl + K)"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none transition-all duration-200 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setIsScannerOpen(true)} className="px-3 py-2 text-sm font-medium bg-white border border-neutral-300 rounded-lg shadow-sm hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200 flex items-center justify-center gap-2">
                      <ScanBarcode className="w-4 h-4" /> Scan
                    </button>
                    <div className="relative">
                      <select 
                        className="w-full h-full px-3 py-2 text-sm font-medium bg-white border border-neutral-300 rounded-lg shadow-sm hover:bg-neutral-50 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 appearance-none transition-all duration-200"
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button className="px-3 py-1.5 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full hover:bg-yellow-200 transition-colors duration-200 flex items-center gap-1.5">
                    <Repeat className="w-3 h-3" />
                    Repeat Last Sale
                  </button>
                  {hasLowStockItems && (
                    <button className="px-3 py-1.5 text-xs font-semibold text-red-800 bg-red-100 rounded-full hover:bg-red-200 transition-colors duration-200 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" />
                      Low Stock Alert
                    </button>
                  )}
                </div>
              </div>

              {/* Products Grid */}
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                {filteredStock.map(item => {
                  const status = getStockStatus(item);
                  const isInCart = cart.some(c => c.id === item.id);
                  const cartItem = cart.find(c => c.id === item.id);
                  
                  return (
                    <div 
                      key={item.id} 
                      onClick={() => addToCart(item)}
                      className={`bg-white rounded-lg p-3 border-2 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-105 relative group ${
                        isInCart ? 'border-primary-500 ring-2 ring-primary-200 bg-primary-50' : 'border-neutral-200 hover:border-primary-300'
                      } ${item.quantity === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {/* Status Indicator */}
                      <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${status.color} shadow-sm`} title={status.text}></span>
                      
                      {/* Cart Indicator */}
                      {isInCart && (
                        <div className="absolute -top-1 -right-1 bg-primary-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                          {cartItem?.quantity || 1}
                        </div>
                      )}
                      
                      {/* Product Info */}
                      <div className="mb-2">
                        <h3 className="text-xs font-semibold text-neutral-800 truncate pr-4 leading-tight">{item.productName}</h3>
                        {item.category && (
                          <p className="text-xs text-neutral-500 mt-0.5">{item.category}</p>
                        )}
                      </div>
                      
                      {/* Price */}
                      <div className="text-sm font-bold text-primary-700 mb-1">
                        {formatCurrency(item.sellingPrice)}
                      </div>
                      
                      {/* Stock Info */}
                      <div className="text-xs text-neutral-600">
                        Stock: {item.quantity}
                      </div>
                      
                      {/* Low Stock Warning */}
                      {item.quantity < (item.lowStockThreshold || 5) && item.quantity > 0 && (
                        <div className="text-xs text-yellow-600 font-semibold mt-1">
                          Only {item.quantity} left
                        </div>
                      )}
                      
                      {/* Out of Stock */}
                      {item.quantity === 0 && (
                        <div className="text-xs text-red-600 font-semibold mt-1">
                          Out of stock
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Panel: Cart */}
            <aside ref={cartRef} className="lg:w-2/5 xl:w-1/3 sticky top-4">
              <div className="bg-white rounded-xl border border-neutral-200 shadow-lg overflow-hidden">
                {/* Cart Header */}
                <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-primary-50 to-primary-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-neutral-800">Current Sale</h2>
                      <p className="text-xs text-neutral-600 mt-0.5">{customerName}</p>
                    </div>
                    <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m6 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Cart Content */}
                <div className="p-4">
                  {/* Payment Method */}
                  <div className="mb-4">
                    <label className="text-xs font-medium text-neutral-700 mb-1 block">Payment Method</label>
                    <select 
                      value={paymentMethod} 
                      onChange={e => setPaymentMethod(e.target.value)} 
                      className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200"
                    >
                      <option>Cash</option>
                      <option>Card</option>
                      <option>Online</option>
                    </select>
                  </div>
                  
                  {/* Cart Items */}
                  <div ref={cartItemsRef} className="max-h-64 overflow-y-auto pr-2 -mr-2 scrollbar-thin scrollbar-thumb-neutral-300 scrollbar-track-neutral-100">
                    {cart.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m6 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                          </svg>
                        </div>
                        <p className="text-sm text-neutral-500">No items in cart</p>
                        <p className="text-xs text-neutral-400 mt-1">Add products to start a sale</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cart.map(item => (
                          <div key={item.id} className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-neutral-800 truncate">{item.name}</p>
                              <p className="text-xs text-neutral-600 mt-0.5">{formatCurrency(item.price)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={e => updateQuantity(item.id, parseInt(e.target.value, 10))}
                                className="w-14 py-1 px-2 text-sm border-neutral-300 border rounded-md focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200"
                                min="0"
                              />
                              <button 
                                onClick={() => removeFromCart(item.id)}
                                className="p-1 hover:bg-red-100 rounded-md transition-colors duration-200"
                              >
                                <X className="w-3.5 h-3.5 text-neutral-500 hover:text-red-500"/>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Cart Summary */}
                <div className="p-4 bg-gradient-to-br from-neutral-50 to-neutral-100 border-t border-neutral-200">
                  {/* Tax and Discount Controls */}
                  <div className="mb-3">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-all duration-200"
                      onClick={() => setShowTaxDiscount((v) => !v)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Percent className="w-3.5 h-3.5 text-primary-600" /> 
                        Tax: {taxPercentage}%
                        <span className="mx-1.5">|</span>
                        <Tag className="w-3.5 h-3.5 text-green-600" /> 
                        Discount: {discountValue}
                        {discountType === 'percentage' ? '%' : 'LKR'}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 ml-2 transition-transform duration-200 ${showTaxDiscount ? 'rotate-180' : ''}`} />
                    </button>
                    {showTaxDiscount && (
                      <div className="mt-3 p-3 bg-white border border-neutral-200 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <Percent className="w-3.5 h-3.5 text-primary-600" />
                          <input
                            type="number"
                            value={taxPercentage}
                            onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                            className="flex-1 px-2 py-1 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-200 focus:border-primary-400 text-xs"
                            min="0"
                            max="100"
                            step="0.1"
                          />
                          <span className="text-xs text-neutral-600">%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-green-600" />
                          <input
                            type="number"
                            value={discountValue}
                            onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                            className="flex-1 px-2 py-1 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-200 focus:border-primary-400 text-xs"
                            min="0"
                            step="0.01"
                          />
                          <select
                            value={discountType}
                            onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                            className="px-2 py-1 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-200 focus:border-primary-400 text-xs"
                          >
                            <option value="percentage">%</option>
                            <option value="fixed">LKR</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Summary */}
                  <div className="space-y-2 text-xs mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-600">Subtotal</span>
                      <span className="font-semibold text-neutral-800">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-600">Tax ({taxPercentage}%)</span>
                      <span className="font-semibold text-neutral-800">{formatCurrency(tax)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between items-center text-green-600">
                        <span>Discount ({discountType === 'percentage' ? `${discountValue}%` : 'Fixed'})</span>
                        <span className="font-semibold">-{formatCurrency(discount)}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Total */}
                  <div className="flex justify-between items-baseline pt-3 border-t border-neutral-200">
                    <span className="text-lg font-bold text-neutral-900">Total</span>
                    <span className="text-xl font-bold text-primary-700">{formatCurrency(total)}</span>
                  </div>
                  
                  {/* Complete Sale Button */}
                  <button 
                    onClick={initiateCheckout} 
                    disabled={processing || cart.length === 0}
                    className="mt-4 w-full px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg shadow-lg hover:from-primary-700 hover:to-primary-800 disabled:from-neutral-300 disabled:to-neutral-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {processing ? 'Processing...' : 'Complete Sale'}
                  </button>
                </div>
              </div>
            </aside>
          </main>
        </div>
      </div>

      {/* Mobile View */}
      <div className="lg:hidden min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-neutral-200 p-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m6 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-neutral-800">Point of Sale</h1>
              <p className="text-xs text-neutral-600">Quick sales management</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setIsMobileSettingsOpen(true)}
              className="px-2 py-1.5 text-xs font-medium bg-neutral-100 border border-neutral-200 rounded-md hover:bg-neutral-200 transition-colors duration-200"
            >
              Tax/Discount
            </button>
            <button 
              onClick={openCustomerModal}
              className="px-2 py-1.5 text-xs font-medium bg-neutral-100 border border-neutral-200 rounded-md hover:bg-neutral-200 transition-colors duration-200"
            >
              Customer
            </button>
            <button onClick={() => router.push('/dashboard')} className="text-neutral-500 hover:text-neutral-800 p-1.5 rounded-md hover:bg-neutral-100 transition-colors duration-200">
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Search and Filter Bar */}
        <div className="bg-white border-b border-neutral-200 p-3 shadow-sm">
          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input
                id="search-products-mobile"
                type="text"
                placeholder="Search by name or barcode..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm transition-all duration-200"
              />
            </div>
            
            {/* Filter Row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="appearance-none w-full bg-white border border-neutral-300 rounded-lg py-2 pl-3 pr-8 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
              </div>
              <button className="px-3 py-2 text-sm font-medium bg-white border border-neutral-300 rounded-lg shadow-sm hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200 flex items-center gap-1.5">
                <ScanBarcode className="w-3.5 h-3.5" /> Scan
              </button>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-1.5">
              <button className="px-2.5 py-1 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full hover:bg-yellow-200 transition-colors duration-200 flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                Repeat Last Sale
              </button>
              {hasLowStockItems && (
                <button className="px-2.5 py-1 text-xs font-semibold text-red-800 bg-red-100 rounded-full hover:bg-red-200 transition-colors duration-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Low Stock Alert
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredStock.map(item => {
              const status = getStockStatus(item);
              const isInCart = cart.some(c => c.id === item.id);
              const cartItem = cart.find(c => c.id === item.id);
              
              return (
                <div
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`bg-white p-3 rounded-lg shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-105 border-2 relative ${
                    isInCart ? 'border-primary-500 ring-2 ring-primary-200 bg-primary-50' : 'border-transparent hover:border-primary-300'
                  } ${item.quantity === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {/* Status Indicator */}
                  <span 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${status.color} shadow-sm`} 
                    title={status.text}
                  ></span>
                  
                  {/* Cart Indicator */}
                  {isInCart && (
                    <div className="absolute -top-1 -right-1 bg-primary-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                      {cartItem?.quantity || 1}
                    </div>
                  )}
                  
                  {/* Product Info */}
                  <div className="font-semibold text-xs truncate pr-4 mb-1 leading-tight">{item.productName}</div>
                  {item.category && (
                    <div className="text-xs text-neutral-500 mb-1">{item.category}</div>
                  )}
                  
                  {/* Price */}
                  <div className="text-sm font-bold text-primary-700 mb-1">
                    {formatCurrency(item.sellingPrice)}
                  </div>
                  
                  {/* Stock Info */}
                  <div className="text-xs text-neutral-600 mb-1">
                    Stock: {item.quantity}
                  </div>
                  
                  {/* Low Stock Warning */}
                  {item.quantity < (item.lowStockThreshold || 5) && item.quantity > 0 && (
                    <div className="text-xs text-yellow-600 font-semibold">
                      Only {item.quantity} left
                    </div>
                  )}
                  
                  {/* Out of Stock */}
                  {item.quantity === 0 && (
                    <div className="text-xs text-red-600 font-semibold">
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
          <div ref={cartRef} className="bg-white border-t border-neutral-200 shadow-lg p-3 mt-auto sticky bottom-0 z-10">
            {/* Tax and Discount Summary for Mobile */}
            <div className="mb-3 text-xs space-y-1">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span className="lato-regular">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Tax ({taxPercentage}%)</span>
                <span className="lato-regular">{formatCurrency(tax)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span className="lato-regular">-{formatCurrency(discount)}</span>
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <div className="text-xs text-neutral-600">
                  {cart.length} item{cart.length !== 1 ? 's' : ''} • {cart.reduce((sum, item) => sum + item.quantity, 0)} total
                </div>
                <div className="text-lg font-bold text-neutral-900">
                  {formatCurrency(total)}
                </div>
              </div>
              <button
                onClick={initiateCheckout}
                disabled={processing}
                className="bg-gradient-to-r from-primary-600 to-primary-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-lg hover:from-primary-700 hover:to-primary-800 disabled:from-neutral-300 disabled:to-neutral-400 transition-all duration-200 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
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
                  <div className="mb-2 text-lg font-bold lato-regular text-neutral-800">Total: {formatCurrency(total)}</div>
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

      {isScannerOpen && (
        <BarcodeScanner 
          onScanSuccess={handleScanSuccess}
          onClose={handleScannerClose}
        />
      )}

      {/* Mobile Settings Modal */}
      {isMobileSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-neutral-800">Tax & Discount Settings</h2>
              <button onClick={() => setIsMobileSettingsOpen(false)}><X className="w-5 h-5 text-neutral-500"/></button>
            </div>
            
            <div className="space-y-4">
              {/* Tax Percentage */}
              <div>
                <label className="text-sm font-medium text-neutral-700">Tax Percentage</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    value={taxPercentage}
                    onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                  <span className="text-sm text-neutral-500">%</span>
                </div>
              </div>
              
              {/* Discount */}
              <div>
                <label className="text-sm font-medium text-neutral-700">Discount</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    min="0"
                    step="0.01"
                  />
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                    className="px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="percentage">%</option>
                    <option value="fixed">LKR</option>
                  </select>
                </div>
              </div>
              
              {/* Summary */}
              <div className="bg-neutral-50 p-3 rounded-lg">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Subtotal</span>
                    <span className="lato-regular">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Tax ({taxPercentage}%)</span>
                    <span className="lato-regular">{formatCurrency(tax)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span className="lato-regular">-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-neutral-200">
                    <span className="font-bold">Total</span>
                    <span className="font-bold">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setIsMobileSettingsOpen(false)}
              className="mt-6 w-full px-4 py-2 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
} 