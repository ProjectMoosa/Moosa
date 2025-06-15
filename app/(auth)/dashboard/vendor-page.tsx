"use client";
import { useUser } from "@/components/useUser";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import Link from "next/link";

export default function VendorDashboardPage() {
  const { businessName, user, vendor } = useUser();
  const [stockCount, setStockCount] = useState<number | null>(null);
  const [totalStockValue, setTotalStockValue] = useState<number | null>(null);
  const [totalProfitValue, setTotalProfitValue] = useState<number | null>(null);
  const [lowStockItems, setLowStockItems] = useState<number>(0);
  const [outOfStockItems, setOutOfStockItems] = useState<number>(0);
  const [lowStockList, setLowStockList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockPage, setLowStockPage] = useState(1);
  const lowStockPageSize = 5;
  const totalLowStockPages = Math.ceil(lowStockList.length / lowStockPageSize);
  const paginatedLowStockList = lowStockList.slice((lowStockPage - 1) * lowStockPageSize, lowStockPage * lowStockPageSize);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const fetchStockStats = async () => {
      const q = query(collection(db, 'vendor_stocks'), where('vendorId', '==', user.uid));
      const snap = await getDocs(q);
      setStockCount(snap.size);
      let totalValue = 0;
      let totalProfit = 0;
      let lowStock = 0;
      let outOfStock = 0;
      let lowList: any[] = [];
      snap.docs.forEach(doc => {
        const d = doc.data();
        totalValue += (d.quantity || 0) * (d.costPrice || 0);
        totalProfit += ((d.sellingPrice || 0) - (d.costPrice || 0)) * (d.quantity || 0);
        const threshold = d.lowStockThreshold || 5;
        if ((d.quantity || 0) === 0) outOfStock++;
        if ((d.quantity || 0) < threshold && (d.quantity || 0) > 0) {
          lowStock++;
          lowList.push(d);
        }
      });
      setTotalStockValue(totalValue);
      setTotalProfitValue(totalProfit);
      setLowStockItems(lowStock);
      setOutOfStockItems(outOfStock);
      setLowStockList(lowList);
      setLoading(false);
    };
    fetchStockStats();
  }, [user]);

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 md:px-8 py-6 sm:py-8 w-full">
      <h1 className="text-2xl font-bold text-primary-700 mb-2">Welcome, {businessName || 'Vendor'}!</h1>
      <div className="mb-4 sm:mb-6 text-neutral-600">Here is your business summary.</div>
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-5 flex flex-col gap-1">
          <div className="text-sm text-neutral-500 font-medium">Total Stock Value</div>
          <div className="text-xl font-bold text-neutral-900">{loading ? '-' : `LKR ${totalStockValue?.toLocaleString()}`}</div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-5 flex flex-col gap-1">
          <div className="text-sm text-neutral-500 font-medium">Total Profit Value</div>
          <div className="text-xl font-bold text-green-700">{loading ? '-' : `LKR ${totalProfitValue?.toLocaleString()}`}</div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-5 flex flex-col gap-1">
          <div className="text-sm text-neutral-500 font-medium">Stock Count</div>
          <div className="text-xl font-bold text-neutral-900">{loading ? '-' : stockCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-5 flex flex-col gap-1">
          <div className="text-sm text-neutral-500 font-medium">Low Stock Items</div>
          <div className="text-xl font-bold text-yellow-700">{loading ? '-' : lowStockItems}</div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-5 flex flex-col gap-1">
          <div className="text-sm text-neutral-500 font-medium">Out of Stock Items</div>
          <div className="text-xl font-bold text-red-700">{loading ? '-' : outOfStockItems}</div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-5 flex flex-col gap-1 col-span-1 sm:col-span-2 md:col-span-1">
          <div className="text-sm text-neutral-500 font-medium">Subscription Status</div>
          <div className="text-xl font-bold text-primary-700">{vendor?.subscription?.plan ? `${vendor.subscription.plan} (${vendor.subscription.status || 'Active'})` : 'N/A'}</div>
        </div>
      </div>
      {/* Charts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8 items-stretch min-h-[260px]">
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4 sm:p-6 flex flex-col items-center justify-center min-h-[200px] sm:min-h-[260px] h-full">
          <div className="text-lg font-bold text-primary-700 mb-2">Stock Distribution</div>
          <div className="w-full h-32 sm:h-48 flex items-center justify-center text-neutral-400">[Pie Chart Placeholder]</div>
        </div>
        <div className="bg-white rounded-xl border border-yellow-200 shadow-sm p-4 sm:p-6 flex flex-col justify-start min-h-[200px] sm:min-h-[260px] h-full w-full">
          <div className="text-lg font-bold text-yellow-700 mb-3 sm:mb-4">Low Stock Warning</div>
          {loading ? (
            <div className="text-neutral-400">Loading...</div>
          ) : lowStockList.length === 0 ? (
            <div className="text-neutral-500">All products are sufficiently stocked.</div>
          ) : (
            <>
              <ul className="divide-y divide-yellow-100 w-full">
                {paginatedLowStockList.map((item, idx) => (
                  <li key={idx} className="py-2 flex flex-col xs:grid xs:grid-cols-12 gap-1 xs:gap-2 items-start xs:items-center">
                    <span className="font-medium text-neutral-900 xs:col-span-6 truncate w-full xs:w-auto">{item.productName}</span>
                    <span className="text-yellow-700 font-semibold xs:col-span-3 xs:text-right">Qty: {item.quantity}</span>
                    <span className="text-xs text-neutral-500 xs:col-span-3 xs:text-right">Threshold: {item.lowStockThreshold || 5}</span>
                  </li>
                ))}
              </ul>
              {totalLowStockPages > 1 && (
                <div className="flex flex-col xs:flex-row justify-between items-center w-full mt-3 gap-2 xs:gap-0">
                  <button
                    className="px-3 py-1 rounded-md border border-yellow-200 bg-white text-yellow-700 hover:bg-yellow-50 text-xs font-medium"
                    onClick={() => setLowStockPage((p) => Math.max(1, p - 1))}
                    disabled={lowStockPage === 1}
                  >
                    Previous
                  </button>
                  <span className="text-xs text-neutral-500">Page {lowStockPage} of {totalLowStockPages}</span>
                  <button
                    className="px-3 py-1 rounded-md border border-yellow-200 bg-white text-yellow-700 hover:bg-yellow-50 text-xs font-medium"
                    onClick={() => setLowStockPage((p) => Math.min(totalLowStockPages, p + 1))}
                    disabled={lowStockPage === totalLowStockPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
} 