"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, DocumentData, Timestamp, query, where, orderBy, setDoc, getDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUser } from '@/components/useUser';
import { useRouter } from 'next/navigation';
import Container from "@/components/Container";

function formatDate(ts: any) {
  if (!ts) return '-';
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return date.toLocaleDateString();
}

function formatDateDDMMMYYYY(date: Date) {
  if (!date) return '-';
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatPrice(price: number, duration: string) {
  return `Rs ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${duration?.toLowerCase().startsWith("year") ? "yr" : "mo"}`;
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
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [showBannerSettings, setShowBannerSettings] = useState(false);

  // New state for payment-based account management
  const [adminBanners, setAdminBanners] = useState<{
    paymentNotification: boolean;
    accountDisableWarning: boolean;
    bannerMessage: string;
  }>({
    paymentNotification: true,
    accountDisableWarning: true,
    bannerMessage: "Payment due. Account will be disabled if payment is not received."
  });

  // Load admin banner settings
  useEffect(() => {
    const loadAdminBanners = async () => {
      try {
        const bannerDoc = await getDoc(doc(db, 'admin_settings', 'banners'));
        if (bannerDoc.exists()) {
          setAdminBanners(bannerDoc.data() as any);
        }
      } catch (error) {
        console.error('Error loading admin banners:', error);
      }
    };
    loadAdminBanners();
  }, []);

  // Save admin banner settings
  const saveAdminBanners = async (settings: any) => {
    try {
      await setDoc(doc(db, 'admin_settings', 'banners'), settings);
      setAdminBanners(settings);
    } catch (error) {
      console.error('Error saving admin banners:', error);
    }
  };

  // Check payment status and update account status
  const checkPaymentStatus = async (vendor: any) => {
    if (!vendor.vendorCode) return;

    try {
      const paymentsQuery = query(
        collection(db, "payment_records"),
        where("vendorCode", "==", vendor.vendorCode),
        orderBy("date", "desc"),
        limit(1)
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      
      if (paymentsSnap.empty) {
        // No payments found - set to inactive
        await updateDoc(doc(db, "vendor_accounts", vendor.id), {
          status: "Inactive",
          lastPaymentCheck: Timestamp.now(),
        });

        // Send payment notification if enabled
        if (adminBanners.paymentNotification) {
          await addDoc(collection(db, "notifications"), {
            recipientType: "vendor",
            recipientId: vendor.id,
            type: "payment_required",
            message: "Your account is inactive due to missing payment. Please contact support to reactivate your account.",
            createdAt: Timestamp.now(),
            read: false,
          });
        }
      } else {
        const lastPayment = paymentsSnap.docs[0].data();
        const lastPaymentDate = lastPayment.date?.toDate ? lastPayment.date.toDate() : new Date(lastPayment.date);
        const today = new Date();
        const daysSincePayment = Math.floor((today.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // If more than 30 days since last payment, set to inactive
        if (daysSincePayment > 30) {
          await updateDoc(doc(db, "vendor_accounts", vendor.id), {
            status: "Inactive",
            lastPaymentCheck: Timestamp.now(),
          });

          // Send payment notification if enabled
          if (adminBanners.paymentNotification) {
            await addDoc(collection(db, "notifications"), {
              recipientType: "vendor",
              recipientId: vendor.id,
              type: "payment_overdue",
              message: `Your account has been deactivated due to overdue payment (${daysSincePayment} days overdue). Please make payment to reactivate.`,
              createdAt: Timestamp.now(),
              read: false,
            });
          }
        } else {
          // Payment is current - set to active
          await updateDoc(doc(db, "vendor_accounts", vendor.id), {
            status: "Active",
            lastPaymentCheck: Timestamp.now(),
          });
        }
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
    }
  };

  // Manual account activation/deactivation
  const toggleAccountStatus = async (vendor: any, newStatus: 'Active' | 'Inactive') => {
    try {
      await updateDoc(doc(db, "vendor_accounts", vendor.id), {
        status: newStatus,
        manuallyUpdated: true,
        updatedAt: Timestamp.now(),
      });

      // Send notification about status change
      await addDoc(collection(db, "notifications"), {
        recipientType: "vendor",
        recipientId: vendor.id,
        type: "account_status_change",
        message: `Your account has been ${newStatus.toLowerCase()} by the administrator.`,
        createdAt: Timestamp.now(),
        read: false,
      });

      // Update local state immediately
      setViewVendor((prev: any) => prev ? { ...prev, status: newStatus } : null);
      setVendors((prev: any[]) => prev.map(v => v.id === vendor.id ? { ...v, status: newStatus } : v));
    } catch (error) {
      console.error('Error updating account status:', error);
    }
  };

  // Send payment reminder notification
  const sendPaymentReminder = async (vendor: any) => {
    try {
      await addDoc(collection(db, "notifications"), {
        recipientType: "vendor",
        recipientId: vendor.id,
        type: "payment_reminder",
        message: "Payment reminder: Your subscription payment is due. Please make payment to avoid account deactivation.",
        createdAt: Timestamp.now(),
        read: false,
      });
    } catch (error) {
      console.error('Error sending payment reminder:', error);
    }
  };

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
        const payments = paymentsSnap.docs.map(doc => doc.data()).sort((a, b) => {
          // Sort by date, most recent first
          const dateA = a.date?.seconds ? a.date.seconds : 0;
          const dateB = b.date?.seconds ? b.date.seconds : 0;
          return dateB - dateA;
        });
        const paymentsByVendor: { [vendorId: string]: number } = {};
        payments.forEach((p: any) => {
          if (p.vendorCode) {
            paymentsByVendor[p.vendorCode] = (paymentsByVendor[p.vendorCode] || 0) + (Number(p.amount) || 0);
          }
        });
        setVendorsPayments(paymentsByVendor);
        setAllPayments(payments); // Store all payments for next payment date calculation
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
      // Check if subscription plan has changed
      const oldPlan = editVendor.subscription?.plan;
      const newPlan = selectedPlan.name;
      const subscriptionChanged = oldPlan !== newPlan;

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

      // Create notification if subscription plan changed
      if (subscriptionChanged) {
        await addDoc(collection(db, "notifications"), {
          recipientType: "vendor",
          recipientId: editVendor.id,
          type: "subscription_change",
          message: `Your subscription plan has been changed from ${oldPlan || 'No Plan'} to ${newPlan}. New monthly fee: Rs ${selectedPlan.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
          createdAt: Timestamp.now(),
          read: false,
        });
      }

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

      // Create notification for payment
      await addDoc(collection(db, "notifications"), {
        recipientType: "vendor",
        recipientId: viewVendor.id,
        type: "subscription_payment",
        message: `Payment of Rs ${Number(newPayment.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been recorded for ${newPayment.period || 'your subscription'}. Payment method: ${newPayment.method}.`,
        createdAt: Timestamp.now(),
        read: false,
      });

      setNewPayment({ amount: "", date: "", notes: "", method: "Bank Transfer", period: "", status: "paid" });
      setShowAddPaymentModal(false);
      fetchPayments(viewVendor.vendorCode);
      // Also refresh all payments to update the main table
      await fetchVendors();
    } catch (err: any) {
      setPaymentsError("Failed to add payment");
    } finally {
      setAddingPayment(false);
    }
  }

  function getTotalPaid() {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
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

  const defaultBannerMessage = "Your account payment is overdue. Please pay to avoid deactivation.";

  const sendWarningBanner = async (vendor: any) => {
    try {
      await updateDoc(doc(db, "vendor_accounts", vendor.id), {
        warningBanner: defaultBannerMessage,
      });
      // Update local state immediately
      setViewVendor((prev: any) => prev ? { ...prev, warningBanner: defaultBannerMessage } : null);
      setVendors((prev: any[]) => prev.map(v => v.id === vendor.id ? { ...v, warningBanner: defaultBannerMessage } : v));
    } catch (error) {
      console.error("Error sending warning banner:", error);
    }
  };

  const removeWarningBanner = async (vendor: any) => {
    try {
      await updateDoc(doc(db, "vendor_accounts", vendor.id), {
        warningBanner: "",
      });
      // Update local state immediately
      setViewVendor((prev: any) => prev ? { ...prev, warningBanner: "" } : null);
      setVendors((prev: any[]) => prev.map(v => v.id === vendor.id ? { ...v, warningBanner: "" } : v));
    } catch (error) {
      console.error("Error removing warning banner:", error);
    }
  };

  const togglePaymentReminders = async (vendor: any) => {
    try {
      const newValue = !vendor.paymentRemindersEnabled;
      await updateDoc(doc(db, "vendor_accounts", vendor.id), {
        paymentRemindersEnabled: newValue,
      });
      // Update local state immediately
      setViewVendor((prev: any) => prev ? { ...prev, paymentRemindersEnabled: newValue } : null);
      setVendors((prev: any[]) => prev.map(v => v.id === vendor.id ? { ...v, paymentRemindersEnabled: newValue } : v));
    } catch (error) {
      console.error("Error toggling payment reminders:", error);
    }
  };

  // Automatic payment date calculation functions
  const calculateNextPaymentDate = (lastPaymentDate: any, subscriptionDuration: string) => {
    if (!lastPaymentDate) return null;
    
    let date = new Date(lastPaymentDate.seconds * 1000);
    const duration = subscriptionDuration?.toLowerCase();
    
    if (duration?.startsWith("year")) {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    
    return date;
  };

  const calculatePaymentDueDate = (subscriptionStartDate: any, subscriptionDuration: string) => {
    if (!subscriptionStartDate) return null;
    
    let date = new Date(subscriptionStartDate.seconds * 1000);
    const duration = subscriptionDuration?.toLowerCase();
    
    if (duration?.startsWith("year")) {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    
    return date;
  };

  const getPaymentStatus = () => {
    if (!viewVendor || !payments.length) return { label: 'No Payments', color: 'bg-red-100 text-red-800' };
    
    const lastPayment = payments[0];
    const lastPaymentDate = new Date(lastPayment.date.seconds * 1000);
    const daysSincePayment = Math.floor((Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate next payment date based on subscription duration
    const nextPaymentDate = calculateNextPaymentDate(lastPayment.date, viewVendor.subscription?.duration);
    const daysUntilNextPayment = nextPaymentDate ? Math.floor((nextPaymentDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    
    if (daysSincePayment > 30) {
      return { label: 'Overdue', color: 'bg-red-100 text-red-800' };
    } else if (daysUntilNextPayment <= 7) {
      return { label: 'Due Soon', color: 'bg-yellow-100 text-yellow-800' };
    } else {
      return { label: 'Current', color: 'bg-green-100 text-green-800' };
    }
  };

  const getNextPaymentDate = () => {
    if (!payments.length || !viewVendor?.subscription?.duration) return null;
    const last = payments[0];
    const nextDate = calculateNextPaymentDate(last.date, viewVendor.subscription.duration);
    return nextDate ? formatDateDDMMMYYYY(nextDate) : null;
  };

  // Get next payment date for a specific vendor
  const getVendorNextPaymentDate = (vendor: any) => {
    // Get payments for this specific vendor from allPayments
    const vendorPayments = allPayments.filter(p => p.vendorCode === vendor.vendorCode);
    
    if (vendorPayments.length > 0 && vendor.subscription?.duration) {
      // Use the same logic as the modal - calculate based on last payment
      const lastPayment = vendorPayments[0]; // Most recent payment
      const nextDate = calculateNextPaymentDate(lastPayment.date, vendor.subscription.duration);
      return nextDate ? formatDateDDMMMYYYY(nextDate) : '-';
    } else if (vendor.subscription?.startDate) {
      // Fallback to subscription start date if no payments
      const nextDate = calculatePaymentDueDate(vendor.subscription.startDate, vendor.subscription.duration);
      return nextDate ? formatDateDDMMMYYYY(nextDate) : '-';
    }
    return '-';
  };

  // Get comprehensive status for vendor based on all toggle states
  const getVendorStatus = (vendor: any) => {
    const statuses = [];
    
    // Account Status
    if (vendor.status === 'Active') {
      statuses.push('Active');
    } else if (vendor.status === 'Inactive') {
      statuses.push('Inactive');
    }
    
    // Warning Banner Status
    if (vendor.warningBanner) {
      statuses.push('Warning');
    }
    
    // Payment Reminders Status
    if (vendor.paymentRemindersEnabled) {
      statuses.push('Reminders');
    }
    
    // Return the most important status first
    if (statuses.includes('Inactive')) {
      return { label: 'Inactive', color: 'bg-red-100 text-red-700' };
    } else if (statuses.includes('Warning')) {
      return { label: 'Warning', color: 'bg-yellow-100 text-yellow-700' };
    } else if (statuses.includes('Active')) {
      return { label: 'Active', color: 'bg-green-100 text-green-700' };
    } else if (statuses.includes('Reminders')) {
      return { label: 'Reminders', color: 'bg-blue-100 text-blue-700' };
    } else {
      return { label: 'Unknown', color: 'bg-gray-100 text-gray-700' };
    }
  };

  if (loading || role === 'vendor') return null;

  return (
    <Container>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800">Vendors</h1>
          <p className="text-neutral-500">Manage your platform vendors and subscriptions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBannerSettings(true)}
            className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors border border-neutral-200"
          >
            Banner Settings
          </button>
          <button
            className="bg-primary-700 hover:bg-primary-800 text-white font-medium px-5 py-2 rounded-md text-sm shadow-sm transition-colors"
            onClick={openModal}
          >
            Add Vendor
          </button>
        </div>
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
              <div className="text-sm text-neutral-500 mb-1">Next Payment: {getVendorNextPaymentDate(v)}</div>
              <div className="text-sm mb-2">
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${getVendorStatus(v).color}`}>
                  {getVendorStatus(v).label}
                </span>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button className="px-3 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-xs font-medium transition-colors" onClick={() => openViewModal(v)}>View</button>
                <button className="px-3 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-100 hover:bg-yellow-100 text-xs font-medium transition-colors" onClick={() => openEditModal(v)}>Edit</button>
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
              <th className="px-4 py-3 text-left">Next Payment Date</th>
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
                  <td className="px-4 py-3">
                    {getVendorNextPaymentDate(v) || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${getVendorStatus(v).color}`}>
                      {getVendorStatus(v).label}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button className="px-3 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-xs font-medium transition-colors" onClick={() => openViewModal(v)}>View</button>
                    <button className="px-3 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-100 hover:bg-yellow-100 text-xs font-medium transition-colors" onClick={() => openEditModal(v)}>Edit</button>
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
                      <div className="font-bold text-lg">{payments[0] ? formatDateDDMMMYYYY(new Date(payments[0].date.seconds * 1000)) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Next Due</div>
                      <div className="font-bold text-lg">{getNextPaymentDate() || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Total Paid</div>
                      <div className="font-bold text-lg lato-regular">Rs {getTotalPaid().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>

                  {/* Record Payment Section */}
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="font-semibold text-base">Record Payment</div>
                      <div className="flex gap-2">
                        <button
                          onClick={openAddPaymentModal}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                        >
                          Add Payment
                        </button>
                        <button
                          onClick={() => {/* Export functionality */}}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>
                    
                    {/* Search Payments */}
                    <div className="mb-4">
                      <input
                        type="text"
                        placeholder="Search payments..."
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>

                    {/* Payments Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-neutral-200">
                        <thead className="bg-neutral-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Method</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Period</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-neutral-200">
                          {payments.map((p) => (
                            <tr key={p.id} className="border-t border-neutral-100">
                              <td className="px-4 py-3">{formatDateDDMMMYYYY(new Date(p.date.seconds * 1000))}</td>
                              <td className="px-4 py-3 lato-regular">Rs {Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="px-4 py-3">{p.method || '-'}</td>
                              <td className="px-4 py-3">{p.period || '-'}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  {p.status || 'paid'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  <button className="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                                  <button className="text-red-600 hover:text-red-800 text-sm">Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'Notifications' && (
                <div className="space-y-6">
                  {/* Account Management Actions */}
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <div className="font-semibold text-base mb-4">Account Management</div>
                    <div className="space-y-4">
                      {/* Account Status Toggle */}
                      <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-neutral-900">Account Status</div>
                          <div className="text-sm text-neutral-600">
                            {viewVendor.status === 'Active' ? 'Account is currently active' : 'Account is currently inactive'}
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={viewVendor.status === 'Active'}
                            onChange={() => toggleAccountStatus(viewVendor, viewVendor.status === 'Active' ? 'Inactive' : 'Active')}
                          />
                          <div className="relative w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                      </div>

                      {/* Payment Reminder Toggle */}
                      <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-neutral-900">Payment Reminders</div>
                          <div className="text-sm text-neutral-600">Automatically send payment notifications</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={viewVendor.paymentRemindersEnabled || false}
                            onChange={() => togglePaymentReminders(viewVendor)}
                          />
                          <div className="relative w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>

                      {/* Warning Banner Toggle */}
                      <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-neutral-900">Warning Banner</div>
                          <div className="text-sm text-neutral-600">
                            {viewVendor.warningBanner ? 'Banner is currently active' : 'No warning banner displayed'}
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={!!viewVendor.warningBanner}
                            onChange={() => viewVendor.warningBanner ? removeWarningBanner(viewVendor) : sendWarningBanner(viewVendor)}
                          />
                          <div className="relative w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Notification History */}
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <div className="font-semibold text-base mb-4">Notification History</div>
                    <div className="text-sm text-neutral-500">
                      Notifications sent to this vendor will appear here.
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'Subscription' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <div className="font-semibold text-base mb-4">Subscription Details</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <div className="text-sm text-neutral-500 mb-1">Current Plan</div>
                        <div className="font-bold text-lg">{viewVendor.subscription?.plan || 'No Plan'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-neutral-500 mb-1">Monthly Fee</div>
                        <div className="font-bold text-lg lato-regular">Rs {viewVendor.subscription?.monthlyFee?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-neutral-500 mb-1">Duration</div>
                        <div className="font-bold text-lg">{viewVendor.subscription?.duration || 'Monthly'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-neutral-500 mb-1">Status</div>
                        <div className="font-bold text-lg">{viewVendor.subscription?.status || viewVendor.status || 'Active'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                        <div className="text-sm text-neutral-600">Rs {plan.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {plan.duration || 'mo'}</div>
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

      {/* Banner Settings Modal */}
      {showBannerSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl relative flex flex-col max-h-[90vh]">
            <div className="bg-primary-700 rounded-t-2xl px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="text-lg font-bold text-white">Banner Settings</div>
              <button className="text-white text-2xl" onClick={() => setShowBannerSettings(false)} aria-label="Close">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                  <div>
                    <h3 className="font-semibold text-neutral-900">Payment Notifications</h3>
                    <p className="text-sm text-neutral-600">Send automatic payment notifications to vendors</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminBanners.paymentNotification}
                      onChange={(e) => setAdminBanners(prev => ({ ...prev, paymentNotification: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                  <div>
                    <h3 className="font-semibold text-neutral-900">Account Disable Warning</h3>
                    <p className="text-sm text-neutral-600">Show warning banners to vendors about account deactivation</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminBanners.accountDisableWarning}
                      onChange={(e) => setAdminBanners(prev => ({ ...prev, accountDisableWarning: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Banner Message
                  </label>
                  <textarea
                    value={adminBanners.bannerMessage}
                    onChange={(e) => setAdminBanners(prev => ({ ...prev, bannerMessage: e.target.value }))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    rows={3}
                    placeholder="Enter banner message for vendors..."
                  />
                  <p className="text-xs text-neutral-500 mt-1">This message will be displayed to vendors on their dashboard</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-6 pt-4 bg-white rounded-b-2xl sticky bottom-0 z-20">
              <button
                type="button"
                className="px-4 py-2 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 text-sm"
                onClick={() => setShowBannerSettings(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-6 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-sm font-medium shadow-sm"
                onClick={() => {
                  saveAdminBanners(adminBanners);
                  setShowBannerSettings(false);
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
} 