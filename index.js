const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // 👈 Ye line bohot zaruri hai Admin Panel se data lene ke liye

const server = http.createServer(app);

// Socket.io Setup
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 1. Home Route (Cron-job ke liye)
app.get('/', (req, res) => {
    res.send("Rider Tracking Server is Running smoothly! 🚀");
});

// 2. 🔔 DISPATCH ROUTE: Admin Panel yahan se order bhejega
app.post('/dispatch-order', (req, res) => {
    const orderData = req.body; // HTML se bheja gaya data

    console.log("Admin ne order dispatch kiya:", orderData);

    // Sabhi online riders ko signal bhej do
    // Rider App mein 'new_order_assigned' listener ise pakad lega
    io.emit('new_order_assigned', orderData);

    res.status(200).send({ success: true, message: "Rider notified via Socket!" });
});

// 3. Socket Connection Logic
io.on('connection', (socket) => {
    console.log('Naya user connect hua:', socket.id);

    socket.on('join_order_room', (orderId) => {
        socket.join(orderId);
        console.log(`User joined room: ${orderId}`);
    });

    socket.on('send_location', (data) => {
        socket.to(data.orderId).emit('receive_location', {
            lat: data.lat,
            lng: data.lng
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnect ho gaya:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server port ${PORT} par live hai 🚀`);
});