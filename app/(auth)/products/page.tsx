"use client";
import { useEffect, useState, Fragment, useRef } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, DocumentData, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from '@/components/useUser';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown, X, Plus } from "lucide-react";
import Container from "@/components/Container";

interface Product {
  id?: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  price: number;
}

interface SuggestionItem {
  value: string;
  count: number;
  lastUsed?: Date;
}

const emptyProduct: Product = {
  name: "",
  brand: "",
  category: "",
  description: "",
  price: 0,
};

export default function ProductsPage() {
  const { role, loading } = useUser();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Product>(emptyProduct);
  const [priceInput, setPriceInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState<keyof Product | "">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleCols, setVisibleCols] = useState({
    brand: true,
    category: true,
    description: true,
  });
  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);
  const columnsDropdownRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  // Auto-complete states
  const [brandSuggestions, setBrandSuggestions] = useState<SuggestionItem[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<SuggestionItem[]>([]);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [brandInput, setBrandInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [filteredBrands, setFilteredBrands] = useState<SuggestionItem[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<SuggestionItem[]>([]);
  const brandDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && role === 'vendor') {
      router.replace('/dashboard');
    }
  }, [role, loading, router]);

  if (loading || role === 'vendor') return null;

  // Fetch products and suggestions
  useEffect(() => {
    fetchProducts();
    fetchSuggestions();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target as Node)) {
        setShowBrandDropdown(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(event.target as Node)) {
        setShowColumnsDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchProducts() {
    setProductsLoading(true);
      const querySnapshot = await getDocs(collection(db, "products_master"));
      const data: Product[] = querySnapshot.docs.map((doc: DocumentData) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setProducts(data);
    setProductsLoading(false);
  }

  async function fetchSuggestions() {
    try {
      const productsSnapshot = await getDocs(collection(db, "products_master"));
      const brands = new Map<string, number>();
      const categories = new Map<string, number>();

      productsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.brand) {
          brands.set(data.brand, (brands.get(data.brand) || 0) + 1);
        }
        if (data.category) {
          categories.set(data.category, (categories.get(data.category) || 0) + 1);
        }
      });

      const brandSuggestions = Array.from(brands.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      const categorySuggestions = Array.from(categories.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      setBrandSuggestions(brandSuggestions);
      setCategorySuggestions(categorySuggestions);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    }
  }

  // Get recent entries (last 10 products)
  function getRecentEntries() {
    return products.slice(0, 10).map(product => ({
      brand: product.brand,
      category: product.category
    }));
  }

  // Filter suggestions based on input
  useEffect(() => {
    const filteredBrands = brandSuggestions.filter(item =>
      item.value.toLowerCase().includes(brandInput.toLowerCase())
    );
    setFilteredBrands(filteredBrands);
  }, [brandInput, brandSuggestions]);

  useEffect(() => {
    const filteredCategories = categorySuggestions.filter(item =>
      item.value.toLowerCase().includes(categoryInput.toLowerCase())
    );
    setFilteredCategories(filteredCategories);
  }, [categoryInput, categorySuggestions]);

  // Open modal for add/edit
  function openModal(product?: Product) {
    setEditing(product || null);
    setForm(product ? { ...product } : emptyProduct);
    setBrandInput(product?.brand || "");
    setCategoryInput(product?.category || "");
    setPriceInput(product?.price ? product.price.toString() : "");
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyProduct);
    setBrandInput("");
    setCategoryInput("");
    setPriceInput("");
    setError("");
    setShowBrandDropdown(false);
    setShowCategoryDropdown(false);
  }

  // Handle form change
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    if (name === "price") {
      setPriceInput(value);
      setForm((f) => ({ ...f, [name]: value === "" ? 0 : Number(value) }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  // Handle price input specifically
  function handlePriceInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setPriceInput(value);
    setForm(prev => ({ ...prev, price: value === "" ? 0 : Number(value) }));
  }

  // Handle brand input
  function handleBrandInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setBrandInput(value);
    setForm(prev => ({ ...prev, brand: value }));
    setShowBrandDropdown(true);
  }

  // Handle category input
  function handleCategoryInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setCategoryInput(value);
    setForm(prev => ({ ...prev, category: value }));
    setShowCategoryDropdown(true);
  }

  // Handle keyboard navigation for brand
  function handleBrandKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && filteredBrands.length === 0 && brandInput.length > 0) {
      e.preventDefault();
      selectBrand(brandInput);
    } else if (e.key === 'Escape') {
      setShowBrandDropdown(false);
    }
  }

  // Handle keyboard navigation for category
  function handleCategoryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && filteredCategories.length === 0 && categoryInput.length > 0) {
      e.preventDefault();
      selectCategory(categoryInput);
    } else if (e.key === 'Escape') {
      setShowCategoryDropdown(false);
    }
  }

  // Select brand suggestion
  function selectBrand(brand: string) {
    setBrandInput(brand);
    setForm(prev => ({ ...prev, brand }));
    setShowBrandDropdown(false);
  }

  // Select category suggestion
  function selectCategory(category: string) {
    setCategoryInput(category);
    setForm(prev => ({ ...prev, category }));
    setShowCategoryDropdown(false);
  }

  // Add or update product
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing && editing.id) {
        // Edit
        await updateDoc(doc(db, "products_master", editing.id), form as any);
      } else {
        // Add
        await addDoc(collection(db, "products_master"), form as any);
      }
      await fetchProducts();
      await fetchSuggestions(); // Refresh suggestions
      closeModal();
    } catch (err: any) {
      setError(err.message || "Error saving product");
    } finally {
      setSaving(false);
    }
  }

  // Delete product
  async function handleDelete(id?: string) {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "products_master", id));
      await fetchProducts();
    } catch (err) {
      alert("Error deleting product");
    } finally {
      setSaving(false);
    }
  }

  // Sorting logic
  function handleSort(col: keyof Product) {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }
  // Filtered and sorted products
  const filteredProducts = products.filter((product) => {
    const searchLower = search.toLowerCase();
    return (
      searchLower === "" ||
      product.name.toLowerCase().includes(searchLower) ||
      product.brand.toLowerCase().includes(searchLower) ||
      product.category.toLowerCase().includes(searchLower) ||
      product.description.toLowerCase().includes(searchLower)
    );
  });
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortBy) return 0;
    const aVal = a[sortBy] ?? "";
    const bVal = b[sortBy] ?? "";
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return sortDir === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });
  // Pagination logic
  const totalPages = Math.ceil(sortedProducts.length / pageSize);
  const paginatedProducts = sortedProducts.slice((page - 1) * pageSize, page * pageSize);

  function handleToggleCol(col: keyof typeof visibleCols) {
    setVisibleCols((prev) => ({ ...prev, [col]: !prev[col] }));
  }

  return (
    <Container>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        {/* Left: Heading + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800 whitespace-nowrap">Products / Stock</h1>
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-neutral-400" />
            </span>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-10 pr-3 py-2 text-sm border border-neutral-200 rounded-full bg-neutral-50 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all duration-200 shadow-sm focus:shadow-lg placeholder-neutral-400"
              style={{ minWidth: 0 }}
            />
          </div>
        </div>
        {/* Right: Actions */}
        <div className="flex flex-wrap gap-2 items-center mt-2 sm:mt-0">
          <div className="relative" ref={columnsDropdownRef}>
            <button className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium px-3 py-2 rounded-md text-sm border border-neutral-200 transition-colors" type="button" onClick={() => setShowColumnsDropdown((v) => !v)}>
              Columns
            </button>
            {showColumnsDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-neutral-200 rounded shadow-lg z-10">
                <div className="px-4 py-2 text-xs text-neutral-500 font-semibold">Show Columns</div>
                <label className="flex items-center px-4 py-1 cursor-pointer text-sm">
                  <input type="checkbox" checked={visibleCols.brand} onChange={() => handleToggleCol("brand")}/>
                  <span className="ml-2">Brand</span>
                </label>
                <label className="flex items-center px-4 py-1 cursor-pointer text-sm">
                  <input type="checkbox" checked={visibleCols.category} onChange={() => handleToggleCol("category")}/>
                  <span className="ml-2">Category</span>
                </label>
                <label className="flex items-center px-4 py-1 cursor-pointer text-sm">
                  <input type="checkbox" checked={visibleCols.description} onChange={() => handleToggleCol("description")}/>
                  <span className="ml-2">Description</span>
                </label>
              </div>
            )}
          </div>
          <button
            className="bg-primary-700 hover:bg-primary-800 text-white font-medium px-4 py-2 rounded-md text-sm shadow-sm transition-colors"
            onClick={() => openModal()}
          >
            + Add Product
          </button>
          <button className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-4 py-2 rounded-md text-sm border border-blue-100 transition-colors">+ Import</button>
          <button className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-4 py-2 rounded-md text-sm border border-blue-100 transition-colors">+ Export</button>
        </div>
      </div>
      {/* Card layout for mobile */}
      <div className="block sm:hidden">
        {productsLoading ? (
          <div className="text-center py-8 text-neutral-400">Loading...</div>
        ) : paginatedProducts.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">No products found.</div>
        ) : (
          paginatedProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-xl shadow p-4 mb-3 border border-neutral-100">
              <div className="font-bold text-lg mb-1">{product.name}</div>
              <div className="text-sm text-neutral-500 mb-1">Brand: {product.brand}</div>
              <div className="text-sm text-neutral-500 mb-1">Category: {product.category}</div>
              <div className="lato-regular text-sm text-neutral-800 mb-1">Rs {product.price.toLocaleString()}.00</div>
              <div className="flex gap-2 mt-2">
                <button
                  className="px-3 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-xs font-medium transition-colors"
                  onClick={() => openModal(product)}
                >
                  Edit
                </button>
                <button
                  className="px-3 py-1 rounded-md bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 text-xs font-medium transition-colors"
                  onClick={() => handleDelete(product.id)}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
        {/* Pagination Controls for mobile */}
        <div className="flex flex-col xs:flex-row justify-between items-center gap-2 px-2 py-3 border-t border-neutral-100 bg-neutral-50">
          <div className="flex items-center gap-2 w-full xs:w-auto justify-start">
            <label htmlFor="pageSizeMobile" className="text-xs text-neutral-500">Show</label>
            <select
              id="pageSizeMobile"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border border-neutral-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {[5, 10, 20, 50, 100].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-xs text-neutral-500">per page</span>
          </div>
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
      </div>
      {/* Table for tablet/desktop */}
      <div className="hidden sm:block bg-white rounded-xl border border-neutral-100 shadow-sm overflow-x-auto">
        <table className="min-w-[600px] text-sm w-full">
          <thead>
            <tr className="text-neutral-500 text-xs uppercase">
              <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => handleSort("name")}>Name {sortBy === "name" && (sortDir === "asc" ? "▲" : "▼")}</th>
              {visibleCols.brand && <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => handleSort("brand")}>Brand {sortBy === "brand" && (sortDir === "asc" ? "▲" : "▼")}</th>}
              {visibleCols.category && <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => handleSort("category")}>Category {sortBy === "category" && (sortDir === "asc" ? "▲" : "▼")}</th>}
              {/* Hide description on md and below */}
              {visibleCols.description && <th className="px-4 py-3 text-left hidden lg:table-cell">Description</th>}
              <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => handleSort("price")}>Price {sortBy === "price" && (sortDir === "asc" ? "▲" : "▼")}</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {productsLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-neutral-400">Loading...</td>
              </tr>
            ) : paginatedProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-neutral-400">No products found.</td>
              </tr>
            ) : (
              paginatedProducts.map((product) => (
                <tr key={product.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-neutral-900">{product.name}</td>
                  {visibleCols.brand && <td className="px-4 py-3">{product.brand}</td>}
                  {visibleCols.category && <td className="px-4 py-3">{product.category}</td>}
                  {/* Hide description on md and below */}
                  {visibleCols.description && <td className="px-4 py-3 hidden lg:table-cell">{product.description}</td>}
                  <td className="px-4 py-3 lato-regular text-sm text-neutral-800">Rs {product.price.toLocaleString()}.00</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      className="px-3 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-xs font-medium transition-colors"
                      onClick={() => openModal(product)}
                    >
                      Edit
                    </button>
                    <button
                      className="px-3 py-1 rounded-md bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 text-xs font-medium transition-colors"
                      onClick={() => handleDelete(product.id)}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Pagination Controls for tablet/desktop */}
        <div className="flex flex-col xs:flex-row justify-between items-center gap-2 px-4 py-3 border-t border-neutral-100 bg-neutral-50">
          <div className="flex items-center gap-2 w-full xs:w-auto justify-start">
            <label htmlFor="pageSizeDesktop" className="text-xs text-neutral-500">Show</label>
            <select
              id="pageSizeDesktop"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border border-neutral-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {[5, 10, 20, 50, 100].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-xs text-neutral-500">per page</span>
          </div>
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
      </div>
      {/* Floating Add Product Button */}
      <button
        className="fixed bottom-8 right-6 z-50 w-14 h-14 rounded-full bg-primary-700 text-white shadow-xl flex items-center justify-center hover:bg-primary-800 hover:scale-110 active:scale-95 transition-all duration-150 border-4 border-white"
        style={{ boxShadow: '0 4px 16px 0 rgba(60, 60, 60, 0.10)' }}
        onClick={() => openModal()}
        aria-label="Add Product"
      >
        <Plus className="w-7 h-7" />
      </button>
      {/* Modal for Add/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-30 px-2">
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 w-full max-w-md relative">
            <button
              className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 text-xl"
              onClick={closeModal}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-lg font-bold mb-4">{editing ? "Edit Product" : "Add Product"}</h2>
            <form className="space-y-4" onSubmit={handleSave}>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Name</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm transition-colors"
                  placeholder="Enter product name"
                  required
                />
              </div>
              
              <div className="relative">
                <label className="block text-sm font-medium text-neutral-700">Brand</label>
                <div className="relative">
                  <input
                    name="brand"
                    value={brandInput}
                    onChange={handleBrandInput}
                    onFocus={() => setShowBrandDropdown(true)}
                    onKeyDown={handleBrandKeyDown}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm pr-8 transition-colors"
                    placeholder="Type to search or create new"
                    required
                  />
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
                </div>
                {showBrandDropdown && (
                  <div ref={brandDropdownRef} className="absolute z-20 mt-1 w-full bg-white border border-neutral-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredBrands.length === 0 && brandInput.length > 0 ? (
                      <div className="px-4 py-2 text-sm text-neutral-500">
                        Press Enter to create "{brandInput}"
                      </div>
                    ) : (
                      <>
                        {filteredBrands.length > 0 && (
                          <>
                            <div className="px-4 py-2 text-xs font-medium text-neutral-500 bg-neutral-50 border-b border-neutral-100">
                              Matching brands ({filteredBrands.length})
                            </div>
                            {filteredBrands.slice(0, 8).map((item) => (
                              <div
                                key={item.value}
                                className="px-4 py-2 cursor-pointer hover:bg-neutral-50 text-sm border-b border-neutral-100 last:border-b-0"
                                onClick={() => selectBrand(item.value)}
                              >
                                <div className="font-medium">{item.value}</div>
                                <div className="text-xs text-neutral-500">{item.count} products</div>
                              </div>
                            ))}
                          </>
                        )}
                        {filteredBrands.length === 0 && brandSuggestions.length > 0 && (
                          <>
                            <div className="px-4 py-2 text-xs font-medium text-neutral-500 bg-neutral-50 border-b border-neutral-100">
                              Popular brands
                            </div>
                            {brandSuggestions.slice(0, 5).map((item) => (
                              <div
                                key={item.value}
                                className="px-4 py-2 cursor-pointer hover:bg-neutral-50 text-sm border-b border-neutral-100 last:border-b-0"
                                onClick={() => selectBrand(item.value)}
                              >
                                <div className="font-medium">{item.value}</div>
                                <div className="text-xs text-neutral-500">{item.count} products</div>
                              </div>
                            ))}
                          </>
                        )}
                        {getRecentEntries().length > 0 && (
                          <>
                            <div className="px-4 py-2 text-xs font-medium text-neutral-500 bg-neutral-50 border-b border-neutral-100">
                              Recent brands
                            </div>
                            {getRecentEntries()
                              .map(entry => entry.brand)
                              .filter((brand, index, arr) => arr.indexOf(brand) === index)
                              .slice(0, 3)
                              .map((brand) => (
                                <div
                                  key={brand}
                                  className="px-4 py-2 cursor-pointer hover:bg-neutral-50 text-sm border-b border-neutral-100 last:border-b-0"
                                  onClick={() => selectBrand(brand)}
                                >
                                  <div className="font-medium">{brand}</div>
                                  <div className="text-xs text-neutral-500">Recently used</div>
                                </div>
                              ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-neutral-700">Category</label>
                <div className="relative">
                  <input
                    name="category"
                    value={categoryInput}
                    onChange={handleCategoryInput}
                    onFocus={() => setShowCategoryDropdown(true)}
                    onKeyDown={handleCategoryKeyDown}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm pr-8 transition-colors"
                    placeholder="Type to search or create new"
                    required
                  />
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
                </div>
                {showCategoryDropdown && (
                  <div ref={categoryDropdownRef} className="absolute z-20 mt-1 w-full bg-white border border-neutral-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredCategories.length === 0 && categoryInput.length > 0 ? (
                      <div className="px-4 py-2 text-sm text-neutral-500">
                        Press Enter to create "{categoryInput}"
                      </div>
                    ) : (
                      <>
                        {filteredCategories.length > 0 && (
                          <>
                            <div className="px-4 py-2 text-xs font-medium text-neutral-500 bg-neutral-50 border-b border-neutral-100">
                              Matching categories ({filteredCategories.length})
                            </div>
                            {filteredCategories.slice(0, 8).map((item) => (
                              <div
                                key={item.value}
                                className="px-4 py-2 cursor-pointer hover:bg-neutral-50 text-sm border-b border-neutral-100 last:border-b-0"
                                onClick={() => selectCategory(item.value)}
                              >
                                <div className="font-medium">{item.value}</div>
                                <div className="text-xs text-neutral-500">{item.count} products</div>
                              </div>
                            ))}
                          </>
                        )}
                        {filteredCategories.length === 0 && categorySuggestions.length > 0 && (
                          <>
                            <div className="px-4 py-2 text-xs font-medium text-neutral-500 bg-neutral-50 border-b border-neutral-100">
                              Popular categories
                            </div>
                            {categorySuggestions.slice(0, 5).map((item) => (
                              <div
                                key={item.value}
                                className="px-4 py-2 cursor-pointer hover:bg-neutral-50 text-sm border-b border-neutral-100 last:border-b-0"
                                onClick={() => selectCategory(item.value)}
                              >
                                <div className="font-medium">{item.value}</div>
                                <div className="text-xs text-neutral-500">{item.count} products</div>
                              </div>
                            ))}
                          </>
                        )}
                        {getRecentEntries().length > 0 && (
                          <>
                            <div className="px-4 py-2 text-xs font-medium text-neutral-500 bg-neutral-50 border-b border-neutral-100">
                              Recent categories
                            </div>
                            {getRecentEntries()
                              .map(entry => entry.category)
                              .filter((category, index, arr) => arr.indexOf(category) === index)
                              .slice(0, 3)
                              .map((category) => (
                                <div
                                  key={category}
                                  className="px-4 py-2 cursor-pointer hover:bg-neutral-50 text-sm border-b border-neutral-100 last:border-b-0"
                                  onClick={() => selectCategory(category)}
                                >
                                  <div className="font-medium">{category}</div>
                                  <div className="text-xs text-neutral-500">Recently used</div>
                                </div>
                              ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm transition-colors"
                  rows={2}
                  placeholder="Enter product description"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Price</label>
                <input
                  name="price"
                  type="number"
                  value={priceInput}
                  onChange={handlePriceInput}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm transition-colors"
                  placeholder="Enter price"
                  required
                  min={0}
                />
              </div>
              {error && <div className="text-red-500 text-sm text-center">{error}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 text-sm"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-sm font-medium shadow-sm disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? (editing ? "Saving..." : "Adding...") : (editing ? "Save Changes" : "Add Product")}
                </button>
              </div>
            </form>
      </div>
    </div>
      )}
    </Container>
  );
} 