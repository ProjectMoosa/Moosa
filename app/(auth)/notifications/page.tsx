"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { useUser } from '@/components/useUser';
import Container from '@/components/Container';

export default function VendorNotificationsPage() {
  const { user, role, loading } = useUser();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [tab, setTab] = useState<'unread' | 'read'>('unread');
  const [loadingNotifs, setLoadingNotifs] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoadingNotifs(true);
    const q = query(
      collection(db, 'notifications'),
      where('recipientType', '==', 'vendor'),
      where('recipientId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingNotifs(false);
    });
    return () => unsub();
  }, [user]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
      console.log('Marked notification as read:', id);
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };
  
  const markAsUnread = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: false });
      console.log('Marked notification as unread:', id);
    } catch (error) {
      console.error('Error marking as unread:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      const updatePromises = unreadNotifications.map(n => 
        updateDoc(doc(db, 'notifications', n.id), { read: true })
      );
      await Promise.all(updatePromises);
      console.log('Marked all notifications as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  if (loading || role !== 'vendor') return null;

  const filtered = notifications.filter(n => tab === 'unread' ? !n.read : n.read);

  return (
    <Container>
      <h1 className="text-2xl font-bold text-primary-700 mb-6">Notifications</h1>
      <div className="flex gap-2 mb-6">
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium border ${tab === 'unread' ? 'bg-primary-700 text-white' : 'bg-white text-primary-700 border-primary-700'}`}
          onClick={() => setTab('unread')}
        >
          Unread ({notifications.filter(n => !n.read).length})
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium border ${tab === 'read' ? 'bg-primary-700 text-white' : 'bg-white text-primary-700 border-primary-700'}`}
          onClick={() => setTab('read')}
        >
          Read ({notifications.filter(n => n.read).length})
        </button>
        {notifications.filter(n => !n.read).length > 0 && (
          <button
            className="px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
            onClick={markAllAsRead}
          >
            Mark All as Read
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-6 min-h-[300px]">
        {loadingNotifs ? (
          <div className="text-neutral-400 text-center py-12">Loading notifications...</div>
        ) : filtered.length === 0 ? (
          <div className="text-neutral-400 text-center py-12">No {tab} notifications.</div>
        ) : (
          <ul className="divide-y divide-neutral-100 space-y-1">
            {filtered.map(n => (
              <li key={n.id} className="py-4 flex items-start gap-4 px-2">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${n.read ? 'bg-neutral-200' : 'bg-primary-500 animate-pulse'}`}></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-neutral-900 mb-1.5 leading-snug">{n.type === 'low_stock' ? 'Low Stock Alert' : n.type === 'subscription_payment' ? 'Subscription Payment' : n.type === 'subscription_change' ? 'Subscription Change' : 'Notification'}</div>
                  <div className="text-neutral-700 mb-2 leading-normal">{n.message}</div>
                  <div className="text-xs text-neutral-400 leading-tight">{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : ''}</div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {n.read ? (
                    <button onClick={() => markAsUnread(n.id)} className="text-xs text-primary-700 hover:underline whitespace-nowrap">Mark as unread</button>
                  ) : (
                    <button onClick={() => markAsRead(n.id)} className="text-xs text-primary-700 hover:underline whitespace-nowrap">Mark as read</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
} 