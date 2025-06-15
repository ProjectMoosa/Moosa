"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, startAt, endAt, orderBy, limit, deleteDoc } from "firebase/firestore";
import { useUser } from '@/components/useUser';

interface VendorStock {
  id: string;
  productName: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  category?: string;
  lowStockThreshold?: number;
}

interface StockForm {
  productName: string;
  category: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  lowStockThreshold: number;
}

const COSMETIC_CATEGORIES = [
  "Makeup", "Eye Makeup", "Lipstick", "Foundation", "Soap", "Shampoo", "Conditioner", "Moisturizer", "Serum", "Toner", "Cleanser", "Sunscreen", "Perfume", "Deodorant", "Nail Polish", "Hair Oil", "Face Mask", "Body Lotion", "Scrub", "Other"
];

export default function VendorStocksPage() {
  const { user, role, loading } = useUser();
  const [stocks, setStocks] = useState<VendorStock[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [editStock, setEditStock] = useState<VendorStock | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<StockForm>({ productName: '', category: '', quantity: 0, costPrice: 0, sellingPrice: 0, lowStockThreshold: 5 });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<StockForm>({ productName: '', category: '', quantity: 0, costPrice: 0, sellingPrice: 0, lowStockThreshold: 5 });
  const [productSuggestions, setProductSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [filterStatus, setFilterStatus] = useState("");
  
  useEffect(() => {
    if (!user || role !== 'vendor') return;
    setLoadingStocks(true);
    const fetchStocks = async () => {
      const q = query(collection(db, 'vendor_stocks'), where('vendorId', '==', user.uid));
      const snap = await getDocs(q);
      setStocks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VendorStock)));
      setLoadingStocks(false);
    };
    fetchStocks();
  }, [user, role]);

  const openEditModal = (stock: VendorStock) => {
    setEditStock(stock);
    setForm({
      quantity: stock.quantity,
      costPrice: stock.costPrice,
      sellingPrice: stock.sellingPrice,
      category: stock.category || '',
      lowStockThreshold: stock.lowStockThreshold || 5,
      productName: stock.productName,
    });
    setModalOpen(true);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: Number(e.target.value) });
  };

  const handleSave = async () => {
    if (!editStock) return;
    await updateDoc(doc(db, 'vendor_stocks', editStock.id), {
      quantity: form.quantity,
      costPrice: form.costPrice,
      sellingPrice: form.sellingPrice,
      category: form.category,
      lowStockThreshold: form.lowStockThreshold,
    });
    setStocks(stocks.map(s => s.id === editStock.id ? { ...s, ...form } : s));
    setModalOpen(false);
    setEditStock(null);
  };

  const openAddModal = () => {
    setAddForm({ productName: '', category: '', quantity: 0, costPrice: 0, sellingPrice: 0, lowStockThreshold: 5 });
    setAddModalOpen(true);
  };

  const handleAddChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setAddForm({ ...addForm, [e.target.name]: e.target.value === 'productName' || e.target.name === 'category' ? e.target.value : Number(e.target.value) });
  };

  const handleAddFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') {
      e.target.value = '';
    }
  };

  const handleAdd = async () => {
    if (!user) return;
    const docRef = await addDoc(collection(db, 'vendor_stocks'), {
      ...addForm,
      vendorId: user.uid,
    });
    setStocks([...stocks, { id: docRef.id, ...addForm }]);
    setAddModalOpen(false);
  };

  const handleProductNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAddForm({ ...addForm, productName: value });
    if (value.length > 0) {
      setSuggestionLoading(true);
      const q = query(
        collection(db, 'products_master'),
        orderBy('name'),
        startAt(value),
        endAt(value + '\uf8ff'),
        limit(5)
      );
      const snap = await getDocs(q);
      setProductSuggestions(snap.docs.map(doc => doc.data()));
      setShowSuggestions(true);
      setSuggestionLoading(false);
    } else {
      setProductSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (product: any) => {
    setAddForm({
      ...addForm,
      productName: product.name,
      costPrice: product.price || 0,
    });
    setShowSuggestions(false);
  };

  const handleProductNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || productSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % productSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + productSuggestions.length) % productSuggestions.length);
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < productSuggestions.length) {
        handleSuggestionClick(productSuggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    if (!showSuggestions) setHighlightedIndex(-1);
  }, [showSuggestions, productSuggestions]);

  // Filtering, sorting, and pagination
  let filteredStocks = stocks.filter(s => {
    const profitMargin = s.costPrice ? ((s.sellingPrice - s.costPrice) / s.costPrice) * 100 : 0;
    const isLowStock = s.quantity < (s.lowStockThreshold || 5) && s.quantity > 0;
    const isOutOfStock = s.quantity === 0;
    let statusMatch = true;
    if (filterStatus === "in") statusMatch = !isLowStock && !isOutOfStock;
    if (filterStatus === "low") statusMatch = isLowStock;
    if (filterStatus === "out") statusMatch = isOutOfStock;
    return (
      (!search || s.productName.toLowerCase().includes(search.toLowerCase()) || (s.category || '').toLowerCase().includes(search.toLowerCase())) &&
      (!filterCategory || s.category === filterCategory) &&
      statusMatch
    );
  });
  if (sortBy) {
    filteredStocks = filteredStocks.sort((a, b) => {
      let aVal: number | string = '';
      let bVal: number | string = '';
      if (sortBy === 'profitMargin') {
        aVal = a.costPrice ? ((a.sellingPrice - a.costPrice) / a.costPrice) * 100 : 0;
        bVal = b.costPrice ? ((b.sellingPrice - b.costPrice) / b.costPrice) * 100 : 0;
      } else if (sortBy === 'productName' || sortBy === 'category') {
        aVal = (a[sortBy as keyof VendorStock] as string) || '';
        bVal = (b[sortBy as keyof VendorStock] as string) || '';
      } else {
        aVal = (a[sortBy as keyof VendorStock] as number) || 0;
        bVal = (b[sortBy as keyof VendorStock] as number) || 0;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }
  const totalPages = Math.ceil(filteredStocks.length / pageSize);
  const paginatedStocks = filteredStocks.slice((page - 1) * pageSize, page * pageSize);

  const handleDelete = async (stock: VendorStock) => {
    if (window.confirm(`Are you sure you want to delete "${stock.productName}" from your stock?`)) {
      await deleteDoc(doc(db, 'vendor_stocks', stock.id));
      setStocks(stocks.filter(s => s.id !== stock.id));
    }
  };

  if (loading || loadingStocks) return <div className="max-w-4xl mx-auto px-4 py-8 text-center text-neutral-400 text-lg">Loading stocks...</div>;
  if (role !== 'vendor') return null;

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-8 w-full">
      <h1 className="text-2xl font-bold text-primary-700 mb-4">Stocks</h1>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search by name or category..."
          className="border border-neutral-200 rounded-md px-3 py-2 text-sm w-full sm:w-64"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="border border-neutral-200 rounded-md px-3 py-2 text-sm w-full sm:w-48"
          value={filterCategory}
          onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
        >
          <option value="">All Categories</option>
          {COSMETIC_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          className="border border-neutral-200 rounded-md px-3 py-2 text-sm w-full sm:w-40"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
        <button className="bg-primary-700 hover:bg-primary-800 text-white font-medium px-4 py-2 rounded-md text-sm shadow-sm transition-colors w-full sm:w-auto" onClick={openAddModal}>
          + Add Product
        </button>
      </div>
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm overflow-x-auto w-full">
        <table className="min-w-full text-sm w-full">
          <thead>
            <tr className="text-neutral-500 text-xs uppercase">
              <th className="px-4 py-3 text-left cursor-pointer" onClick={() => { setSortBy('productName'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Product Name</th>
              <th className="px-4 py-3 text-left cursor-pointer" onClick={() => { setSortBy('category'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Category</th>
              <th className="px-4 py-3 text-left cursor-pointer" onClick={() => { setSortBy('quantity'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Quantity</th>
              <th className="px-4 py-3 text-left cursor-pointer" onClick={() => { setSortBy('costPrice'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Cost Price</th>
              <th className="px-4 py-3 text-left cursor-pointer" onClick={() => { setSortBy('sellingPrice'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Selling Price</th>
              <th className="px-4 py-3 text-left cursor-pointer" onClick={() => { setSortBy('profitMargin'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Profit Margin</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedStocks.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-neutral-400">No products found.</td></tr>
            ) : (
              paginatedStocks.map((stock) => {
                const profitMargin = stock.costPrice ? (((stock.sellingPrice - stock.costPrice) / stock.costPrice) * 100).toFixed(1) : '0';
                const isLowStock = stock.quantity < (stock.lowStockThreshold || 5) && stock.quantity > 0;
                const isOutOfStock = stock.quantity === 0;
                return (
                  <tr key={stock.id} className={`border-t border-neutral-100 ${isOutOfStock ? 'bg-red-50' : isLowStock ? 'bg-yellow-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{stock.productName}</td>
                    <td className="px-4 py-3">{stock.category || '-'}</td>
                    <td className="px-4 py-3">{stock.quantity}</td>
                    <td className="px-4 py-3">LKR {stock.costPrice}</td>
                    <td className="px-4 py-3">LKR {stock.sellingPrice}</td>
                    <td className="px-4 py-3">{profitMargin}%</td>
                    <td className="px-4 py-3">
                      {isOutOfStock ? <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-red-200 text-red-800">Out of Stock</span> :
                        isLowStock ? <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-yellow-200 text-yellow-800">Low Stock</span> :
                        <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">In Stock</span>}
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button className="text-blue-600 hover:underline" onClick={() => openEditModal(stock)}>Edit</button>
                      <button className="text-red-600 hover:underline" onClick={() => handleDelete(stock)}>Delete</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="flex justify-between items-center px-4 py-3 border-t border-neutral-100 bg-neutral-50">
        <span className="text-xs text-neutral-500">Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 text-xs font-medium"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <button
            className="px-3 py-1 rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 text-xs font-medium"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      </div>
      {/* Edit Modal */}
      {modalOpen && editStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative">
            <h2 className="text-xl font-bold mb-4">Edit Stock</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Quantity</label>
                <input type="number" name="quantity" value={form.quantity} onChange={handleEditChange} className="w-full border border-neutral-200 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cost Price</label>
                <input type="number" name="costPrice" value={form.costPrice} onChange={handleEditChange} className="w-full border border-neutral-200 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Selling Price</label>
                <input type="number" name="sellingPrice" value={form.sellingPrice} onChange={handleEditChange} className="w-full border border-neutral-200 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Low Stock Threshold</label>
                <input type="number" name="lowStockThreshold" value={form.lowStockThreshold} onChange={handleEditChange} className="w-full border border-neutral-200 rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="px-4 py-2 rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="px-4 py-2 rounded-md bg-primary-700 text-white font-medium hover:bg-primary-800" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
      {/* Add Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 transition-opacity animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative animate-slideUp">
            <button className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 text-2xl" onClick={() => setAddModalOpen(false)} aria-label="Close">&times;</button>
            <h2 className="text-2xl font-bold mb-6 text-primary-700 text-center">Add Product</h2>
            <form className="space-y-6" onSubmit={e => { e.preventDefault(); handleAdd(); }}>
              <div className="relative">
                <input type="text" name="productName" value={addForm.productName} onChange={handleProductNameChange} required
                  className="peer w-full border border-neutral-200 rounded-lg px-3 pt-6 pb-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all placeholder-transparent" placeholder="Product Name" autoComplete="off"
                  onKeyDown={handleProductNameKeyDown}
                />
                <label className="absolute left-3 top-2 text-xs text-neutral-500 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs bg-white px-1">Product Name</label>
                {showSuggestions && productSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-14 z-10 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {suggestionLoading ? (
                      <div className="px-4 py-2 text-neutral-400 text-sm">Loading...</div>
                    ) : (
                      productSuggestions.map((product, idx) => (
                        <button type="button" key={idx} className={`w-full text-left px-4 py-2 transition-colors text-sm ${highlightedIndex === idx ? 'bg-primary-100 text-primary-800' : 'hover:bg-primary-50'}`} onClick={() => handleSuggestionClick(product)}>
                          {product.name} <span className="text-neutral-400">LKR {product.price}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="relative">
                <select name="category" value={addForm.category} onChange={handleAddChange} required
                  className="peer w-full border border-neutral-200 rounded-lg px-3 pt-6 pb-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all">
                  <option value="" disabled>Select Category</option>
                  {COSMETIC_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <label className="absolute left-3 top-2 text-xs text-neutral-500 transition-all peer-focus:top-2 peer-focus:text-xs bg-white px-1">Category</label>
              </div>
              <div className="relative">
                <input type="number" name="quantity" value={addForm.quantity} onChange={handleAddChange} required min={0}
                  onFocus={handleAddFocus}
                  className="peer w-full border border-neutral-200 rounded-lg px-3 pt-6 pb-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all placeholder-transparent" placeholder="Quantity" />
                <label className="absolute left-3 top-2 text-xs text-neutral-500 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs bg-white px-1">Quantity</label>
              </div>
              <div className="relative">
                <input type="number" name="costPrice" value={addForm.costPrice} onChange={handleAddChange} required min={0}
                  onFocus={handleAddFocus}
                  className="peer w-full border border-neutral-200 rounded-lg px-3 pt-6 pb-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all placeholder-transparent" placeholder="Cost Price" />
                <label className="absolute left-3 top-2 text-xs text-neutral-500 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs bg-white px-1">Cost Price</label>
              </div>
              <div className="relative">
                <input type="number" name="sellingPrice" value={addForm.sellingPrice} onChange={handleAddChange} required min={0}
                  onFocus={handleAddFocus}
                  className="peer w-full border border-neutral-200 rounded-lg px-3 pt-6 pb-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all placeholder-transparent" placeholder="Selling Price" />
                <label className="absolute left-3 top-2 text-xs text-neutral-500 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs bg-white px-1">Selling Price</label>
              </div>
              <div className="relative">
                <input type="number" name="lowStockThreshold" value={addForm.lowStockThreshold} onChange={handleAddChange} required min={1}
                  className="peer w-full border border-neutral-200 rounded-lg px-3 pt-6 pb-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all placeholder-transparent" placeholder="Low Stock Threshold" />
                <label className="absolute left-3 top-2 text-xs text-neutral-500 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs bg-white px-1">Low Stock Threshold</label>
              </div>
              <div className="flex justify-end gap-2 mt-8">
                <button type="button" className="px-4 py-2 rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 transition-colors" onClick={() => setAddModalOpen(false)}>Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-md bg-primary-700 text-white font-medium hover:bg-primary-800 shadow-sm transition-colors">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 