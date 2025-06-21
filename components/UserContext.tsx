"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

interface UserContextType {
  user: FirebaseUser | null;
  vendor: any | null;
  businessName: string | null;
  role: 'vendor' | 'admin' | null;
  loading: boolean;
}

export const UserContext = createContext<UserContextType>({
  user: null,
  vendor: null,
  businessName: null,
  role: null,
  loading: true,
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [vendor, setVendor] = useState<any | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [role, setRole] = useState<'vendor' | 'admin' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setVendor(null);
      setBusinessName(null);
      setRole(null);
      setLoading(true); // Start loading

      if (firebaseUser) {
        try {
          const vendorRef = doc(db, 'vendor_accounts', firebaseUser.uid);
          const snap = await getDoc(vendorRef);
          
          if (snap.exists()) {
            const vendorDoc = snap.data();
            setVendor(vendorDoc);
            setBusinessName(vendorDoc.businessName || vendorDoc.name || null);
            setRole(vendorDoc.vendorCode ? 'vendor' : 'admin');
            console.log('UserContext: detected role', vendorDoc.vendorCode ? 'vendor' : 'admin');
          } else {
            // If no vendor doc, they might be another type of user or it's an error.
            // For now, assume they are not a vendor.
            setRole('admin'); 
            console.log('UserContext: No vendor document found, assuming admin role.');
          }
        } catch (err) {
          console.error('UserContext: Firestore error', err);
          setRole(null); // Set role to null on error
        } finally {
          setLoading(false); // Stop loading after async operation is complete
        }
      } else {
        // No user is logged in
        setLoading(false); // Stop loading
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, vendor, businessName, role, loading }}>
      {children}
    </UserContext.Provider>
  );
} 