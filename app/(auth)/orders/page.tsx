"use client";

import { useState, useEffect, useMemo } from 'react';
import { FiPlusCircle, FiTruck, FiCheckCircle } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { X } from 'lucide-react';
import { useUser } from '@/components/useUser';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp, orderBy, increment } from 'firebase/firestore';
import Container from '@/components/Container';

// --- Custom Combobox Component ---
const Combobox = ({ items, value, onSelect, placeholder }: {
    items: { value: string, label: string, group: string }[],
    value: string,
    onSelect: (value: string) => void,
    placeholder: string
}) => {
    const [inputValue, setInputValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const filteredItems = useMemo(() => {
        if (!inputValue) return items;
        return items.filter(item =>
            item.label.toLowerCase().includes(inputValue.toLowerCase())
        );
    }, [inputValue, items]);

    const groupedItems = useMemo(() => {
        return filteredItems.reduce((acc, item) => {
            (acc[item.group] = acc[item.group] || []).push(item);
            return acc;
        }, {} as Record<string, { value: string; label: string; }[]>);
    }, [filteredItems]);

    useEffect(() => {
        const selectedItem = items.find(item => item.value === value);
        setInputValue(selectedItem ? selectedItem.label : '');
    }, [value, items]);

    const handleSelect = (itemValue: string) => {
        onSelect(itemValue);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                    setInputValue(e.target.value);
                    if (!isOpen) setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)} // Delay to allow click
                placeholder={placeholder}
                className="mt-1 w-full p-2 border rounded"
            />
            {isOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-neutral-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {Object.entries(groupedItems).map(([group, groupItems]) => (
                        <div key={group}>
                            <p className="px-3 py-2 text-xs font-semibold text-neutral-500 bg-neutral-50">{group}</p>
                            <ul>
                                {groupItems.map(item => (
                                    <li
                                        key={item.value}
                                        onClick={() => handleSelect(item.value)}
                                        className="px-3 py-2 text-sm text-neutral-700 hover:bg-primary-50 cursor-pointer"
                                    >
                                        {item.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {filteredItems.length === 0 && (
                        <p className="px-3 py-2 text-sm text-neutral-500">No products found.</p>
                    )}
                </div>
            )}
        </div>
    );
};


// Define Interfaces
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
  lowStockThreshold?: number;
  batches?: StockBatch[];
}

interface Order {
    id: string; // Firestore document ID
    orderId: string;
    vendorId: string;
    date: Timestamp;
    items: { product: string; quantity: number; }[];
    supplierName: string;
    supplierPhone: string;
    status: 'Ordered' | 'Shipped' | 'Delivered' | 'Cancelled';
}

const OrderStatusBadge = ({ status } : { status: string }) => {
    const baseClasses = "px-2.5 py-0.5 text-xs font-semibold rounded-full inline-flex items-center";
    switch (status) {
        case 'Delivered':
            return <span className={`${baseClasses} bg-green-100 text-green-800`}><FiCheckCircle className="mr-1.5" />{status}</span>;
        case 'Shipped':
            return <span className={`${baseClasses} bg-blue-100 text-blue-800`}><FiTruck className="mr-1.5" />{status}</span>;
        case 'Ordered':
            return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>{status}</span>;
        default:
            return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>{status}</span>;
    }
};

const StatusChanger = ({ currentStatus, onStatusChange }: { currentStatus: Order['status'], onStatusChange: (newStatus: Order['status']) => void }) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleSelect = (status: Order['status']) => {
        onStatusChange(status);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left">
                <OrderStatusBadge status={currentStatus} />
            </button>
            {isOpen && (
                <div className="absolute z-10 mt-1 w-32 bg-white rounded-md shadow-lg border">
                    <ul>
                        {(['Ordered', 'Shipped', 'Delivered', 'Cancelled'] as Order['status'][]).map(status => (
                            <li key={status} onClick={() => handleSelect(status)} className="px-3 py-1.5 text-xs hover:bg-neutral-100 cursor-pointer">
                                {status}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

type OrderModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (order: any) => void;
    stockItems: StockItem[];
    lowStockItems: StockItem[];
    preselectedProduct?: string;
};

const OrderModal = ({ isOpen, onClose, onSave, stockItems, lowStockItems, preselectedProduct }: OrderModalProps) => {
    const [items, setItems] = useState<{product: string, quantity: number}[]>([]);
    const [currentItem, setCurrentItem] = useState<{product: string, quantity: number} | null>(null);
    const [supplierName, setSupplierName] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');

    useEffect(() => {
        if (preselectedProduct) {
            // This logic might need to be re-thought with multi-item orders
            // For now, it can seed the first item
            setItems([{ product: preselectedProduct, quantity: 1 }]);
        } else {
            // Reset state when modal is opened for a new order
            setItems([]);
            setSupplierName('');
            setSupplierPhone('');
        }
    }, [preselectedProduct, isOpen]);
    
    const handleAddItem = () => {
        if (currentItem && currentItem.product && currentItem.quantity > 0) {
            setItems([...items, currentItem]);
            setCurrentItem(null); // Reset for next item
        }
    };
    
    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        const newOrder = {
            orderId: `ORD${Date.now().toString().slice(-4)}`,
            date: new Date().toISOString().split('T')[0],
            items,
            supplierName,
            supplierPhone,
            status: 'Ordered' as 'Ordered',
        };
        onSave(newOrder);
        onClose();
    };

    const comboboxItems = useMemo(() => {
        const lowStockGroup = lowStockItems.map(item => ({
            value: item.productName,
            label: `${item.productName} (Stock: ${item.quantity})`,
            group: '🔥 Low Stock Items'
        }));

        const otherStockIds = new Set(lowStockItems.map(item => item.id));
        const otherGroup = stockItems
            .filter(item => !otherStockIds.has(item.id))
            .map(item => ({
                value: item.productName,
                label: `${item.productName} (Stock: ${item.quantity})`,
                group: 'All Items'
            }));

        return [...lowStockGroup, ...otherGroup];
    }, [stockItems, lowStockItems]);
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Place New Order</h2>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>
                
                <div className="space-y-4">
                     {/* Supplier Info */}
                    <div>
                        <label className="text-sm font-medium">Supplier/Vendor Name</label>
                        <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="mt-1 w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Supplier's WhatsApp Number</label>
                        <input type="text" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className="mt-1 w-full p-2 border rounded" placeholder="e.g., 94771234567" />
                    </div>
                    
                    <hr className="my-4"/>

                    {/* Items List */}
                    <div className="space-y-2">
                        <h3 className="text-md font-semibold">Order Items</h3>
                        {items.map((item, index) => (
                            <div key={index} className="flex items-center justify-between bg-neutral-50 p-2 rounded">
                                <span>{item.quantity} x {item.product}</span>
                                <button onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                         {items.length === 0 && <p className="text-sm text-neutral-500">No items added yet.</p>}
                    </div>

                    {/* Add Item Form */}
                    <div className="p-3 border rounded-md space-y-3">
                         <h4 className="text-sm font-medium">Add a Product</h4>
                        <Combobox
                            items={comboboxItems.filter(ci => !items.find(i => i.product === ci.value))} // Don't show already added items
                            value={currentItem?.product || ''}
                            onSelect={(p) => setCurrentItem(prev => ({ product: p, quantity: prev?.quantity || 1 }))}
                            placeholder="Search for a product..."
                        />
                         <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={currentItem?.quantity || 1}
                                onChange={(e) => setCurrentItem(prev => ({ product: prev?.product || '', quantity: parseInt(e.target.value, 10) || 1 }))}
                                className="w-full p-2 border rounded"
                                min="1"
                            />
                            <button onClick={handleAddItem} className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg whitespace-nowrap">
                                Add Item
                            </button>
                        </div>
                    </div>

                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm bg-neutral-200 rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} disabled={items.length === 0 || !supplierName} className="px-4 py-2 text-sm text-white bg-primary-700 rounded-lg disabled:bg-neutral-400">Save & Send WhatsApp</button>
                </div>
            </div>
        </div>
    );
};

export default function OrdersPage() {
  const { user } = useUser();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [preselectedProduct, setPreselectedProduct] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        setLoading(true);
        // Fetch Stocks
        const stockQuery = query(collection(db, 'vendor_stocks'), where('vendorId', '==', user.uid));
        const stockSnap = await getDocs(stockQuery);
        const stockData = stockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
        setStock(stockData);

        // Fetch Orders
        const ordersQuery = query(collection(db, 'vendor_orders'), where('vendorId', '==', user.uid), orderBy('date', 'desc'));
        const ordersSnap = await getDocs(ordersQuery);
        const ordersData = ordersSnap.docs.map(doc => {
            const data = doc.data();
            // This is the smart part: handle both old and new order structures
            if (data.product && !data.items) {
                // This is an old-style order, convert it
                return {
                    ...data,
                    id: doc.id,
                    items: [{ product: data.product, quantity: data.quantity }]
                } as Order;
            }
            // This is a new-style order, return as is
            return { id: doc.id, ...data } as Order;
        });
        setOrders(ordersData);
        setLoading(false);
      };
      fetchData();
    }
  }, [user]);

  const lowStockItems = useMemo(() => {
    return stock.filter(item => item.quantity < (item.lowStockThreshold || 5));
  }, [stock]);

  const handleSaveOrder = async (newOrderData: any) => {
    if (!user) return;

    const orderToSave = {
        ...newOrderData,
        vendorId: user.uid,
        date: Timestamp.now(),
    };

    try {
        const docRef = await addDoc(collection(db, 'vendor_orders'), orderToSave);
        const newOrderWithId = { ...orderToSave, id: docRef.id };
        setOrders(prev => [newOrderWithId, ...prev]);
        setPreselectedProduct(undefined);
        handleSendWhatsApp(newOrderWithId);
    } catch (error) {
        console.error("Error adding document: ", error);
        alert("Failed to save order. Please try again.");
    }
  };
  
  const handleSendWhatsApp = (order: any) => {
    const itemsText = order.items.map((item: { quantity: number; product: string; }) => `${item.quantity} x ${item.product}`).join('\n');
    const message = `Hello ${order.supplierName}, I would like to place an order for the following items:\n\n${itemsText}\n\nOrder ID: ${order.orderId}. Thank you.`;
    const whatsappUrl = `https://wa.me/${order.supplierPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleStatusChange = async (order: Order, newStatus: Order['status']) => {
    if (!user) return;
    const orderRef = doc(db, 'vendor_orders', order.id);
    try {
        await updateDoc(orderRef, { status: newStatus });

        if (newStatus === 'Delivered') {
            // --- SMART FEATURE: Auto-update stock for MULTIPLE items ---
            for (const item of order.items) {
                const stockItemToUpdate = stock.find(s => s.productName === item.product);
                
                if (stockItemToUpdate) {
                    const stockRef = doc(db, 'vendor_stocks', stockItemToUpdate.id);
                    await updateDoc(stockRef, {
                        quantity: increment(item.quantity)
                    });
                     // Update local state in a loop
                    setStock(prevStock => 
                        prevStock.map(s => 
                            s.id === stockItemToUpdate.id 
                                ? { ...s, quantity: s.quantity + item.quantity }
                                : s
                        )
                    );
                } else {
                    console.warn(`Stock item for product "${item.product}" not found. Cannot update stock.`);
                    alert(`Stock item for "${item.product}" not found. You may need to add it to your stocks first.`);
                }
            }
        }
        
        setOrders(prevOrders => prevOrders.map(o => o.id === order.id ? { ...o, status: newStatus } : o));

    } catch (error) {
        console.error("Error updating status: ", error);
        alert("Failed to update status.");
    }
  };

  const handleCreateOrderFromRecommendation = (productName: string) => {
    setPreselectedProduct(productName);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setPreselectedProduct(undefined);
  };

  const formatDateDDMMMYYYY = (date: Date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  return (
    <Container>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800">Orders</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 flex items-center gap-2"
        >
          <FiPlusCircle />
          Place New Order
        </button>
      </div>

      <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h2 className="text-lg font-bold text-neutral-800 mb-3">🔥 Recommended Reorders</h2>
          {loading ? (
              <p className="text-sm text-neutral-500">Loading stock levels...</p>
          ) : lowStockItems.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {lowStockItems.map(item => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border flex justify-between items-center shadow-sm">
                          <div>
                              <p className="font-semibold">{item.productName}</p>
                              <p className="text-sm text-red-600 font-medium">Current Stock: {item.quantity}</p>
                          </div>
                          <button 
                              onClick={() => handleCreateOrderFromRecommendation(item.productName)}
                              className="px-3 py-1.5 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700"
                          >
                              Reorder
                          </button>
                      </div>
                  ))}
              </div>
          ) : (
              <p className="text-sm text-neutral-500">No low stock items. You're all set!</p>
          )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm text-left text-neutral-500">
              <thead className="text-xs text-neutral-700 uppercase bg-neutral-50 hidden md:table-header-group">
                  <tr>
                      <th scope="col" className="px-6 py-3">Order ID</th>
                      <th scope="col" className="px-6 py-3">Vendor</th>
                      <th scope="col" className="px-6 py-3">Items</th>
                      <th scope="col" className="px-6 py-3">Total Quantity</th>
                      <th scope="col" className="px-6 py-3">Date</th>
                      <th scope="col" className="px-6 py-3">Status</th>
                      <th scope="col" className="px-6 py-3">Action</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 md:divide-y-0">
                  {orders.map((order) => (
                      <tr key={order.id} className="block md:table-row mb-4 md:mb-0 border md:border-none rounded-lg overflow-hidden">
                         <td className="bg-neutral-50 md:bg-transparent px-4 py-3 md:table-cell md:px-6 md:py-4 font-medium text-neutral-900" data-label="Vendor">
                              <div className="flex justify-between items-center">
                                  <span className="font-bold md:font-medium">{order.supplierName}</span>
                                  <span className="font-mono text-xs text-neutral-500 md:hidden">{order.orderId}</span>
                              </div>
                         </td>
                          <td className="hidden md:table-cell md:px-6 md:py-4 font-mono text-xs">{order.orderId}</td>
                          <td className="flex justify-between items-center px-4 py-3 md:table-cell md:px-6 md:py-4" data-label="Items">
                              <span>Items</span>
                              <span>
                                  {order.items && order.items.length > 1 
                                      ? `${order.items[0].product} (+${order.items.length - 1} more)` 
                                      : order.items?.[0]?.product
                                  }
                              </span>
                          </td>
                          <td className="flex justify-between items-center px-4 py-3 md:table-cell md:px-6 md:py-4" data-label="Total Quantity">
                              <span>Total Quantity</span>
                              <span>{order.items?.reduce((acc, item) => acc + item.quantity, 0)}</span>
                          </td>
                          <td className="flex justify-between items-center px-4 py-3 md:table-cell md:px-6 md:py-4" data-label="Date">
                              <span>Date</span>
                              <span>{formatDateDDMMMYYYY(new Date(order.date.seconds * 1000))}</span>
                          </td>
                          <td className="flex justify-between items-center px-4 py-3 md:table-cell md:px-6 md:py-4" data-label="Status">
                              <span>Status</span>
                              <StatusChanger 
                                  currentStatus={order.status}
                                  onStatusChange={(newStatus) => handleStatusChange(order, newStatus)}
                              />
                          </td>
                          <td className="flex justify-between items-center px-4 py-3 md:table-cell md:px-6 md:py-4" data-label="Action">
                              <span>Action</span>
                               <button onClick={() => handleSendWhatsApp(order)} className="text-green-500 hover:text-green-700">
                                  <FaWhatsapp size={20} />
                               </button>
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
      </div>

      <OrderModal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        onSave={handleSaveOrder} 
        stockItems={stock}
        lowStockItems={lowStockItems}
        preselectedProduct={preselectedProduct}
      />
    </Container>
  );
}