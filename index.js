const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto'); // 👈 ADDED: Required for secure Webhook Signature verification

const app = express();
app.use(cors());
app.use(express.json());

// 📍 SET YOUR SECURE RAZORPAY WEBHOOK SECRET (Match this in Razorpay Dashboard!)
const RAZORPAY_WEBHOOK_SECRET = "bitzo_webhook_secret_9988";

// 1. Firebase Admin Initialization
try {
    const serviceAccount = require("./serviceAccountKey.json");
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    console.log("Firebase Admin Initialized! ✅");
} catch (error) {
    console.error("Firebase Init Error:", error.message);
}

const db = admin.firestore();

// =========================================================================
// 🚀 UPDATED: AUTO-GIG ROLLING 3-DAY SLOTS ENGINE (Today is kept 100% safe!) [1.1.4]
// =========================================================================
async function manageGigs() {
    try {
        const today = new Date();
        const offset = 5.5 * 60 * 60 * 1000; // India Time (IST) Offset

        // Helper function to calculate and format IST dates dynamically [1.1.4]
        const getISTDateString = (daysOffset) => {
            const istTime = today.getTime() + offset + (daysOffset * 24 * 60 * 60 * 1000);
            const d = new Date(istTime);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dateDay = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${dateDay}`;
        };

        const todayStr = getISTDateString(0); // 👈 Today's Date
        const tomorrowStr = getISTDateString(1);
        const dayAfterStr = getISTDateString(2);
        const dayAfterAfterStr = getISTDateString(3);

        console.log(`Syncing Rolling Gigs: Today is ${todayStr}. Active range: ${tomorrowStr} to ${dayAfterAfterStr}`);

        // 1. 🧹 CLEAN-UP: Delete only gigs older than TODAY (Today's active gig remains 100% safe!) [2]
        const oldGigs = await db.collection('gigs').where('date', '<', todayStr).get();
        if (!oldGigs.empty) {
            let batch = db.batch();
            oldGigs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Cleaned old gigs prior to date: ${todayStr} successfully.`);
        }

        // 2. ➕ GENERATION: Ensure slots exist for Tomorrow, Day After, and Day After After
        const targetDates = [tomorrowStr, dayAfterStr, dayAfterAfterStr];
        let createdDates = [];

        for (let dateStr of targetDates) {
            const checkGigs = await db.collection('gigs').where('date', '==', dateStr).get();
            if (checkGigs.empty) {
                const defaultSlots = [
                    { start: "10:00 AM", end: "12:00 PM", inc: 0 },
                    { start: "12:00 PM", end: "04:00 PM", inc: 0 },
                    { start: "04:00 PM", end: "07:00 PM", inc: 0 },
                    { start: "07:00 PM", end: "11:00 PM", inc: 0 }
                ];
                for (let slot of defaultSlots) {
                    await db.collection('gigs').add({
                        area: "Mundra",
                        date: dateStr,
                        startTime: slot.start,
                        endTime: slot.end,
                        incentive: slot.inc,
                        slotsAvailable: 25,
                        bookedBy: []
                    });
                }
                createdDates.push(dateStr);
            }
        }

        if (createdDates.length > 0) {
            console.log(`Gigs successfully auto-created for upcoming dates: ${createdDates.join(', ')} ✅`);
            return `Gigs created for ${createdDates.join(', ')} ✅`;
        }
        return `Rolling gigs for upcoming 3 days are already up-to-date! ✅`;
    } catch (error) {
        console.error("Auto-Gig Error: 🔴", error.message);
        return "Error: " + error.message;
    }
}

// 2. Health Check & Trigger
app.get('/', async (req, res) => {
    const report = await manageGigs();
    res.send(`<h1>Bitzo Dispatch Server</h1><p>${report}</p>`);
});

// 3. Admin Dispatch Route [1]
app.post('/dispatch-order', async (req, res) => {
    try {
        const orderData = req.body;
        console.log("Admin Assigned Order Webhook:", orderData);

        // A. Broadcast globally via Socket for foreground active riders
        io.emit('new_order_assigned', orderData);

        // B. Fetch target rider and trigger High-Priority FCM Push Notification [1]
        const riderId = orderData.riderId;
        const orderId = orderData.orderId || orderData._id || orderData.id || "000000";

        if (riderId) {
            const riderDoc = await db.collection('riders').doc(riderId).get();

            if (riderDoc.exists) {
                const riderData = riderDoc.data();
                const fcmToken = riderData.fcmToken;

                if (fcmToken) {
                    // Call the self-contained FCM trigger at the very bottom [1]
                    await sendNewOrderNotification(fcmToken, {
                        orderId: orderId,
                        restaurant: orderData.restaurant || "Bitzo Partner Merchant",
                        payout: orderData.payout || orderData.riderPayout || 60,
                        paymentMode: orderData.paymentMode || "PREPAID",
                        totalAmount: orderData.total_amount || orderData.totalAmount || 0,
                        restaurantLat: orderData.restaurantLat || orderData.restLat || 22.8420,
                        restaurantLng: orderData.restaurantLng || orderData.restLng || 69.7250,
                    });
                } else {
                    console.warn(`Rider ${riderId} does not have an FCM token registered in Firestore.`);
                }
            } else {
                console.warn(`Rider document ${riderId} does not exist in Firestore.`);
            }
        }

        res.status(200).send({ success: true });
    } catch (error) {
        console.error("FCM Dispatch Error in Webhook Router:", error.message);
        res.status(200).send({ success: true, warning: error.message });
    }
});

// =========================================================================
// 🚨 4. SECURE RAZORPAY WEBHOOK RECEIVER (The Ultimate Bank-Level Sync) [1]
// =========================================================================
app.post('/razorpay-webhook', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];

        // 1. Cryptographically verify that the webhook actually came from Razorpay's secure servers!
        const shasum = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest('hex');

        if (digest !== signature) {
            console.error("🚨 Webhook Security Alert: Invalid Signature! Request discarded.");
            return res.status(400).send('Invalid signature');
        }

        console.log("Verified Webhook Signature successfully! ✅ processing payment...");

        const event = req.body.event;

        // We only process if the payment was successfully captured [1]
        if (event === 'payment.captured') {
            const paymentEntity = req.body.payload.payment.entity;
            const rzpOrderId = paymentEntity.order_id;
            const paymentId = paymentEntity.id;

            console.log(`Payment captured! ID: ${paymentId} for Razorpay Order: ${rzpOrderId}`);

            // 2. Query Firestore to find the pending order with matching Razorpay Order ID
            const orderQuery = await db.collection('orders')
                .where('razorpayOrderId', '==', rzpOrderId)
                .where('status', '==', 'payment_pending')
                .limit(1)
                .get();

            if (!orderQuery.empty) {
                const orderDoc = orderQuery.docs[0];
                const orderId = orderDoc.id;
                const orderData = orderDoc.data();

                // 3. Update order status dynamically in database to "Placed" [1]
                await db.collection('orders').doc(orderId).update({
                    status: 'Placed',
                    paymentStatus: 'Paid',
                    razorpayPaymentId: paymentId,
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`Order #${orderId} has been successfully validated and set to "Placed"! 🏆`);

                // 4. AUTO DISPATCH: Broadcast order to the active riders on sockets instantly! [2]
                io.emit('new_order_assigned', {
                    ...orderData,
                    orderId: orderId,
                    status: 'Placed',
                    paymentStatus: 'Paid',
                    razorpayPaymentId: paymentId
                });
            } else {
                console.warn(`No matching pending order found in Firestore for Razorpay Order: ${rzpOrderId}`);
            }
        }

        res.status(200).send('ok');
    } catch (error) {
        console.error("Razorpay Webhook Error: 🔴", error.message);
        res.status(500).send(error.message);
    }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 4. Socket Connections
io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);
    socket.on('join_order_room', (orderId) => socket.join(orderId));
    socket.on('send_location', (data) => socket.to(data.orderId).emit('receive_location', data));
    socket.on('disconnect', () => console.log('User Disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} 🚀`);
    manageGigs(); // Server start hote hi chal jaye
});

// =========================================================================
// 🚨 5. DYNAMIC FULL-SCREEN INTENT ALERT ENGINE (Wakes Lockscreen & Plays Sound) [1]
// =========================================================================
async function sendNewOrderNotification(fcmToken, order) {
  const payload = {
    token: fcmToken,

    // Data-only payload triggers the background isolate _firebaseMessagingBackgroundHandler safely
    data: {
      type: 'NEW_ORDER',
      orderId: order.orderId.toString(),
      restaurant: order.restaurant,
      payout: order.payout.toString(),
      paymentMode: order.paymentMode,
      totalAmount: order.totalAmount.toString(),
      restaurantLat: order.restaurantLat.toString(),
      restaurantLng: order.restaurantLng.toString(),
    },

    // Critical for waking up Doze-mode/Locked Android devices immediately [1]
    android: {
      priority: 'high',
    },

    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'background',
      },
    },
  };

  try {
    const response = await admin.messaging().send(payload);
    console.log(`FCM Alert successfully dispatched! ✅ Message ID: ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    console.error(`FCM Admin Dispatch Error: 🔴 ${error.message}`);
    return { success: false, error: error.message };
  }
}