const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// 1. Firebase Admin SDK Setup
// Pakka karna ki 'serviceAccountKey.json' tumhare folder me hai
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- 🚀 AUTOMATIC GIG MANAGEMENT LOGIC (Zomato Style) ---
async function manageGigs() {
    console.log("Running Auto-Gig Management...");
    const today = new Date();
    // India Timezone ke hisab se Date string (YYYY-MM-DD)
    const dateStr = today.toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'});

    try {
        // A. PURANE GIGS DELETE KARO (Yesterday)
        const oldGigs = await db.collection('gigs').where('date', '<', dateStr).get();
        if (!oldGigs.empty) {
            let batch = db.batch();
            oldGigs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log("✅ Purane Gigs saaf kar diye gaye!");
        }

        // B. AAJ AUR KAL KE GIGS CREATE KARO
        const daysToCheck = [0, 1]; // 0 = Aaj, 1 = Kal
        for (let dayOffset of daysToCheck) {
            let targetDate = new Date();
            targetDate.setDate(today.getDate() + dayOffset);
            let targetDateStr = targetDate.toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'});

            const checkGigs = await db.collection('gigs').where('date', '==', targetDateStr).get();

            if (checkGigs.empty) {
                console.log(`Creating fresh slots for: ${targetDateStr}`);
                const defaultSlots = [
                    { start: "07:00 AM", end: "12:00 PM", inc: 30 },
                    { start: "12:00 PM", end: "05:00 PM", inc: 20 },
                    { start: "06:00 PM", end: "11:00 PM", inc: 50 }
                ];

                for (let slot of defaultSlots) {
                    await db.collection('gigs').add({
                        area: "Mundra",
                        date: targetDateStr,
                        startTime: slot.start,
                        endTime: slot.end,
                        incentive: slot.inc,
                        slotsAvailable: 25,
                        bookedBy: []
                    });
                }
            }
        }
    } catch (error) {
        console.error("Gig Management Error:", error);
    }
}

// 2. HEALTH CHECK & CRON TRIGGER
// Har 14 min me jab cron-job.org ping karega, gigs manage honge
app.get('/', async (req, res) => {
    await manageGigs();
    res.send("Bitzo Dispatch Server: Active & Managed! 🚀");
});

// 3. ADMIN DISPATCH ROUTE (HTML Panel se call hota hai)
app.post('/dispatch-order', (req, res) => {
    const orderData = req.body;
    console.log("Admin ne order dispatch kiya:", orderData);

    // Sabhi connected riders ko signal bhejo
    io.emit('new_order_assigned', orderData);

    res.status(200).send({ success: true, message: "Rider notified!" });
});

// 4. SOCKET CONNECTION LOGIC
io.on('connection', (socket) => {
    console.log('App connected:', socket.id);

    // Rider/Customer order room join karega
    socket.on('join_order_room', (orderId) => {
        socket.join(orderId);
        console.log(`Joined room: ${orderId}`);
    });

    // Rider ki location live share hogi
    socket.on('send_location', (data) => {
        // data = { orderId, lat, lng }
        socket.to(data.orderId).emit('receive_location', {
            lat: data.lat,
            lng: data.lng
        });
    });

    socket.on('disconnect', () => {
        console.log('App disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server port ${PORT} par daud raha hai 🚀`);
});