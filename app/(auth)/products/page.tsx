"use client";
import { useEffect, useState, Fragment, useRef } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from '@/components/useUser';
import { useRouter } from 'next/navigation';

interface Product {
  id?: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  price: number;
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState<keyof Product | "">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [visibleCols, setVisibleCols] = useState({
    brand: true,
    category: true,
    description: true,
  });
  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && role === 'vendor') {
      router.replace('/dashboard');
    }
  }, [role, loading, router]);

  if (loading || role === 'vendor') return null;

  // Fetch products
  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!showColumnsDropdown) return;
    function handleClick(e: MouseEvent) {
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(e.target as Node)) {
        setShowColumnsDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showColumnsDropdown]);

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

  // Open modal for add/edit
  function openModal(product?: Product) {
    setEditing(product || null);
    setForm(product ? { ...product } : emptyProduct);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyProduct);
    setError("");
  }

  // Handle form change
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === "price" ? Number(value) : value }));
  }

  // Add or update product
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing && editing.id) {
        // Edit
        await updateDoc(doc(db, "products_master", editing.id), form);
      } else {
        // Add
        await addDoc(collection(db, "products_master"), form);
      }
      await fetchProducts();
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
  const sortedProducts = [...products].sort((a, b) => {
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
    <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Products / Stock</h1>
        <div className="flex flex-wrap gap-2 items-center">
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
              <div className="text-sm text-neutral-500 mb-2">Price: LKR {product.price}</div>
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
                  <td className="px-4 py-3">{product.price}</td>
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
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Brand</label>
                <input
                  name="brand"
                  value={form.brand}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Category</label>
                <input
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  rows={2}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Price</label>
                <input
                  name="price"
                  type="number"
                  value={form.price}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
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
    </div>
  );
} 