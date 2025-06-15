"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
  name: "",
  planId: "",
  price: 0,
  duration: "",
  description: "",
  features: [""]
};

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<Plan>(emptyPlan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [localEnabled, setLocalEnabled] = useState<{ [id: string]: boolean }>({});

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    setLoading(true);
    const querySnapshot = await getDocs(collection(db, "subscription_plans"));
    const data: Plan[] = querySnapshot.docs.map((doc: DocumentData) => ({
      id: doc.id,
      enabled: true, // default enabled
      ...doc.data(),
    }));
    setPlans(data);
    // Set local enabled state
    const enabledMap: { [id: string]: boolean } = {};
    data.forEach((plan) => {
      if (plan.id) enabledMap[plan.id] = plan.enabled !== false;
    });
    setLocalEnabled(enabledMap);
    setLoading(false);
  }

  function openModal(plan?: Plan) {
    setEditing(plan || null);
    setForm(plan ? { ...plan, features: plan.features && plan.features.length ? plan.features : [""] } : emptyPlan);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyPlan);
    setError("");
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === "price" ? Number(value) : value }));
  }

  function handleFeatureChange(idx: number, value: string) {
    setForm((f) => {
      const features = [...f.features];
      features[idx] = value;
      return { ...f, features };
    });
  }

  function addFeature() {
    setForm((f) => ({ ...f, features: [...f.features, ""] }));
  }

  function removeFeature(idx: number) {
    setForm((f) => {
      const features = f.features.filter((_, i) => i !== idx);
      return { ...f, features: features.length ? features : [""] };
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { id, ...data } = form;
      data.features = data.features.filter((f) => f.trim() !== "");
      if (editing && editing.id) {
        await updateDoc(doc(db, "subscription_plans", editing.id), data);
      } else {
        await addDoc(collection(db, "subscription_plans"), { ...data, enabled: true });
      }
      await fetchPlans();
      closeModal();
    } catch (err: any) {
      setError(err.message || "Error saving plan");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id?: string) {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this plan?")) return;
    setSaving(true);
    try {
      console.log("Deleting plan with id:", id);
      await deleteDoc(doc(db, "subscription_plans", id));
      await fetchPlans();
    } catch (err: any) {
      alert("Error deleting plan: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  function handleToggleEnabledLocal(plan: Plan) {
    if (!plan.id) return;
    setLocalEnabled((prev) => ({ ...prev, [plan.id!]: !prev[plan.id!] }));
  }

  return (
    <div className="max-w-5xl mx-auto px-2 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Subscription Plans</h1>
        <button
          className="bg-primary-700 hover:bg-primary-800 text-white font-medium px-4 py-2 rounded-md text-sm shadow-sm transition-colors"
          onClick={() => openModal()}
        >
          + Add Plan
        </button>
      </div>
      {loading ? (
        <div className="text-center text-neutral-400 py-12">Loading...</div>
      ) : plans.length === 0 ? (
        <div className="text-center text-neutral-400 py-12">No plans found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white border border-neutral-200 rounded-lg p-4 flex flex-col md:flex-row items-center gap-4 min-h-[120px] transition-colors ${localEnabled[plan.id!] ? "" : "opacity-60"}`}
              style={{ minWidth: 0 }}
            >
              {/* Status dot */}
              <div className="flex flex-col items-start w-full md:w-1/3 min-w-[120px]">
                <div className="flex items-center gap-1 text-xs mb-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${localEnabled[plan.id!] ? "bg-green-500" : "bg-neutral-400"}`}></span>
                  <span className="text-neutral-400">{localEnabled[plan.id!] ? "Enabled" : "Disabled"}</span>
                </div>
                <div className="font-semibold text-neutral-900 text-base truncate">{plan.name}</div>
                <div className="text-primary-800 font-bold text-lg">LKR {plan.price}</div>
                <div className="text-primary-700 text-xs font-medium">{plan.duration}</div>
              </div>
              <div className="flex-1 w-full md:w-2/3 min-w-0">
                <div className="text-neutral-600 text-xs mb-1 truncate">{plan.description}</div>
                {plan.features && plan.features.length > 0 && (
                  <ul className="text-xs text-neutral-700 list-disc list-inside mb-2">
                    {plan.features.map((f, i) => (
                      <li key={i} className="truncate">{f}</li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 mt-2 justify-end">
                  <button
                    className="px-3 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-xs font-medium transition-colors"
                    onClick={() => openModal(plan)}
                  >
                    Edit
                  </button>
                  <button
                    className="px-3 py-1 rounded-md bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 text-xs font-medium transition-colors"
                    onClick={() => handleDelete(plan.id)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${localEnabled[plan.id!] ? "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"}`}
                    onClick={() => handleToggleEnabledLocal(plan)}
                  >
                    {localEnabled[plan.id!] ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Modal for Add/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl relative">
            <button
              className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 text-xl"
              onClick={closeModal}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-lg font-bold mb-4">{editing ? "Edit Plan" : "Add Plan"}</h2>
            <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400"
                  required
                  placeholder="Plan Name"
                />
                <input
                  name="planId"
                  value={form.planId}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400"
                  required
                  placeholder="Plan ID (e.g. basic)"
                />
                <input
                  name="price"
                  type="number"
                  value={form.price}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400"
                  required
                  min={0}
                  placeholder="Price (LKR)"
                />
                <input
                  name="duration"
                  value={form.duration}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400"
                  required
                  placeholder="Duration (e.g. Monthly)"
                />
                <input
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-neutral-200 rounded-md px-3 py-3 focus:ring-primary-500 focus:border-primary-500 text-base placeholder-neutral-400 md:col-span-2"
                  required
                  placeholder="Description"
                />
              </div>
              <div>
                <label className="block text-base font-semibold text-neutral-900 mb-2">Features</label>
                {form.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <input
                      value={feature}
                      onChange={e => handleFeatureChange(idx, e.target.value)}
                      className="block w-full border border-neutral-200 rounded-md px-3 py-2 focus:ring-primary-500 focus:border-primary-500 text-base"
                      placeholder={`Feature ${idx + 1}`}
                    />
                    {form.features.length > 1 && (
                      <button type="button" className="text-red-600 text-sm" onClick={() => removeFeature(idx)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="text-primary-700 font-medium mt-1" onClick={addFeature}>
                  + Add Feature
                </button>
              </div>
              {error && <div className="text-red-500 text-sm text-center">{error}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 text-base"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-md bg-primary-700 text-white hover:bg-primary-800 text-base font-semibold shadow-sm disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? (editing ? "Saving..." : "Adding...") : (editing ? "Save Changes" : "Add Plan")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 