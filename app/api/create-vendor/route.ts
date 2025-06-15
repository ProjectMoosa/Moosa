import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Initialize Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, vendorData } = await req.json();
    if (!email || !password || !vendorData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // 1. Create Auth user
    const userRecord = await admin.auth().createUser({ email, password });
    // 2. Write to Firestore (use UID as doc ID)
    await admin.firestore().collection('vendor_accounts').doc(userRecord.uid).set({
      ...vendorData,
      uid: userRecord.uid,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 