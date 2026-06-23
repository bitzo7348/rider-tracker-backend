const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// 📍 RAZORPAY WEBHOOK SECRET
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
// 🚀 AUTO-GIG ROLLING 3-DAY SLOTS ENGINE [V 1.1.4]
// =========================================================================
async function manageGigs() {
    try {
        const today = new Date();
        const offset = 5.5 * 60 * 60 * 1000; // India Time (IST) Offset

        const getISTDateString = (daysOffset) => {
            const istTime = today.getTime() + offset + (daysOffset * 24 * 60 * 60 * 1000);
            const d = new Date(istTime);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dateDay = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${dateDay}`;
        };

        const todayStr = getISTDateString(0);
        const tomorrowStr = getISTDateString(1);
        const dayAfterStr = getISTDateString(2);
        const dayAfterAfterStr = getISTDateString(3);

        console.log(`Syncing Rolling Gigs: Today is ${todayStr}.`);

        const oldGigs = await db.collection('gigs').where('date', '<', todayStr).get();
        if (!oldGigs.empty) {
            let batch = db.batch();
            oldGigs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Cleaned old gigs prior to: ${todayStr}`);
        }

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
        return `Gigs processed! ✅`;
    } catch (error) {
        console.error("Auto-Gig Error:", error.message);
        return "Error: " + error.message;
    }
}

// 2. Health Check
app.get('/', async (req, res) => {
    const report = await manageGigs();
    res.send(`<h1>Bitzo Dispatch Server</h1><p>${report}</p>`);
});

// 3. Admin Dispatch Route
app.post('/dispatch-order', async (req, res) => {
    try {
        const orderData = req.body;
        console.log("Admin Assigned Order:", orderData);

        io.emit('new_order_assigned', orderData);

        const riderId = orderData.riderId;
        const orderId = orderData.orderId || orderData._id || orderData.id || "000000";

        if (riderId) {
            const riderDoc = await db.collection('riders').doc(riderId).get();
            if (riderDoc.exists) {
                const fcmToken = riderDoc.data().fcmToken;
                if (fcmToken) {
                    await sendNewOrderNotification(fcmToken, {
                        orderId: orderId,
                        restaurant: orderData.restaurant || "Bitzo Partner Merchant",
                        payout: orderData.payout || 60,
                        paymentMode: orderData.paymentMode || "PREPAID",
                        totalAmount: orderData.totalAmount || 0,
                        restaurantLat: orderData.restaurantLat || 22.8420,
                        restaurantLng: orderData.restaurantLng || 69.7250,
                    });
                }
            }
        }
        res.status(200).send({ success: true });
    } catch (error) {
        res.status(200).send({ success: true, warning: error.message });
    }
});

// 4. Razorpay Webhook
app.post('/razorpay-webhook', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const shasum = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest('hex');

        if (digest !== signature) return res.status(400).send('Invalid signature');

        const event = req.body.event;
        if (event === 'payment.captured') {
            const rzpOrderId = req.body.payload.payment.entity.order_id;
            const paymentId = req.body.payload.payment.entity.id;

            const orderQuery = await db.collection('orders')
                .where('razorpayOrderId', '==', rzpOrderId)
                .where('status', '==', 'payment_pending').limit(1).get();

            if (!orderQuery.empty) {
                const orderDoc = orderQuery.docs[0];
                await db.collection('orders').doc(orderDoc.id).update({
                    status: 'Placed',
                    paymentStatus: 'Paid',
                    razorpayPaymentId: paymentId,
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                io.emit('new_order_assigned', { ...orderDoc.data(), orderId: orderDoc.id, status: 'Placed' });
            }
        }
        res.status(200).send('ok');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// =========================================================================
// 🚀 SOCKET.IO REAL-TIME TRACKING ENGINE (Enhanced Debugging)
// =========================================================================
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
    console.log('User Connected 🌐:', socket.id);

    socket.on('join_order_room', (orderId) => {
        if(!orderId) return;
        const cleanId = orderId.toString().trim();
        socket.join(cleanId);
        console.log(`✅ Socket ${socket.id} joined room: [${cleanId}]`);
    });

    socket.on('send_location', (data) => {
        if(!data || !data.orderId) return;
        const cleanId = data.orderId.toString().trim();

        // 📍 LOGGING: Isse Render Dashboard pe location dikhegi
        console.log(`📍 Room [${cleanId}]: Rider at ${data.lat}, ${data.lng}`);

        // Broadcast to Customer in that room
        socket.to(cleanId).emit('receive_location', {
            lat: data.lat,
            lng: data.lng,
            orderId: cleanId
        });
    });

    socket.on('disconnect', () => console.log('User Disconnected ❌'));
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} 🚀`);
    manageGigs();
});

// 🚨 FCM Notification Helper
async function sendNewOrderNotification(fcmToken, order) {
  const payload = {
    token: fcmToken,
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
    android: { priority: 'high' }
  };
  try {
    const response = await admin.messaging().send(payload);
    console.log(`FCM Alert dispatched! ✅ ID: ${response}`);
  } catch (error) {
    console.error(`FCM Error: 🔴 ${error.message}`);
  }
}