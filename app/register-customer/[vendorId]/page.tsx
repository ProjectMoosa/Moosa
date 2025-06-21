"use client";

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { CgSpinner } from 'react-icons/cg';

export default function CustomerRegistrationPage() {
  const params = useParams();
  const vendorId = params.vendorId as string;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      setError('Please fill in both fields.');
      return;
    }
    if (!vendorId) {
        setError('Invalid vendor link. Please contact the store owner.');
        return;
    }
    setError(null);
    setLoading(true);

    try {
      await addDoc(collection(db, 'customer_info'), {
        vendorId,
        name,
        phone,
        createdAt: Timestamp.now(),
      });
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  if (success) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg text-center">
            <h1 className="text-2xl font-bold text-green-600 mb-4">Registration Successful!</h1>
            <p className="text-neutral-600">Thank you for registering. You are now eligible for special discounts and promotions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold text-neutral-800 text-center mb-6">Register as a Valued Customer</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="text-sm font-medium text-neutral-700">Full Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="mt-1 w-full p-3 border border-neutral-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label htmlFor="phone" className="text-sm font-medium text-neutral-700">Phone Number</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter your phone number"
              className="mt-1 w-full p-3 border border-neutral-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-primary-700 rounded-lg shadow-sm hover:bg-primary-800 disabled:bg-primary-300"
            >
              {loading && <CgSpinner className="animate-spin" />}
              Register
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 