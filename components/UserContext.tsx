"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
      setLoading(true);
      if (firebaseUser) {
        // Only query Firestore if user is authenticated
        try {
          const q = query(collection(db, 'vendor_accounts'), where('email', '==', firebaseUser.email));
          const snap = await getDocs(q);
          console.log('UserContext: vendor_accounts query result', snap.docs.map(d => d.data()));
          if (!snap.empty) {
            const vendorDoc = snap.docs[0].data();
            setVendor(vendorDoc);
            setBusinessName(vendorDoc.businessName || vendorDoc.name || null);
            setRole(vendorDoc.vendorCode ? 'vendor' : 'admin');
            console.log('UserContext: detected role', vendorDoc.vendorCode ? 'vendor' : 'admin');
          } else {
            setRole('admin');
            console.log('UserContext: detected role', 'admin');
          }
        } catch (err) {
          console.error('UserContext: Firestore error', err);
          setRole(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, vendor, businessName, role, loading }}>
      {children}
    </UserContext.Provider>
  );
} 