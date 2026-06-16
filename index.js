const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.get('/', (req, res) => {
    res.send("Rider Tracking Server is Running smoothly! 🚀");
});

io.on('connection', (socket) => {
    console.log('Naya user connect hua, ID:', socket.id);

    socket.on('join_order_room', (orderId) => {
        socket.join(orderId);
        console.log(`User is room me join hua: ${orderId}`);
    });

    socket.on('send_location', (data) => {
        socket.to(data.orderId).emit('receive_location', {
            lat: data.lat,
            lng: data.lng
        });
        console.log(`Location bheji gayi order ${data.orderId} ke liye: ${data.lat}, ${data.lng}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnect ho gaya:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server port ${PORT} par daud raha hai 🚀`);
});