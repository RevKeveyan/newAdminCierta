const express = require("express");
const productRoutes = require("./routes/productRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
require("./cron/statsCron"); // запускаем крон при старте сервера

const statsRoutes = require("./routes/ststsRoutes");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));



app.use("/api/stats", statsRoutes);
app.use("/api/products", productRoutes);
app.use("/api/products/:parentId/reviews", reviewRoutes); // 👈 подмодель

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something broke!" });
});

module.exports = app;
