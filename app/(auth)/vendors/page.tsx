"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, DocumentData, Timestamp, query, where, orderBy, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUser } from '@/components/useUser';
import { useRouter } from 'next/navigation';

function formatDate(ts: any) {
  if (!ts) return "-";
  if (typeof ts === "string") return ts;
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
  return "-";
}

function formatPrice(price: number, duration: string) {
  return `LKR ${price.toLocaleString("en-US")}/${duration?.toLowerCase().startsWith("year") ? "yr" : "mo"}`;
}

function generatePassword() {
  const words = ["Parrot", "Galaxy", "Amazon", "Tiger", "Falcon", "Rocket", "World", "Pixel", "Matrix", "Delta"];
  const word = words[Math.floor(Math.random() * words.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  return `${word}@${number}`;
}

export default function VendorsPage() {
  const { role, loading } = useUser();
  const router = useRouter();
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [viewVendor, setViewVendor] = useState<any>(null);
  const [editVendor, setEditVendor] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('Details');
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [searchPayment, setSearchPayment] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({ amount: "", date: "", notes: "", method: "Bank Transfer", period: "", status: "paid" });
  const [debugAddVendorError, setDebugAddVendorError] = useState("");
  const [debugVendors, setDebugVendors] = useState<any[]>([]);
  const [showDebugVendors, setShowDebugVendors] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [vendorsPayments, setVendorsPayments] = useState<{ [vendorId: string]: number }>({});

  useEffect(() => {
    if (!loading && role === 'vendor') {
      router.replace('/dashboard');
    }
  }, [role, loading, router]);

  useEffect(() => {
    fetchVendors();
    const unsubscribe = auth.onAuthStateChanged(user => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  async function fetchVendors() {
    setVendorsLoading(true);
    const accountsSnap = await getDocs(collection(db, "vendor_accounts"));
    const accounts = accountsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setVendors(accounts);
    setVendorsLoading(false);
    if (accounts.length > 0) {
      const fetchAllPayments = async () => {
        const paymentsSnap = await getDocs(collection(db, "payment_records"));
        const payments = paymentsSnap.docs.map(doc => doc.data());
        const paymentsByVendor: { [vendorId: string]: number } = {};
        payments.forEach((p: any) => {
          if (p.vendorCode) {
            paymentsByVendor[p.vendorCode] = (paymentsByVendor[p.vendorCode] || 0) + (Number(p.amount) || 0);
          }
        });
        setVendorsPayments(paymentsByVendor);
      };
      fetchAllPayments();
    }
  }

  async function fetchPlans() {
    const plansSnap = await getDocs(collection(db, "subscription_plans"));
    const plans = plansSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setPlans(plans);
  }

  function openModal() {
    setForm({});
    setSelectedPlan(null);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setShowPassword(false);
    setModalOpen(true);
    fetchPlans();
  }

  function closeModal() {
    setModalOpen(false);
    setForm({});
    setSelectedPlan(null);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setShowPassword(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((f: any) => ({ ...f, [name]: value }));
  }

  function handlePlanSelect(plan: any) {
    setSelectedPlan(plan);
  }

  function handleGeneratePassword() {
    const pwd = generatePassword();
    setPassword(pwd);
    setConfirmPassword(pwd);
    setShowPassword(true);
  }

  // Generate next vendorId in format M001, M002, ...
  async function generateNextVendorId() {
    const accountsSnap = await getDocs(collection(db, "vendor_accounts"));
    const ids = accountsSnap.docs
      .map(doc => doc.data().vendorCode)
      .filter(Boolean)
      .map((id: string) => parseInt(id.replace(/^M/, ""), 10))
      .filter(n => !isNaN(n));
    const nextNum = ids.length > 0 ? Math.max(...ids) + 1 : 1;
    return `M${String(nextNum).padStart(3, "0")}`;
  }

  async function handleAddVendor(e: React.FormEvent) {
    console.log('handleAddVendor called');
    e.preventDefault();
    setSaving(true);
    setError("");
    setDebugAddVendorError("");
    if (!selectedPlan) {
      setError("Please select a subscription plan.");
      setSaving(false);
      return;
    }
    if (!password || password !== confirmPassword) {
      setError("Passwords do not match.");
      setSaving(false);
      return;
    }
    try {
      // 1. Generate vendorCode
      const vendorCode = await generateNextVendorId();
      // 2. Call the API route to create the vendor (Admin SDK)
      const res = await fetch("/api/create-vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password,
          vendorData: {
            ...form,
            vendorCode,
            subscription: {
              plan: selectedPlan.name,
              monthlyFee: selectedPlan.price,
              features: selectedPlan.features,
              duration: selectedPlan.duration,
            },
            status: form.status || "Active",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error creating vendor");
      await fetchVendors();
      closeModal();
    } catch (err: any) {
      setError(err.message || "Error adding vendor");
      setDebugAddVendorError(JSON.stringify(err, Object.getOwnPropertyNames(err)));
      console.error("Add Vendor Error", err);
    } finally {
      setSaving(false);
    }
  }

  function openViewModal(vendor: any) {
    setViewVendor(vendor);
    setActiveTab('Details');
  }

  function closeViewModal() {
    setViewVendor(null);
  }

  function openEditModal(vendor: any) {
    setEditVendor(vendor);
    setForm({ ...vendor });
    // Find the matching plan from plans array
    const matchingPlan = plans.find(plan => plan.name === vendor.subscription?.plan);
    setSelectedPlan(matchingPlan || null);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setShowPassword(false);
    setModalOpen(true);
    fetchPlans();
  }

  async function handleEditVendor(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    if (!selectedPlan) {
      setError("Please select a subscription plan.");
      setSaving(false);
      return;
    }
    try {
      await updateDoc(doc(db, "vendor_accounts", editVendor.id), {
        ...form,
        subscription: {
          plan: selectedPlan.name,
          monthlyFee: selectedPlan.price,
          features: selectedPlan.features,
          duration: selectedPlan.duration,
        },
        status: form.status || "Active",
        updatedAt: new Date(),
      });
      await fetchVendors();
      setModalOpen(false);
      setEditVendor(null);
    } catch (err: any) {
      setError(err.message || "Error updating vendor");
    } finally {
      setSaving(false);
    }
  }

  // Fetch payments when Payments tab is active
  useEffect(() => {
    if (viewVendor && activeTab === "Payments") {
      fetchPayments(viewVendor.vendorCode);
    }
  }, [viewVendor, activeTab]);

  async function fetchPayments(vendorCode: string) {
    setPaymentsLoading(true);
    setPaymentsError("");
    try {
      const q = query(
        collection(db, "payment_records"),
        where("vendorCode", "==", vendorCode),
        orderBy("date", "desc")
      );
      const snap = await getDocs(q);
      const paymentsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPayments(paymentsData);
    } catch (err: any) {
      setPaymentsError("Failed to load payments: " + (err.message || err));
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    setAddingPayment(true);
    setPaymentsError("");
    try {
      await addDoc(collection(db, "payment_records"), {
        vendorCode: viewVendor.vendorCode,
        amount: Number(newPayment.amount),
        date: newPayment.date ? Timestamp.fromDate(new Date(newPayment.date)) : Timestamp.now(),
        notes: newPayment.notes,
        method: newPayment.method,
        period: newPayment.period || (newPayment.date ? newPayment.date.slice(0, 7) : new Date().toISOString().slice(0, 7)),
        status: newPayment.status,
        createdAt: Timestamp.now(),
      });
      setNewPayment({ amount: "", date: "", notes: "", method: "Bank Transfer", period: "", status: "paid" });
      setShowAddPaymentModal(false);
      fetchPayments(viewVendor.vendorCode);
    } catch (err: any) {
      setPaymentsError("Failed to add payment");
    } finally {
      setAddingPayment(false);
    }
  }

  function getNextPaymentDate() {
    if (!payments.length || !viewVendor?.subscription?.duration) return null;
    const last = payments[0];
    let lastDate = last.date;
    if (lastDate && lastDate.seconds) lastDate = new Date(lastDate.seconds * 1000);
    else lastDate = new Date(lastDate);
    let next = new Date(lastDate);
    const duration = viewVendor.subscription.duration?.toLowerCase();
    if (duration.startsWith("year")) next.setFullYear(next.getFullYear() + 1);
    else next.setMonth(next.getMonth() + 1);
    return next.toLocaleDateString();
  }

  function getTotalPaid() {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }

  function getPaymentStatus() {
    if (!payments.length) return { label: "Payment Required", color: "bg-yellow-100 text-yellow-700" };
    const nextDue = getNextPaymentDate();
    const today = new Date();
    const dueDate = nextDue ? new Date(nextDue) : null;
    if (dueDate && dueDate < today) return { label: "Overdue", color: "bg-red-100 text-red-700" };
    return { label: "Current", color: "bg-green-100 text-green-700" };
  }

  // When opening Add Payment modal, auto-fill amount and period
  function openAddPaymentModal() {
    let amount = viewVendor?.subscription?.monthlyFee || viewVendor?.subscription?.price || "";
    let duration = viewVendor?.subscription?.duration?.toLowerCase();
    let baseDate = payments[0]?.date;
    if (baseDate && baseDate.seconds) baseDate = new Date(baseDate.seconds * 1000);
    else if (baseDate) baseDate = new Date(baseDate);
    else baseDate = new Date();
    let nextDate = new Date(baseDate);
    if (duration?.startsWith("year")) nextDate.setFullYear(nextDate.getFullYear() + 1);
    else nextDate.setMonth(nextDate.getMonth() + 1);
    const period = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setNewPayment({
      amount: amount.toString(),
      date: nextDate.toISOString().slice(0, 10),
      notes: "",
      method: "Bank Transfer",
      period,
      status: "paid"
    });
    setShowAddPaymentModal(true);
  }

  async function handleDebugListVendors() {
    const accountsSnap = await getDocs(collection(db, "vendor_accounts"));
    setDebugVendors(accountsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    setShowDebugVendors(true);
  }

  if (loading || role === 'vendor') return null;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-1">Vendors</h1>
          <p className="text-neutral-500">Manage your platform vendors and subscriptions</p>
        </div>
        <button
          className="bg-primary-700 hover:bg-primary-800 text-white font-medium px-5 py-2 rounded-md text-sm shadow-sm transition-colors"
          onClick={openModal}
        >
          Add Vendor
        </button>
      </div>
      {/* Filters and search */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search vendors"
          className="border border-neutral-200 rounded-md px-3 py-2 text-sm w-56"
        />
        <select className="border border-neutral-200 rounded-md px-3 py-2 text-sm" defaultValue="">
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Admin">Admin</option>
        </select>
        <select className="border border-neutral-200 rounded-md px-3 py-2 text-sm" defaultValue="">
          <option value="">All Plans</option>
          <option value="pro">pro</option>
          <option value="Basic">Basic</option>
        </select>
      </div>
      {/* Card layout for mobile */}
      <div className="block sm:hidden">
        {vendorsLoading ? (
          <div className="text-center py-8 text-neutral-400">Loading...</div>
        ) : vendors.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">No vendors found.</div>
        ) : (
          vendors.map((v, i) => (
            <div key={i} className="bg-white rounded-xl shadow p-4 mb-3 border border-neutral-100">
              <div className="font-bold text-lg mb-1">{v.businessName || v.name || '-'}</div>
              <div className="text-xs text-neutral-500 mb-1">Vendor Code: {v.vendorCode || '-'}</div>
              <div className="text-sm text-neutral-500 mb-1">Contact: {v.contact || v.phone || '-'}</div>
              <div className="text-sm text-neutral-500 mb-1">Email: {v.email || '-'}</div>
              <div className="text-sm text-neutral-500 mb-1">Subscription: {v.subscriptionPlan || v.subscription?.plan || '-'}</div>
              <div className="text-sm text-neutral-500 mb-1">Monthly Fee: {
                vendorsPayments[v.id] !== undefined
                  ? `LKR ${vendorsPayments[v.id].toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : (typeof v.monthlyFee === "number" ? `LKR ${v.monthlyFee}` : v.subscription?.monthlyFee || "LKR 0")
              }</div>
              <div className="text-sm mb-2">
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${v.status === "Active" || v.subscription?.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {v.status || v.subscription?.status || "-"}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button className="px-3 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-xs font-medium transition-colors" onClick={() => openViewModal(v)}>View</button>
                <button className="px-3 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-100 hover:bg-yellow-100 text-xs font-medium transition-colors" onClick={() => openEditModal(v)}>Edit</button>
                <button className="px-3 py-1 rounded-md bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 text-xs font-medium transition-colors">-</button>
              </div>
            </div>
          ))
        )}
      </div>
      {/* Table for tablet/desktop */}
      <div className="hidden sm:block bg-white rounded-xl border border-neutral-100 shadow-sm overflow-x-auto">
        <table className="min-w-[700px] text-sm w-full">
          <thead>
            <tr className="text-neutral-500 text-xs uppercase">
              <th className="px-4 py-3 text-left">Vendor ID</th>
              <th className="px-4 py-3 text-left">Vendor Name</th>
              <th className="px-4 py-3 text-left">Contact</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Subscription</th>
              <th className="px-4 py-3 text-left">Monthly Fee</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendorsLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-neutral-400">Loading...</td>
              </tr>
            ) : vendors.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-neutral-400">No vendors found.</td>
              </tr>
            ) : (
              vendors.map((v, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-medium text-neutral-900">{v.vendorCode || '-'}</td>
                  <td className="px-4 py-3">{v.businessName || v.name || "-"}</td>
                  <td className="px-4 py-3">{v.contact || v.phone || "-"}</td>
                  <td className="px-4 py-3">{v.email || "-"}</td>
                  <td className="px-4 py-3">{v.subscriptionPlan || v.subscription?.plan || "-"}</td>
                  <td className="px-4 py-3">{
                    vendorsPayments[v.id] !== undefined
                      ? `LKR ${vendorsPayments[v.id].toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : (typeof v.monthlyFee === "number" ? `LKR ${v.monthlyFee}` : v.subscription?.monthlyFee || "LKR 0")
                  }</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${v.status === "Active" || v.subscription?.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {v.status || v.subscription?.status || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button className="px-3 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-xs font-medium transition-colors" onClick={() => openViewModal(v)}>View</button>
                    <button className="px-3 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-100 hover:bg-yellow-100 text-xs font-medium transition-colors" onClick={() => openEditModal(v)}>Edit</button>
                    <button className="px-3 py-1 rounded-md bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 text-xs font-medium transition-colors">-</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Add Vendor Modal */}
      {modalOpen && !editVendor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl relative flex flex-col max-h-[90vh]">
            {/* Sticky Header */}
            <div className="bg-primary-700 rounded-t-2xl px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="text-lg font-bold text-white">Add New Vendor</div>
              <button className="text-white text-2xl" onClick={closeModal} aria-label="Close">&times;</button>
            </div>
            {/* Scrollable Content */}
            <form className="flex-1 overflow-y-auto p-6 space-y-8" onSubmit={handleAddVendor}>
              {/* Business Info */}
              <section>
                <div className="font-semibold text-neutral-900 mb-3 text-base">Business Information</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                  <input name="businessName" required placeholder="e.g., Beauty Palace" className="border border-neutral-200 rounded-md px-3 py-2" value={form.businessName || ""} onChange={handleChange} />
                  <input name="businessType" required placeholder="Cosmetics Store" className="border border-neutral-200 rounded-md px-3 py-2" value={form.businessType || ""} onChange={handleChange} />
                </div>
                <textarea name="businessDescription" placeholder="Brief description of your business..." className="border border-neutral-200 rounded-md px-3 py-2 w-full min-h-[60px]" value={form.businessDescription || ""} onChange={handleChange} />
              </section>
              {/* Contact Info */}
              <section>
                <div className="font-semibold text-neutral-900 mb-3 text-base">Contact Information</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                  <input name="email" type="email" required placeholder="vendor@example.com" className="border border-neutral-200 rounded-md px-3 py-2" value={form.email || ""} onChange={handleChange} />
                  <input name="phone" required placeholder="+94 77 123 4567" className="border border-neutral-200 rounded-md px-3 py-2" value={form.phone || ""} onChange={handleChange} />
                </div>
                <input name="address" required placeholder="123 Main Street, Colombo" className="border border-neutral-200 rounded-md px-3 py-2 w-full mb-3" value={form.address || ""} onChange={handleChange} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input name="city" placeholder="Colombo" className="border border-neutral-200 rounded-md px-3 py-2" value={form.city || ""} onChange={handleChange} />
                  <input name="postalCode" placeholder="00100" className="border border-neutral-200 rounded-md px-3 py-2" value={form.postalCode || ""} onChange={handleChange} />
                </div>
              </section>
              {/* Auth Setup */}
              <section className="bg-blue-50 rounded-lg p-4">
                <div className="font-semibold text-neutral-900 mb-2">🔒 Firebase Authentication Setup</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                  <input name="password" type={showPassword ? "text" : "password"} required placeholder="Enter password" className="border border-neutral-200 rounded-md px-3 py-2" value={password} onChange={e => setPassword(e.target.value)} />
                  <input name="confirmPassword" type={showPassword ? "text" : "password"} required placeholder="Confirm password" className="border border-neutral-200 rounded-md px-3 py-2" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
                <button type="button" className="text-primary-700 font-medium mb-2" onClick={handleGeneratePassword}>Generate Easy Password (Word@Numbers)</button>
                <div className="text-xs text-neutral-600 mb-2">Password format: <b>Word@Numbers</b> (e.g., Parrot@2323, Galaxy@7283)</div>
                {showPassword && (
                  <div className="bg-white border border-neutral-200 rounded px-3 py-2 text-sm mb-2">Password: <b>{password}</b></div>
                )}
              </section>
              {/* Subscription Plan */}
              <section>
                <div className="font-semibold text-neutral-900 mb-3 text-base">Subscription Plan</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plans.map((plan: any) => (
                    <label key={plan.id} className={`border rounded-lg p-4 cursor-pointer transition-colors flex flex-col gap-1 ${selectedPlan?.id === plan.id ? "border-primary-700 bg-primary-50" : "border-neutral-200 bg-white"}`}>
                      <input
                        type="radio"
                        name="subscriptionPlan"
                        className="mr-2 mb-2"
                        checked={selectedPlan?.id === plan.id}
                        onChange={() => handlePlanSelect(plan)}
                      />
                      <div className="font-bold text-lg mb-1">{plan.name}</div>
                      <div className="text-primary-700 font-bold mb-1">{formatPrice(plan.price, plan.duration)}</div>
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
              {/* Business Info, Contact Info, Auth Setup, Subscription Plan, Error */}
              {error && <div className="text-red-500 text-sm text-center">{error}</div>}
              {debugAddVendorError && <div className="text-red-700 text-xs bg-red-50 rounded p-2 mt-2">Debug: {debugAddVendorError}</div>}
              {/* Fixed Action Bar (moved inside form) */}
              <div className="flex justify-end gap-2 px-6 pb-6 pt-4 bg-white rounded-b-2xl sticky bottom-0 z-20">
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
                  className="px-6 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-sm font-medium shadow-sm disabled:opacity-50"
                  disabled={saving}
                  onClick={() => console.log('Submit button clicked')}
                >
                  {saving ? "Creating..." : "Create Vendor Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* View Vendor Modal */}
      {viewVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl relative flex flex-col max-h-[90vh]">
            {/* Sticky Header */}
            <div className="bg-primary-700 rounded-t-2xl px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <div className="text-lg font-bold text-white">{viewVendor.vendorCode ? `${viewVendor.vendorCode} — ` : ''}{viewVendor.businessName || viewVendor.name}</div>
                <div className="text-sm text-white/80">Vendor Account Management</div>
              </div>
              <button className="text-white text-2xl" onClick={closeViewModal} aria-label="Close">&times;</button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-neutral-200 bg-white sticky top-[56px] z-10">
              {['Details', 'Payments', 'Subscription', 'Notifications'].map(tab => (
                <button
                  key={tab}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-primary-700 text-primary-700 bg-white' : 'border-transparent text-neutral-500 hover:text-primary-700'}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-neutral-50">
              {activeTab === 'Details' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-lg p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="font-semibold mb-2">Business Information</div>
                      <div className="mb-1 text-sm text-neutral-700">Business Name</div>
                      <div className="mb-2 text-base">{viewVendor.businessName || '-'}</div>
                      <div className="mb-1 text-sm text-neutral-700">Description</div>
                      <div className="mb-2 text-base">{viewVendor.businessDescription || '-'}</div>
                    </div>
                    <div>
                      <div className="font-semibold mb-2">Business Type</div>
                      <div className="mb-2 text-base">{viewVendor.businessType || '-'}</div>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="font-semibold mb-2">Contact Information</div>
                      <div className="mb-1 text-sm text-neutral-700">Email</div>
                      <div className="mb-2 text-base">{viewVendor.email || '-'}</div>
                      <div className="mb-1 text-sm text-neutral-700">Address</div>
                      <div className="mb-2 text-base">{viewVendor.address || '-'}</div>
                      <div className="mb-1 text-sm text-neutral-700">City</div>
                      <div className="mb-2 text-base">{viewVendor.city || '-'}</div>
                    </div>
                    <div>
                      <div className="font-semibold mb-2">Phone</div>
                      <div className="mb-2 text-base">{viewVendor.phone || '-'}</div>
                      <div className="mb-1 text-sm text-neutral-700">Postal Code</div>
                      <div className="mb-2 text-base">{viewVendor.postalCode || '-'}</div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'Payments' && (
                <div className="space-y-6">
                  {/* Payment Status Summary */}
                  <div className="bg-white rounded-lg p-6 shadow-sm mb-4 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Status</div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getPaymentStatus().color}`}>{getPaymentStatus().label}</span>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Last Payment</div>
                      <div className="font-bold text-lg">{payments[0] ? formatDate(payments[0].date) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Next Due</div>
                      <div className="font-bold text-lg">{getNextPaymentDate() || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Total Paid</div>
                      <div className="font-bold text-lg">LKR {getTotalPaid().toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                  {/* Record Payment & Actions */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
                    <div className="font-semibold text-base">Record Payment</div>
                    <div className="flex gap-2">
                      <button className="bg-primary-700 hover:bg-primary-800 text-white font-medium px-4 py-2 rounded-md text-sm" onClick={openAddPaymentModal}>Add Payment</button>
                      <button className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium px-4 py-2 rounded-md text-sm" onClick={() => { /* TODO: Export CSV */ }}>Export CSV</button>
                    </div>
                  </div>
                  {/* Search Payments */}
                  <div className="mb-2">
                    <input type="text" placeholder="Search payments..." className="border border-neutral-200 rounded-md px-3 py-2 w-full md:w-1/3" value={searchPayment} onChange={e => setSearchPayment(e.target.value)} />
                  </div>
                  {/* Payments Table */}
                  {paymentsError && (
                    <div className="bg-red-100 text-red-700 rounded p-2 mb-2 text-sm font-medium">{paymentsError}</div>
                  )}
                  <div className="bg-white rounded-lg p-0 shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-neutral-500 text-xs uppercase">
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Amount</th>
                          <th className="px-4 py-3 text-left">Method</th>
                          <th className="px-4 py-3 text-left">Period</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(payments.filter(p =>
                          !searchPayment ||
                          formatDate(p.date).toLowerCase().includes(searchPayment.toLowerCase()) ||
                          String(p.amount).includes(searchPayment) ||
                          (p.method || "").toLowerCase().includes(searchPayment.toLowerCase()) ||
                          (p.period || "").toLowerCase().includes(searchPayment.toLowerCase())
                        )).map((p) => (
                          <tr key={p.id} className="border-t border-neutral-100">
                            <td className="px-4 py-3">{formatDate(p.date)}</td>
                            <td className="px-4 py-3">LKR {Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3">{p.method || '-'}</td>
                            <td className="px-4 py-3">{p.period || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.status || '-'}</span>
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              <button className="text-blue-700 hover:underline text-xs">Edit</button>
                              <button className="text-red-700 hover:underline text-xs">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Add Payment Modal */}
                  {showAddPaymentModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative flex flex-col max-h-[90vh]">
                        <div className="bg-primary-700 rounded-t-2xl px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                          <div className="text-lg font-bold text-white">Add Payment</div>
                          <button className="text-white text-2xl" onClick={() => setShowAddPaymentModal(false)} aria-label="Close">&times;</button>
                        </div>
                        <form className="flex-1 overflow-y-auto p-6 space-y-6" onSubmit={handleAddPayment}>
                          <input type="number" required min={0} placeholder="Amount (LKR)" className="border border-neutral-200 rounded-md px-3 py-2 w-full" value={newPayment.amount} onChange={e => setNewPayment(n => ({ ...n, amount: e.target.value }))} />
                          <input type="date" required className="border border-neutral-200 rounded-md px-3 py-2 w-full" value={newPayment.date} onChange={e => setNewPayment(n => ({ ...n, date: e.target.value }))} />
                          <input type="text" placeholder="Notes (optional)" className="border border-neutral-200 rounded-md px-3 py-2 w-full" value={newPayment.notes} onChange={e => setNewPayment(n => ({ ...n, notes: e.target.value }))} />
                          <select className="border border-neutral-200 rounded-md px-3 py-2 w-full" value={newPayment.method} onChange={e => setNewPayment(n => ({ ...n, method: e.target.value }))}>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cash">Cash</option>
                            <option value="Card">Card</option>
                          </select>
                          <input type="text" placeholder="Period (e.g. 2025-06)" className="border border-neutral-200 rounded-md px-3 py-2 w-full" value={newPayment.period} onChange={e => setNewPayment(n => ({ ...n, period: e.target.value }))} />
                          <select className="border border-neutral-200 rounded-md px-3 py-2 w-full" value={newPayment.status} onChange={e => setNewPayment(n => ({ ...n, status: e.target.value }))}>
                            <option value="paid">Paid</option>
                            <option value="pending">Pending</option>
                          </select>
                          <div className="flex justify-end gap-2">
                            <button type="button" className="px-4 py-2 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 text-sm" onClick={() => setShowAddPaymentModal(false)} disabled={addingPayment}>Cancel</button>
                            <button type="submit" className="px-6 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-sm font-medium shadow-sm disabled:opacity-50" disabled={addingPayment}>{addingPayment ? "Saving..." : "Add Payment"}</button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Other tabs can be filled in as needed */}
            </div>
          </div>
        </div>
      )}
      {/* Edit Vendor Modal (same as Add, but pre-filled and on submit updates) */}
      {editVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl relative flex flex-col max-h-[90vh]">
            <div className="bg-primary-700 rounded-t-2xl px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="text-lg font-bold text-white">Edit Vendor</div>
              <button className="text-white text-2xl" onClick={() => setEditVendor(null)} aria-label="Close">&times;</button>
            </div>
            <form className="flex-1 overflow-y-auto p-6 space-y-10" onSubmit={handleEditVendor} id="vendor-form-edit">
              {/* Business Info */}
              <div className="bg-white rounded-lg p-6 shadow-sm border border-neutral-200 mb-6">
                <div className="font-semibold mb-6 text-lg">Business Information</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <label className="block mb-1 text-sm text-neutral-700">Business Name</label>
                    <input type="text" className="w-full border border-neutral-300 bg-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-primary-700 transition" value={form.businessName || ''} onChange={e => setForm((f: any) => ({ ...f, businessName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm text-neutral-700">Business Type</label>
                    <input type="text" className="w-full border border-neutral-300 bg-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-primary-700 transition" value={form.businessType || ''} onChange={e => setForm((f: any) => ({ ...f, businessType: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block mb-1 text-sm text-neutral-700">Description</label>
                    <textarea className="w-full border border-neutral-300 bg-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-primary-700 transition" value={form.businessDescription || ''} onChange={e => setForm((f: any) => ({ ...f, businessDescription: e.target.value }))} />
                  </div>
                </div>
              </div>
              {/* Contact Info */}
              <div className="bg-white rounded-lg p-6 shadow-sm border border-neutral-200 mb-6">
                <div className="font-semibold mb-6 text-lg">Contact Information</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <label className="block mb-1 text-sm text-neutral-700">Email</label>
                    <input type="email" className="w-full border border-neutral-300 bg-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-primary-700 transition" value={form.email || ''} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm text-neutral-700">Phone</label>
                    <input type="text" className="w-full border border-neutral-300 bg-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-primary-700 transition" value={form.phone || ''} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm text-neutral-700">Address</label>
                    <input type="text" className="w-full border border-neutral-300 bg-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-primary-700 transition" value={form.address || ''} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm text-neutral-700">City</label>
                    <input type="text" className="w-full border border-neutral-300 bg-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-primary-700 transition" value={form.city || ''} onChange={e => setForm((f: any) => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm text-neutral-700">Postal Code</label>
                    <input type="text" className="w-full border border-neutral-300 bg-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-primary-700 transition" value={form.postalCode || ''} onChange={e => setForm((f: any) => ({ ...f, postalCode: e.target.value }))} />
                  </div>
                </div>
              </div>
              {/* Subscription Plan */}
              <div className="bg-white rounded-lg p-6 shadow-sm border border-neutral-200 mb-6">
                <div className="font-semibold mb-6 text-lg">Subscription Plan</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {plans.map((plan: any) => (
                    <label key={plan.id} className={`flex items-center p-4 border rounded-lg cursor-pointer transition ${selectedPlan && selectedPlan.id === plan.id ? 'border-primary-700 bg-primary-50' : 'border-neutral-200 bg-white hover:border-primary-300'}`}>
                      <input
                        type="radio"
                        name="subscriptionPlan"
                        className="form-radio h-5 w-5 text-primary-700 mr-4"
                        checked={selectedPlan && selectedPlan.id === plan.id}
                        onChange={() => setSelectedPlan(plan)}
                      />
                      <div>
                        <div className="font-semibold text-base">{plan.name}</div>
                        <div className="text-sm text-neutral-600">LKR {plan.price?.toLocaleString()} / {plan.duration || 'mo'}</div>
                        <ul className="list-disc ml-5 text-xs text-neutral-500 mt-1">
                          {plan.features?.map((f: string, i: number) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedPlan && (
                  <div className="mt-2 text-xs text-neutral-500">Current: {form.subscription?.plan || '-'}</div>
                )}
              </div>
              {error && <div className="text-red-500 text-sm text-center">{error}</div>}
            </form>
            <div className="flex justify-end gap-2 px-6 pb-6 pt-4 bg-white rounded-b-2xl sticky bottom-0 z-20">
              <button
                type="button"
                className="px-4 py-2 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 text-sm"
                onClick={() => setEditVendor(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="vendor-form-edit"
                className="px-6 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-sm font-medium shadow-sm disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 