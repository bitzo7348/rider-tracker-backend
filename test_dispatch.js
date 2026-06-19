// test_dispatch.js

// 📍 APNA RENDER LIVE SERVER URL YAHAN REPLACE KAREIN (e.g., https://my-app.onrender.com)
const renderServerUrl = "https://rider-tracker-backend-api.onrender.com";

const url = `${renderServerUrl}/dispatch-order`;

const payload = {
  riderId: "AuWZgJDv2rNUnKIgpLuCyrs5Wwj2", // Target Rider ID (FCM token must be synced in Firestore!)
  restaurant: "Test Restaurant",
  payout: 60,
  paymentMode: "COD",
  total_amount: 95.08,
  restaurantLat: 22.8420,
  restaurantLng: 69.7250,
  address: {
    name: "hahshha",
    phone: "9988776655",
    houseNo: "zsaa, B 64/1",
    area: "Mundra",
    landmark: "Near Sadau Road",
    lat: 22.8390,
    lng: 69.7290
  }
};

console.log("Sending dispatch trigger to Render server...");

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})
.then(res => {
  if (!res.ok) {
    throw new Error(`HTTP Error! Status: ${res.status}`);
  }
  return res.json();
})
.then(data => {
  console.log("FCM Dispatch Response from Render: ✅", data);
})
.catch(err => {
  console.error("FCM Dispatch Error: 🔴", err);
});