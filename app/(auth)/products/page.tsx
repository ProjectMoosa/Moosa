"use client";
import { useEffect, useState, Fragment, useRef, useCallback, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, DocumentData, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from '@/components/useUser';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown, X, Plus } from "lucide-react";
import Container from "@/components/Container";
import { useDebounce } from "@/lib/useDebounce";
import { useFirestoreData } from "@/lib/useFirestoreData";
import PerformanceMonitor from "@/components/PerformanceMonitor";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Product>(emptyProduct);
  const [priceInput, setPriceInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [productsAddedThisSession, setProductsAddedThisSession] = useState(0);
  const [isDuplicate, setIsDuplicate] = useState(false);
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

  // Debounced search for better performance
  const debouncedSearch = useDebounce(search, 300);

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

  // Optimized data fetching with caching
  const { data: productsData, loading: productsLoading, refetch: refetchProducts } = useFirestoreData({
    collectionName: 'products_master',
    orderByField: 'name',
    orderDirection: 'asc',
    cacheKey: 'products-list'
  });

  // Memoized filtered products
  const filteredProducts = useMemo(() => {
    if (!debouncedSearch) return productsData;
    
    const searchLower = debouncedSearch.toLowerCase();
    return productsData.filter(product => 
      product.name.toLowerCase().includes(searchLower) ||
      product.brand.toLowerCase().includes(searchLower) ||
      product.category.toLowerCase().includes(searchLower)
    );
  }, [productsData, debouncedSearch]);

  useEffect(() => {
    if (!loading && role === 'vendor') {
      router.replace('/dashboard');
    }
  }, [role, loading, router]);

  if (loading || role === 'vendor') return null;

  // Fetch suggestions
  useEffect(() => {
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

  // Keyboard shortcuts for quick product addition
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (modalOpen && !editing && event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        const form = document.querySelector('form') as HTMLFormElement;
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, editing]);

  // Real-time duplicate checking
  useEffect(() => {
    if (modalOpen && !editing && form.name && form.brand) {
      const duplicate = checkForDuplicate(form);
      setIsDuplicate(duplicate);
    } else {
      setIsDuplicate(false);
    }
  }, [form.name, form.brand, modalOpen, editing, productsData]);



  async function fetchSuggestions() {
    try {
      const productsSnapshot = await getDocs(collection(db, "products_master"));
      const brands = new Map<string, number>();
      const categories = new Map<string, number>();

      productsData.forEach((product) => {
        if (product.brand) {
          brands.set(product.brand, (brands.get(product.brand) || 0) + 1);
        }
        if (product.category) {
          categories.set(product.category, (categories.get(product.category) || 0) + 1);
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

  function formatPrice(price: number): string {
    return `Rs ${price.toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
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
    if (product) {
      setEditing(product);
      setForm({
        name: product.name,
        brand: product.brand,
        category: product.category,
        description: product.description,
        price: product.price,
      });
      setBrandInput(product.brand);
      setCategoryInput(product.category);
      setPriceInput(product.price.toString());
    } else {
      setEditing(null);
      setForm({
        name: "",
        brand: "",
        category: "",
        description: "",
        price: 0,
      });
      setBrandInput("");
      setCategoryInput("");
      setPriceInput("");
    }
    setModalOpen(true);
    setError("");
    setSuccessMessage("");
    if (!product) {
      setProductsAddedThisSession(0); // Reset counter for new session
    }
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyProduct);
    setBrandInput("");
    setCategoryInput("");
    setPriceInput("");
    setError("");
    setSuccessMessage("");
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
    
    // Remove all non-digit characters except decimal point
    const cleanValue = value.replace(/[^\d.]/g, '');
    
    // Ensure only one decimal point
    const parts = cleanValue.split('.');
    if (parts.length > 2) {
      return; // Don't allow multiple decimal points
    }
    
    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1].length > 2) {
      return;
    }
    
    // Don't allow more than 10 digits before decimal
    if (parts[0].length > 10) {
      return;
    }
    
    setPriceInput(cleanValue);
    
    // Update form with numeric value
    const numericValue = parseFloat(cleanValue) || 0;
    setForm(prev => ({ ...prev, price: numericValue }));
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

  // Check for duplicate products
  const checkForDuplicate = (product: Product) => {
    return productsData.some((existing: any) => 
      existing.name.toLowerCase() === product.name.toLowerCase() &&
      existing.brand.toLowerCase() === product.brand.toLowerCase()
    );
  };

  // Add or update product
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccessMessage("");
    
    try {
      if (editing && editing.id) {
        // Edit
        await updateDoc(doc(db, "products_master", editing.id), form as any);
        await refetchProducts();
        await fetchSuggestions(); // Refresh suggestions
        closeModal(); // Close modal after editing
        setSuccessMessage("Product updated successfully!");
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        // Check for duplicates before adding
        if (checkForDuplicate(form)) {
          setError("A product with this name and brand already exists. Please check the existing products or modify the name/brand.");
          setSaving(false);
          return;
        }
        
        // Add
        await addDoc(collection(db, "products_master"), form as any);
        await refetchProducts();
        await fetchSuggestions(); // Refresh suggestions
        // Keep modal open for adding more products
        resetFormForNewProduct();
        setProductsAddedThisSession(prev => prev + 1);
        setSuccessMessage("Product added successfully!");
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (err: any) {
      setError(err.message || "Error saving product");
    } finally {
      setSaving(false);
    }
  }

  // Reset form for adding another product
  function resetFormForNewProduct() {
    setForm(emptyProduct);
    setBrandInput("");
    setCategoryInput("");
    setPriceInput("");
    setError("");
    setSuccessMessage("");
    setShowBrandDropdown(false);
    setShowCategoryDropdown(false);
    // Focus on the name input for quick entry
    setTimeout(() => {
      const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
      if (nameInput) nameInput.focus();
    }, 100);
  }

  // Delete product
  async function handleDelete(id?: string) {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "products_master", id));
      await refetchProducts();
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
      <PerformanceMonitor componentName="ProductsPage" />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        {/* Left: Heading + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800 whitespace-nowrap">Products / Stock</h1>
            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {productsData.length} products
                </span>
              {search && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {filteredProducts.length} found
                </span>
              )}
            </div>
          </div>
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
            className="bg-primary-700 hover:bg-primary-800 text-white font-medium px-4 py-2 rounded-md text-sm shadow-sm transition-colors flex items-center gap-2"
            onClick={() => openModal()}
          >
            <Plus className="w-4 h-4" />
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
                                      <div className="lato-regular text-sm text-neutral-800 mb-1">{formatPrice(product.price)}</div>
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
                                          <td className="px-4 py-3 lato-regular text-sm text-neutral-800">{formatPrice(product.price)}</td>
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
            {!editing && (
              <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-sm">💡</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">Quick Add Mode</h3>
                    <div className="text-xs text-blue-700 space-y-1">
                      <p>Use <kbd className="px-1.5 py-0.5 bg-blue-100 rounded text-xs font-mono">Ctrl+Enter</kbd> to quickly add products</p>
                      <p>Form stays open for multiple additions • Duplicate products are automatically prevented</p>
                      {productsAddedThisSession > 0 && (
                        <p className="text-xs font-medium text-green-700 mt-2">
                          ✅ {productsAddedThisSession} product{productsAddedThisSession !== 1 ? 's' : ''} added this session
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <form className="space-y-5" onSubmit={handleSave}>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">Name</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="block w-full border border-neutral-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm transition-colors"
                  placeholder="Enter product name"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">Brand</label>
                  <div className="relative">
                    <input
                      name="brand"
                      value={brandInput}
                      onChange={handleBrandInput}
                      onFocus={() => setShowBrandDropdown(true)}
                      onKeyDown={handleBrandKeyDown}
                      className="block w-full border border-neutral-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm pr-8 transition-colors"
                      placeholder="Type to search or create new"
                      required
                    />
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
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
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">Category</label>
                  <div className="relative">
                    <input
                      name="category"
                      value={categoryInput}
                      onChange={handleCategoryInput}
                      onFocus={() => setShowCategoryDropdown(true)}
                      onKeyDown={handleCategoryKeyDown}
                      className="block w-full border border-neutral-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm pr-8 transition-colors"
                      placeholder="Type to search or create new"
                      required
                    />
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
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
                                  className="px-3 py-2 cursor-pointer hover:bg-neutral-50 text-sm border-b border-neutral-100 last:border-b-0"
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
                                    className="px-3 py-2 cursor-pointer hover:bg-neutral-50 text-sm border-b border-neutral-100 last:border-b-0"
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
              </div>

              {isDuplicate && !editing && (
                <div className="p-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-md">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-600 text-sm">⚠️</span>
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">Duplicate detected</p>
                      <p className="text-xs">Modify name or brand to continue</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="block w-full border border-neutral-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm transition-colors"
                  rows={3}
                  placeholder="Enter product description"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm font-medium">
                    Rs
                  </span>
                  <input
                    name="price"
                    type="text"
                    value={priceInput}
                    onChange={handlePriceInput}
                    className="block w-full border border-neutral-200 rounded-lg pl-8 pr-3 py-2.5 focus:ring-2 focus:ring-primary-100 focus:border-primary-500 focus:outline-none text-sm transition-colors"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              {error && <div className="text-red-500 text-sm text-center">{error}</div>}
              {successMessage && (
                <div className="text-green-500 text-sm text-center">{successMessage}</div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 text-sm font-medium transition-colors"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                {!editing && (
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md border border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100 text-sm font-medium transition-colors"
                    onClick={resetFormForNewProduct}
                    disabled={saving}
                  >
                    Add Another
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
                  disabled={saving || (isDuplicate && !editing)}
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