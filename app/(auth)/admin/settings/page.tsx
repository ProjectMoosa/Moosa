"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useUser } from '@/components/useUser';
import { useRouter } from "next/navigation";

export default function AdminSettingsPage() {
  const { role } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supportPhone, setSupportPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, "support", "contact");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setSupportPhone(data.phone || "");
          setSupportEmail(data.email || "");
        }
      } catch (e) {
        setError("Failed to load settings.");
      }
      setLoading(false);
    };
    fetchSettings();
  }, [role, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const docRef = doc(db, "support", "contact");
      await setDoc(docRef, { phone: supportPhone, email: supportEmail }, { merge: true });
      setSuccess("Settings saved successfully.");
    } catch (e) {
      setError("Failed to save settings.");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-neutral-400">Loading settings...</div>;
  if (role !== "admin") return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6 text-primary-700">Admin Settings</h1>
      <form onSubmit={handleSave} className="space-y-6 bg-white p-6 rounded-xl shadow border border-neutral-100">
        <div>
          <label className="block text-sm font-medium mb-1">Support Phone</label>
          <input type="tel" className="w-full border border-neutral-200 rounded-md px-3 py-2" value={supportPhone} onChange={e => setSupportPhone(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Support Email</label>
          <input type="email" className="w-full border border-neutral-200 rounded-md px-3 py-2" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} required />
        </div>
        {success && <div className="text-green-600 text-sm">{success}</div>}
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button type="submit" className="w-full py-2 bg-primary-700 text-white rounded-md font-medium hover:bg-primary-800 transition" disabled={saving}>{saving ? "Saving..." : "Save Settings"}</button>
      </form>
    </div>
  );
} 