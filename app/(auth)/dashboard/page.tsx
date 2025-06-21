// This file will be moved to app/(dashboard)/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, orderBy, limit, addDoc, updateDoc, deleteDoc, doc, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUser } from '@/components/useUser';
import VendorDashboardPage from './vendor-page';
import Container from '@/components/Container';

export default function DashboardPage() {
  const { role, businessName, vendor, loading, user } = useUser();
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalStock, setTotalStock] = useState(0);
  const [totalVendors, setTotalVendors] = useState(0);
  const [activeVendors, setActiveVendors] = useState(0);
  const [recentVendors, setRecentVendors] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (role !== 'admin') return; // Only fetch admin data for admins

    const fetchTotalRevenue = async () => {
      const paymentsSnap = await getDocs(collection(db, 'payment_records'));
      const payments = paymentsSnap.docs.map(doc => doc.data());
      const sum = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      setTotalRevenue(sum);
    };
    const fetchTotalStock = async () => {
      const productsSnap = await getDocs(collection(db, 'products_master'));
      setTotalStock(productsSnap.size);
    };
    const fetchVendors = async () => {
      const vendorsSnap = await getDocs(collection(db, 'vendor_accounts'));
      const vendors = vendorsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTotalVendors(vendors.length);
      setActiveVendors(vendors.filter(v => (v as any).status === 'Active' || (v as any).subscription?.status === 'Active').length);
    };
    const fetchRecentVendors = async () => {
      const qVendors = query(collection(db, 'vendor_accounts'), orderBy('createdAt', 'desc'), limit(5));
      const snap = await getDocs(qVendors);
      setRecentVendors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchTotalRevenue();
    fetchTotalStock();
    fetchVendors();
    fetchRecentVendors();
  }, [role]);

  const stats = [
    { label: "Total Revenue", value: `LKR ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, change: "+23%" },
    { label: "Total Vendors", value: totalVendors.toString(), change: "+67%" },
    { label: "Active Vendors", value: activeVendors.toString(), change: "+67%" },
    { label: "Total Stock", value: totalStock.toString(), change: "" },
  ];

  if (loading || !user) {
    return null;
  }
  if (role === 'vendor') {
    return <VendorDashboardPage />;
  }

  // Floating Add Button State
  const [fabOpen, setFabOpen] = useState(false);

  // --- Product Modal State & Logic ---
  interface Product {
    id?: string;
    name: string;
    brand: string;
    category: string;
    description: string;
    price: number;
  }
  const emptyProduct: Product = {
    name: '',
    brand: '',
    category: '',
    description: '',
    price: 0,
  };
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productForm, setProductForm] = useState<Product>(emptyProduct);
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError] = useState('');
  function openProductModal() {
    setProductForm(emptyProduct);
    setProductError('');
    setProductModalOpen(true);
  }
  function closeProductModal() {
    setProductModalOpen(false);
    setProductForm(emptyProduct);
    setProductError('');
  }
  function handleProductChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setProductForm((f) => ({ ...f, [name]: name === 'price' ? Number(value) : value }));
  }
  async function handleProductSave(e: React.FormEvent) {
    e.preventDefault();
    setProductSaving(true);
    setProductError('');
    try {
      await addDoc(collection(db, 'products_master'), productForm);
      closeProductModal();
    } catch (err: any) {
      setProductError(err.message || 'Error saving product');
    } finally {
      setProductSaving(false);
    }
  }

  // --- Vendor Modal State & Logic ---
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [vendorForm, setVendorForm] = useState<any>({});
  const [vendorPlans, setVendorPlans] = useState<any[]>([]);
  const [selectedVendorPlan, setSelectedVendorPlan] = useState<any>(null);
  const [vendorPassword, setVendorPassword] = useState('');
  const [vendorConfirmPassword, setVendorConfirmPassword] = useState('');
  const [vendorSaving, setVendorSaving] = useState(false);
  const [vendorError, setVendorError] = useState('');
  const [vendorShowPassword, setVendorShowPassword] = useState(false);
  function openVendorModal() {
    setVendorForm({});
    setSelectedVendorPlan(null);
    setVendorPassword('');
    setVendorConfirmPassword('');
    setVendorError('');
    setVendorShowPassword(false);
    setVendorModalOpen(true);
    fetchVendorPlans();
  }
  function closeVendorModal() {
    setVendorModalOpen(false);
    setVendorForm({});
    setSelectedVendorPlan(null);
    setVendorPassword('');
    setVendorConfirmPassword('');
    setVendorError('');
    setVendorShowPassword(false);
  }
  async function fetchVendorPlans() {
    const plansSnap = await getDocs(collection(db, 'subscription_plans'));
    setVendorPlans(plansSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  }
  function handleVendorChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setVendorForm((f: any) => ({ ...f, [name]: value }));
  }
  function handleVendorPlanSelect(plan: any) {
    setSelectedVendorPlan(plan);
  }
  function handleVendorGeneratePassword() {
    const words = ['Parrot', 'Galaxy', 'Amazon', 'Tiger', 'Falcon', 'Rocket', 'World', 'Pixel', 'Matrix', 'Delta'];
    const word = words[Math.floor(Math.random() * words.length)];
    const number = Math.floor(1000 + Math.random() * 9000);
    const pwd = `${word}@${number}`;
    setVendorPassword(pwd);
    setVendorConfirmPassword(pwd);
    setVendorShowPassword(true);
  }
  async function handleVendorSave(e: React.FormEvent) {
    e.preventDefault();
    setVendorSaving(true);
    setVendorError('');
    if (!selectedVendorPlan) {
      setVendorError('Please select a subscription plan.');
      setVendorSaving(false);
      return;
    }
    if (!vendorPassword || vendorPassword !== vendorConfirmPassword) {
      setVendorError('Passwords do not match.');
      setVendorSaving(false);
      return;
    }
    try {
      // Generate vendorCode (M001, M002, ...)
      const accountsSnap = await getDocs(collection(db, 'vendor_accounts'));
      const ids = accountsSnap.docs
        .map(doc => doc.data().vendorCode)
        .filter(Boolean)
        .map((id: string) => parseInt(id.replace(/^M/, ''), 10))
        .filter(n => !isNaN(n));
      const nextNum = ids.length > 0 ? Math.max(...ids) + 1 : 1;
      const vendorCode = `M${String(nextNum).padStart(3, '0')}`;
      // Call API route to create vendor (Admin SDK)
      const res = await fetch('/api/create-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: vendorForm.email,
          password: vendorPassword,
          vendorData: {
            ...vendorForm,
            vendorCode,
            subscription: {
              plan: selectedVendorPlan.name,
              monthlyFee: selectedVendorPlan.price,
              features: selectedVendorPlan.features,
              duration: selectedVendorPlan.duration,
            },
            status: vendorForm.status || 'Active',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error creating vendor');
      closeVendorModal();
    } catch (err: any) {
      setVendorError(err.message || 'Error adding vendor');
    } finally {
      setVendorSaving(false);
    }
  }

  // --- Plan Modal State & Logic ---
  interface Plan {
    id?: string;
    name: string;
    planId: string;
    price: number;
    duration: string;
    description: string;
    features: string[];
    enabled?: boolean;
  }
  const emptyPlan: Plan = {
    name: '',
    planId: '',
    price: 0,
    duration: '',
    description: '',
    features: [''],
  };
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState<Plan>(emptyPlan);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState('');
  function openPlanModal() {
    setPlanForm(emptyPlan);
    setPlanError('');
    setPlanModalOpen(true);
  }
  function closePlanModal() {
    setPlanModalOpen(false);
    setPlanForm(emptyPlan);
    setPlanError('');
  }
  function handlePlanChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setPlanForm((f) => ({ ...f, [name]: name === 'price' ? Number(value) : value }));
  }
  function handlePlanFeatureChange(idx: number, value: string) {
    setPlanForm((f) => {
      const features = [...f.features];
      features[idx] = value;
      return { ...f, features };
    });
  }
  function addPlanFeature() {
    setPlanForm((f) => ({ ...f, features: [...f.features, ''] }));
  }
  function removePlanFeature(idx: number) {
    setPlanForm((f) => {
      const features = f.features.filter((_, i) => i !== idx);
      return { ...f, features: features.length ? features : [''] };
    });
  }
  async function handlePlanSave(e: React.FormEvent) {
    e.preventDefault();
    setPlanSaving(true);
    setPlanError('');
    try {
      const { id, ...data } = planForm;
      data.features = data.features.filter((f) => f.trim() !== '');
      await addDoc(collection(db, 'subscription_plans'), { ...data, enabled: true });
      closePlanModal();
    } catch (err: any) {
      setPlanError(err.message || 'Error saving plan');
    } finally {
      setPlanSaving(false);
    }
  }

  function handleAdd(type: 'product' | 'vendor' | 'plan') {
    setFabOpen(false);
    switch (type) {
      case 'product':
        openProductModal();
        break;
      case 'vendor':
        openVendorModal();
        break;
      case 'plan':
        openPlanModal();
        break;
    }
  }

  // Add useEffect to monitor modal states
  useEffect(() => {
    console.log('Modal states:', {
      productModalOpen,
      vendorModalOpen,
      planModalOpen
    });
  }, [productModalOpen, vendorModalOpen, planModalOpen]);

  // Admin dashboard (default)
  return (
    <Container>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-6 sm:py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Dashboard</h1>
        <p className="text-neutral-500 mb-4 sm:mb-6">Welcome back! Here's what's happening with your platform.</p>
      {/* Stats Cards */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {stats.map((stat, i) => (
            <div key={i} className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4 sm:p-5 flex flex-col gap-1">
            <div className="text-sm text-neutral-500 font-medium">{stat.label}</div>
            <div className="text-xl font-bold text-neutral-900">{stat.value}</div>
            <div className="text-xs font-semibold text-green-600">{stat.change}</div>
          </div>
        ))}
      </div>
      {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4 sm:p-6 min-h-[120px] sm:min-h-[140px] flex flex-col justify-between">
          <div className="text-sm font-semibold text-neutral-800 mb-2">Revenue Trends</div>
          <div className="text-xs text-neutral-400 mb-2">Last 30 Days</div>
          <div className="flex-1 flex items-center justify-center text-neutral-300">Chart visualization coming soon</div>
          <div className="text-xs font-semibold text-green-600 mt-2">+15%</div>
        </div>
          <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4 sm:p-6 min-h-[120px] sm:min-h-[140px] flex flex-col justify-between">
          <div className="text-sm font-semibold text-neutral-800 mb-2">Vendor Growth</div>
          <div className="text-xs text-neutral-400 mb-2">Last 30 Days</div>
          <div className="flex-1 flex items-center justify-center text-neutral-300">Chart visualization coming soon</div>
          <div className="text-xs font-semibold text-green-600 mt-2">+5%</div>
        </div>
      </div>
      {/* Recent Vendors Table */}
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4 sm:p-6 overflow-x-auto">
          <div className="text-lg font-bold text-neutral-900 mb-3 sm:mb-4">Recent Vendors</div>
        <div className="overflow-x-auto">
            <table className="min-w-[600px] text-sm w-full">
            <thead>
              <tr className="text-neutral-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">Business Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Subscription Plan</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created At</th>
              </tr>
            </thead>
            <tbody>
                {recentVendors.map((vendor, i) => {
                  const status = (vendor as any).status || (vendor as any).subscription?.status || '-';
                  return (
                    <tr key={vendor.id || i} className="border-t border-neutral-100">
                      <td className="px-4 py-2 font-medium text-neutral-900">{vendor.businessName || vendor.name || '-'}</td>
                      <td className="px-4 py-2">{vendor.email || '-'}</td>
                      <td className="px-4 py-2">{vendor.subscriptionPlan || vendor.subscription?.plan || '-'}</td>
                  <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{status}</span>
                  </td>
                      <td className="px-4 py-2">{vendor.createdAt && vendor.createdAt.seconds ? new Date(vendor.createdAt.seconds * 1000).toLocaleDateString() : '-'}</td>
                </tr>
                  );
                })}
            </tbody>
          </table>
          </div>
          <div className="flex justify-end mt-3 sm:mt-4 text-xs text-neutral-500">Page 1 of 1</div>
        </div>
        {/* Floating Add Button */}
        <div className="fixed bottom-8 right-6 z-50 flex flex-col items-end">
          {/* Overlay */}
          {fabOpen && (
            <div 
              className="fixed inset-0 z-40 bg-black bg-opacity-20" 
              onClick={(e) => {
                e.stopPropagation();
                setFabOpen(false);
              }} 
            />
          )}
          {/* Menu */}
          <div 
            className={`absolute bottom-16 right-0 transition-all duration-200 flex flex-col gap-2 ${fabOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}`}
            style={{ zIndex: 60 }}
          >
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAdd('product');
              }} 
              className="bg-white border border-neutral-200 shadow-lg rounded-lg px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition flex items-center gap-2 whitespace-nowrap"
            >
              <span className="text-lg">📦</span> Add Product
            </button>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAdd('vendor');
              }} 
              className="bg-white border border-neutral-200 shadow-lg rounded-lg px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition flex items-center gap-2 whitespace-nowrap"
            >
              <span className="text-lg">👤</span> Add Vendor
            </button>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAdd('plan');
              }} 
              className="bg-white border border-neutral-200 shadow-lg rounded-lg px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition flex items-center gap-2 whitespace-nowrap"
            >
              <span className="text-lg">💳</span> Add Plan
            </button>
          </div>
          {/* FAB */}
          <button
            className="w-12 h-12 rounded-full bg-primary-700 text-white shadow-xl flex items-center justify-center hover:bg-primary-600 hover:scale-110 active:scale-95 transition-all duration-150 z-50 border-4 border-white"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setFabOpen((v) => !v);
            }}
            aria-label="Add"
            style={{ boxShadow: '0 4px 16px 0 rgba(60, 60, 60, 0.10)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-plus">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        {/* Add Product Modal */}
        {productModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-30 px-2" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
              <button
                className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 text-xl"
                onClick={(e) => {
                  e.stopPropagation();
                  closeProductModal();
                }}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="text-lg font-bold mb-4">Add Product</h2>
              <form className="space-y-4" onSubmit={handleProductSave}>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Name</label>
                  <input
                    name="name"
                    value={productForm.name}
                    onChange={handleProductChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Brand</label>
                  <input
                    name="brand"
                    value={productForm.brand}
                    onChange={handleProductChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Category</label>
                  <input
                    name="category"
                    value={productForm.category}
                    onChange={handleProductChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Description</label>
                  <textarea
                    name="description"
                    value={productForm.description}
                    onChange={handleProductChange}
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
                    value={productForm.price}
                    onChange={handleProductChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    required
                    min={0}
                  />
                </div>
                {productError && <div className="text-red-500 text-sm text-center">{productError}</div>}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 text-sm"
                    onClick={closeProductModal}
                    disabled={productSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-sm font-medium shadow-sm disabled:opacity-50"
                    disabled={productSaving}
                  >
                    {productSaving ? 'Adding...' : 'Add Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Add Vendor Modal */}
        {vendorModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-30">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl relative flex flex-col max-h-[90vh]">
              <div className="bg-primary-700 rounded-t-2xl px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                <div className="text-lg font-bold text-white">Add New Vendor</div>
                <button className="text-white text-2xl" onClick={closeVendorModal} aria-label="Close">&times;</button>
              </div>
              <form className="flex-1 overflow-y-auto p-6 space-y-8" onSubmit={handleVendorSave}>
                <section>
                  <div className="font-semibold text-neutral-900 mb-3 text-base">Business Information</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <input name="businessName" required placeholder="e.g., Beauty Palace" className="border border-neutral-200 rounded-md px-3 py-2" value={vendorForm.businessName || ''} onChange={handleVendorChange} />
                    <input name="businessType" required placeholder="Cosmetics Store" className="border border-neutral-200 rounded-md px-3 py-2" value={vendorForm.businessType || ''} onChange={handleVendorChange} />
                  </div>
                  <textarea name="businessDescription" placeholder="Brief description of your business..." className="border border-neutral-200 rounded-md px-3 py-2 w-full min-h-[60px]" value={vendorForm.businessDescription || ''} onChange={handleVendorChange} />
                </section>
                <section className="bg-blue-50 rounded-lg p-4">
                  <div className="font-semibold text-neutral-900 mb-2">🔒 Firebase Authentication Setup</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                    <input name="password" type={vendorShowPassword ? 'text' : 'password'} required placeholder="Enter password" className="border border-neutral-200 rounded-md px-3 py-2" value={vendorPassword} onChange={e => setVendorPassword(e.target.value)} />
                    <input name="confirmPassword" type={vendorShowPassword ? 'text' : 'password'} required placeholder="Confirm password" className="border border-neutral-200 rounded-md px-3 py-2" value={vendorConfirmPassword} onChange={e => setVendorConfirmPassword(e.target.value)} />
                  </div>
                  <button type="button" className="text-primary-700 font-medium mb-2" onClick={handleVendorGeneratePassword}>Generate Easy Password (Word@Numbers)</button>
                  <div className="text-xs text-neutral-600 mb-2">Password format: <b>Word@Numbers</b> (e.g., Parrot@2323, Galaxy@7283)</div>
                  {vendorShowPassword && (
                    <div className="bg-white border border-neutral-200 rounded px-3 py-2 text-sm mb-2">Password: <b>{vendorPassword}</b></div>
                  )}
                </section>
                <section>
                  <div className="font-semibold text-neutral-900 mb-3 text-base">Subscription Plan</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {vendorPlans.map((plan: any) => (
                      <label key={plan.id} className={`border rounded-lg p-4 cursor-pointer transition-colors flex flex-col gap-1 ${selectedVendorPlan?.id === plan.id ? 'border-primary-700 bg-primary-50' : 'border-neutral-200 bg-white'}`}>
                        <input
                          type="radio"
                          name="subscriptionPlan"
                          className="mr-2 mb-2"
                          checked={selectedVendorPlan?.id === plan.id}
                          onChange={() => handleVendorPlanSelect(plan)}
                        />
                        <div className="font-bold text-lg mb-1">{plan.name}</div>
                        <div className="text-primary-700 font-bold mb-1">LKR {plan.price?.toLocaleString()} / {plan.duration?.toLowerCase().startsWith('year') ? 'yr' : 'mo'}</div>
                        <div className="text-neutral-600 text-xs mb-2">{plan.description}</div>
                        {plan.features && plan.features.length > 0 && (
                          <ul className="text-xs text-neutral-700 list-disc list-inside">
                            {plan.features.map((f: string, i: number) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        )}
                      </label>
                    ))}
                  </div>
                </section>
                {vendorError && <div className="text-red-500 text-sm text-center">{vendorError}</div>}
                <div className="flex justify-end gap-2 px-6 pb-6 pt-4 bg-white rounded-b-2xl sticky bottom-0 z-20">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 text-sm"
                    onClick={closeVendorModal}
                    disabled={vendorSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-sm font-medium shadow-sm disabled:opacity-50"
                    disabled={vendorSaving}
                  >
                    {vendorSaving ? 'Creating...' : 'Create Vendor Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Add Plan Modal */}
        {planModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-30">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl relative">
              <button
                className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 text-xl"
                onClick={closePlanModal}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="text-lg font-bold mb-4">Add Plan</h2>
              <form className="space-y-4" onSubmit={handlePlanSave}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    name="name"
                    value={planForm.name}
                    onChange={handlePlanChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400"
                    required
                    placeholder="Plan Name"
                  />
                  <input
                    name="planId"
                    value={planForm.planId}
                    onChange={handlePlanChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400"
                    required
                    placeholder="Plan ID (e.g. basic)"
                  />
                  <input
                    name="price"
                    type="number"
                    value={planForm.price}
                    onChange={handlePlanChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400"
                    required
                    min={0}
                    placeholder="Price (LKR)"
                  />
                  <input
                    name="duration"
                    value={planForm.duration}
                    onChange={handlePlanChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400"
                    required
                    placeholder="Duration (e.g. Monthly)"
                  />
                  <input
                    name="description"
                    value={planForm.description}
                    onChange={handlePlanChange}
                    className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400 md:col-span-2"
                    required
                    placeholder="Description"
                  />
                </div>
                <div>
                  <label className="block text-base font-semibold text-neutral-900 mb-2">Features</label>
                  {planForm.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <input
                        value={feature}
                        onChange={e => handlePlanFeatureChange(idx, e.target.value)}
                        className="block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-base"
                        placeholder={`Feature ${idx + 1}`}
                      />
                      {planForm.features.length > 1 && (
                        <button type="button" className="text-red-600 text-sm" onClick={() => removePlanFeature(idx)}>
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="text-primary-700 font-medium mt-1" onClick={addPlanFeature}>
                    + Add Feature
                  </button>
                </div>
                {planError && <div className="text-red-500 text-sm text-center">{planError}</div>}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 text-base"
                    onClick={closePlanModal}
                    disabled={planSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-base font-semibold shadow-sm disabled:opacity-50"
                    disabled={planSaving}
                  >
                    {planSaving ? 'Adding...' : 'Add Plan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
} 