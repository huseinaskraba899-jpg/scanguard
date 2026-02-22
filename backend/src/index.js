require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const cvRoutes = require("./routes/cv");
const pool = require("./db");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.set("io", io);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("short"));
app.use(express.json({ limit: "10mb" })); // snapshots can be large

// Routes
app.use("/api/cv", cvRoutes);

// Health check
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "error", error: err.message });
  }
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join tenant/location rooms for scoped alerts
  socket.on("join:tenant", (tenantId) => {
    socket.join(`tenant:${tenantId}`);
  });

  socket.on("join:location", (locationId) => {
    socket.join(`location:${locationId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Start
server.listen(PORT, () => {
  console.log(`ScanGuard Backend listening on port ${PORT}`);
});
