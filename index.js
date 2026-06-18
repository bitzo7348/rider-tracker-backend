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

// 3. Admin Dispatch Route
app.post('/dispatch-order', (req, res) => {
    const orderData = req.body;
    console.log("Admin Assigned Order:", orderData);
    io.emit('new_order_assigned', orderData);
    res.status(200).send({ success: true });
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