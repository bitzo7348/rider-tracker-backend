const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

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

// --- 🚀 AUTO-GIG MANAGEMENT (Automatic Slots) ---
async function manageGigs() {
    try {
        const today = new Date();
        const offset = 5.5 * 60 * 60 * 1000; // India Time Offset
        const istDate = new Date(today.getTime() + offset);

        const year = istDate.getUTCFullYear();
        const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(istDate.getUTCDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        console.log("Checking Gigs for:", dateStr);

        // Kal ke purane delete karo
        const oldGigs = await db.collection('gigs').where('date', '<', dateStr).get();
        if (!oldGigs.empty) {
            let batch = db.batch();
            oldGigs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log("Old Gigs Cleaned.");
        }

        // Aaj ke create karo
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
            console.log("Today's Gigs Created! ✅");
            return `Gigs created for ${dateStr} ✅`;
        }
        return `Gigs already exist for ${dateStr} ✅`;
    } catch (error) {
        console.error("Gig Error:", error.message);
        return "Error: " + error.message;
    }
}

// 2. Health Check & Trigger
app.get('/', async (req, res) => {
    const report = await manageGigs();
    res.send(`<h1>Bitzo Dispatch Server</h1><p>${report}</p>`);
});

// 3. Admin Dispatch Route (Updated to trigger Dynamic Push Alerts & Token Sync) [1]
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
        // Respond success: true so the webhook doesn't crash, but report the sync warning log
        res.status(200).send({ success: true, warning: error.message });
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
// 🚨 5. DYNAMIC FULL-SCREEN INTENT ALERT ENGINE (Wakes Lockscreen & Plays Sound)
// =========================================================================
Future<void> _completeDeliveryAndAddPayout() async {} // Flutter logic reference placeholder

static Future<void> _completeDelivery() async {} // Flutter logic reference placeholder

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