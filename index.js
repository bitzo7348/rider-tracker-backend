const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Firebase Admin SDK
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

// --- 🚀 AUTO-GIG MANAGEMENT (Hardcoded Date Logic) ---
async function manageGigs() {
    try {
        // IST (India) Timezone ke hisab se date nikalna
        const now = new Date();
        const offset = 5.5 * 60 * 60 * 1000; // India is UTC +5:30
        const istDate = new Date(now.getTime() + offset);

        const year = istDate.getUTCFullYear();
        const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(istDate.getUTCDate()).padStart(2, '0');

        const dateStr = `${year}-${month}-${day}`; // Format: 2026-06-17
        console.log("Checking Gigs for Date:", dateStr);

        // A. Purane delete karo (Jo aaj se pehle ke hain)
        const oldGigs = await db.collection('gigs').where('date', '<', dateStr).get();
        if (!oldGigs.empty) {
            let batch = db.batch();
            oldGigs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Deleted ${oldGigs.size} expired gigs.`);
        }

        // B. Aaj ke slots check karo
        const checkGigs = await db.collection('gigs').where('date', '==', dateStr).get();

        if (checkGigs.empty) {
            console.log("No gigs found for today. Creating 3 default slots...");
            const defaultSlots = [
                { start: "07:00 AM", end: "12:00 PM", inc: 30 },
                { start: "12:00 PM", end: "05:00 PM", inc: 20 },
                { start: "06:00 PM", end: "11:00 PM", inc: 50 }
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
            return `Gigs created for ${dateStr} ✅`;
        } else {
            return `Gigs already exist for ${dateStr} ✅`;
        }

    } catch (error) {
        console.error("Logical Error:", error.message);
        return "Error: " + error.message;
    }
}

// Routes
app.get('/', async (req, res) => {
    const statusReport = await manageGigs();
    res.send(`<h1>Bitzo Server Status</h1><p>${statusReport}</p>`);
});

app.post('/dispatch-order', (req, res) => {
    io.emit('new_order_assigned', req.body);
    res.status(200).send({ success: true });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
    socket.on('join_order_room', (orderId) => socket.join(orderId));
    socket.on('send_location', (data) => socket.to(data.orderId).emit('receive_location', data));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // 🔥 Sabse zaruri: Server start hote hi gigs manage karo
    manageGigs();
});const express = require('express');
   const http = require('http');
   const { Server } = require('socket.io');
   const cors = require('cors');
   const admin = require('firebase-admin');

   const app = express();
   app.use(cors());
   app.use(express.json());

   // 1. Firebase Admin SDK
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

   // --- 🚀 AUTO-GIG MANAGEMENT (Hardcoded Date Logic) ---
   async function manageGigs() {
       try {
           // IST (India) Timezone ke hisab se date nikalna
           const now = new Date();
           const offset = 5.5 * 60 * 60 * 1000; // India is UTC +5:30
           const istDate = new Date(now.getTime() + offset);

           const year = istDate.getUTCFullYear();
           const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
           const day = String(istDate.getUTCDate()).padStart(2, '0');

           const dateStr = `${year}-${month}-${day}`; // Format: 2026-06-17
           console.log("Checking Gigs for Date:", dateStr);

           // A. Purane delete karo (Jo aaj se pehle ke hain)
           const oldGigs = await db.collection('gigs').where('date', '<', dateStr).get();
           if (!oldGigs.empty) {
               let batch = db.batch();
               oldGigs.forEach(doc => batch.delete(doc.ref));
               await batch.commit();
               console.log(`Deleted ${oldGigs.size} expired gigs.`);
           }

           // B. Aaj ke slots check karo
           const checkGigs = await db.collection('gigs').where('date', '==', dateStr).get();

           if (checkGigs.empty) {
               console.log("No gigs found for today. Creating 3 default slots...");
               const defaultSlots = [
                   { start: "07:00 AM", end: "12:00 PM", inc: 30 },
                   { start: "12:00 PM", end: "05:00 PM", inc: 20 },
                   { start: "06:00 PM", end: "11:00 PM", inc: 50 }
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
               return `Gigs created for ${dateStr} ✅`;
           } else {
               return `Gigs already exist for ${dateStr} ✅`;
           }

       } catch (error) {
           console.error("Logical Error:", error.message);
           return "Error: " + error.message;
       }
   }

   // Routes
   app.get('/', async (req, res) => {
       const statusReport = await manageGigs();
       res.send(`<h1>Bitzo Server Status</h1><p>${statusReport}</p>`);
   });

   app.post('/dispatch-order', (req, res) => {
       io.emit('new_order_assigned', req.body);
       res.status(200).send({ success: true });
   });

   const server = http.createServer(app);
   const io = new Server(server, { cors: { origin: "*" } });

   io.on('connection', (socket) => {
       socket.on('join_order_room', (orderId) => socket.join(orderId));
       socket.on('send_location', (data) => socket.to(data.orderId).emit('receive_location', data));
   });

   const PORT = process.env.PORT || 3000;
   server.listen(PORT, () => {
       console.log(`Server running on port ${PORT}`);
       // 🔥 Sabse zaruri: Server start hote hi gigs manage karo
       manageGigs();
   });const express = require('express');
      const http = require('http');
      const { Server } = require('socket.io');
      const cors = require('cors');
      const admin = require('firebase-admin');

      const app = express();
      app.use(cors());
      app.use(express.json());

      // 1. Firebase Admin SDK
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

      // --- 🚀 AUTO-GIG MANAGEMENT (Hardcoded Date Logic) ---
      async function manageGigs() {
          try {
              // IST (India) Timezone ke hisab se date nikalna
              const now = new Date();
              const offset = 5.5 * 60 * 60 * 1000; // India is UTC +5:30
              const istDate = new Date(now.getTime() + offset);

              const year = istDate.getUTCFullYear();
              const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
              const day = String(istDate.getUTCDate()).padStart(2, '0');

              const dateStr = `${year}-${month}-${day}`; // Format: 2026-06-17
              console.log("Checking Gigs for Date:", dateStr);

              // A. Purane delete karo (Jo aaj se pehle ke hain)
              const oldGigs = await db.collection('gigs').where('date', '<', dateStr).get();
              if (!oldGigs.empty) {
                  let batch = db.batch();
                  oldGigs.forEach(doc => batch.delete(doc.ref));
                  await batch.commit();
                  console.log(`Deleted ${oldGigs.size} expired gigs.`);
              }

              // B. Aaj ke slots check karo
              const checkGigs = await db.collection('gigs').where('date', '==', dateStr).get();

              if (checkGigs.empty) {
                  console.log("No gigs found for today. Creating 3 default slots...");
                  const defaultSlots = [
                      { start: "07:00 AM", end: "12:00 PM", inc: 30 },
                      { start: "12:00 PM", end: "05:00 PM", inc: 20 },
                      { start: "06:00 PM", end: "11:00 PM", inc: 50 }
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
                  return `Gigs created for ${dateStr} ✅`;
              } else {
                  return `Gigs already exist for ${dateStr} ✅`;
              }

          } catch (error) {
              console.error("Logical Error:", error.message);
              return "Error: " + error.message;
          }
      }

      // Routes
      app.get('/', async (req, res) => {
          const statusReport = await manageGigs();
          res.send(`<h1>Bitzo Server Status</h1><p>${statusReport}</p>`);
      });

      app.post('/dispatch-order', (req, res) => {
          io.emit('new_order_assigned', req.body);
          res.status(200).send({ success: true });
      });

      const server = http.createServer(app);
      const io = new Server(server, { cors: { origin: "*" } });

      io.on('connection', (socket) => {
          socket.on('join_order_room', (orderId) => socket.join(orderId));
          socket.on('send_location', (data) => socket.to(data.orderId).emit('receive_location', data));
      });

      const PORT = process.env.PORT || 3000;
      server.listen(PORT, () => {
          console.log(`Server running on port ${PORT}`);
          // 🔥 Sabse zaruri: Server start hote hi gigs manage karo
          manageGigs();
      });const express = require('express');
         const http = require('http');
         const { Server } = require('socket.io');
         const cors = require('cors');
         const admin = require('firebase-admin');

         const app = express();
         app.use(cors());
         app.use(express.json());

         // 1. Firebase Admin SDK
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

         // --- 🚀 AUTO-GIG MANAGEMENT (Hardcoded Date Logic) ---
         async function manageGigs() {
             try {
                 // IST (India) Timezone ke hisab se date nikalna
                 const now = new Date();
                 const offset = 5.5 * 60 * 60 * 1000; // India is UTC +5:30
                 const istDate = new Date(now.getTime() + offset);

                 const year = istDate.getUTCFullYear();
                 const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
                 const day = String(istDate.getUTCDate()).padStart(2, '0');

                 const dateStr = `${year}-${month}-${day}`; // Format: 2026-06-17
                 console.log("Checking Gigs for Date:", dateStr);

                 // A. Purane delete karo (Jo aaj se pehle ke hain)
                 const oldGigs = await db.collection('gigs').where('date', '<', dateStr).get();
                 if (!oldGigs.empty) {
                     let batch = db.batch();
                     oldGigs.forEach(doc => batch.delete(doc.ref));
                     await batch.commit();
                     console.log(`Deleted ${oldGigs.size} expired gigs.`);
                 }

                 // B. Aaj ke slots check karo
                 const checkGigs = await db.collection('gigs').where('date', '==', dateStr).get();

                 if (checkGigs.empty) {
                     console.log("No gigs found for today. Creating 3 default slots...");
                     const defaultSlots = [
                         { start: "07:00 AM", end: "12:00 PM", inc: 30 },
                         { start: "12:00 PM", end: "05:00 PM", inc: 20 },
                         { start: "06:00 PM", end: "11:00 PM", inc: 50 }
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
                     return `Gigs created for ${dateStr} ✅`;
                 } else {
                     return `Gigs already exist for ${dateStr} ✅`;
                 }

             } catch (error) {
                 console.error("Logical Error:", error.message);
                 return "Error: " + error.message;
             }
         }

         // Routes
         app.get('/', async (req, res) => {
             const statusReport = await manageGigs();
             res.send(`<h1>Bitzo Server Status</h1><p>${statusReport}</p>`);
         });

         app.post('/dispatch-order', (req, res) => {
             io.emit('new_order_assigned', req.body);
             res.status(200).send({ success: true });
         });

         const server = http.createServer(app);
         const io = new Server(server, { cors: { origin: "*" } });

         io.on('connection', (socket) => {
             socket.on('join_order_room', (orderId) => socket.join(orderId));
             socket.on('send_location', (data) => socket.to(data.orderId).emit('receive_location', data));
         });

         const PORT = process.env.PORT || 3000;
         server.listen(PORT, () => {
             console.log(`Server running on port ${PORT}`);
             // 🔥 Sabse zaruri: Server start hote hi gigs manage karo
             manageGigs();
         });