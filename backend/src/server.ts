import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';

app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// Mock database memory storage
interface User {
  id: string;
  name: string;
  lat: number;
  lng: number;
  socketId?: string;
  photo?: string; // base64 or data URL
  interests?: string[];
  country?: string;
  friends?: string[];
}

const users: Map<string, User> = new Map();

// REST API for spatial matching (Haversine Formula)
app.post('/api/nearby', (req:Request, res:Response) => {
  const { userId, name, lat, lng, radiusKm, country } = req.body;
  if (!userId || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // Update or register user location and profile metadata
  const existingUser = users.get(userId) || { id: userId, name: name || `User_${userId.slice(0,4)}`, lat, lng, country } as User;
  existingUser.lat = lat;
  existingUser.lng = lng;
  existingUser.name = name || existingUser.name;
  if (country) existingUser.country = country;
  users.set(userId, existingUser);

  const R = 6371; // Earth radius in km
  const nearbyUsers: User[] = [];

  users.forEach((u) => {
    if (u.id === userId) return;
    const dLat = ((u.lat - lat) * Math.PI) / 180;
    const dLng = ((u.lng - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat * Math.PI) / 180) * Math.cos((u.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance <= (radiusKm || 50)) {
      nearbyUsers.push(u);
    }
  });

  res.json({ success: true, matches: nearbyUsers });
});

// upload profile photo (base64/data URL)
app.post('/api/upload-photo', (req:Request, res:Response) => {
  const { userId, photo } = req.body;
  if (!userId || !photo) return res.status(400).json({ error: 'Missing parameters' });
  const u = users.get(userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.photo = photo;
  users.set(userId, u);
  res.json({ success: true });
});

// simple AI suggest endpoint (placeholder)
app.post('/api/ai-suggest', (req:Request, res:Response) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });
  // very simple canned suggestions for demo
  const suggestions = [
    `That's interesting — tell me more about ${message.slice(0,20)}...`,
    `I like that. How did you get into ${message.slice(0,20)}?`,
    `Nice! What are your favorite hobbies related to ${message.slice(0,20)}?`,
  ];
  res.json({ success: true, suggestions });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.ALLOWED_ORIGIN || '*', methods: ['GET', 'POST'] }
});

// Socket.io Signalling & Real-Time Messaging Core
io.on('connection', (socket: Socket) => {
  const userId = socket.handshake.query.userId as string;
  if (userId) {
    // ensure user record exists so messages/calls can be routed even if
    // the client hasn't yet POSTed location data
    const user = users.get(userId) || { id: userId, name: `User_${userId.slice(0,4)}`, lat: 0, lng: 0 };
    user.socketId = socket.id;
    users.set(userId, user);
  }

  // Messaging System
  socket.on('send-message', ({ toUserId, text }) => {
    const target = users.get(toUserId);
    if (target?.socketId) {
      io.to(target.socketId).emit('receive-message', { fromUserId: userId, text, timestamp: Date.now() });
    }
  });

  // File sharing
  socket.on('send-file', ({ toUserId, file }) => {
    const target = users.get(toUserId);
    if (target?.socketId) {
      io.to(target.socketId).emit('receive-file', { fromUserId: userId, file, timestamp: Date.now() });
    }
  });

  // WebRTC Video Calling Signaling Events
  // Accept either a targetUserId or a direct targetSocketId for flexibility
  socket.on('call-user', ({ targetUserId, targetSocketId, offer }) => {
    let targetSocket: string | undefined;
    if (targetSocketId) targetSocket = targetSocketId;
    else if (targetUserId) targetSocket = users.get(targetUserId)?.socketId;

    if (targetSocket) {
      io.to(targetSocket).emit('incoming-call', { fromSocketId: socket.id, fromUserId: userId, offer });
    }
  });

  // hangup / end call
  socket.on('hangup', ({ toSocketId }) => {
    if (toSocketId) io.to(toSocketId).emit('call-ended', { fromSocketId: socket.id });
  });

  // friend requests
  socket.on('add-friend', ({ targetUserId }) => {
    const target = users.get(targetUserId);
    if (!target) return;
    // for simplicity, auto-accept and add to both friend lists
    const me = users.get(userId!);
    if (me) {
      me.friends = Array.from(new Set([...(me.friends||[]), targetUserId]));
      users.set(userId!, me);
    }
    target.friends = Array.from(new Set([...(target.friends||[]), userId!]));
    users.set(targetUserId, target);
    if (target.socketId) io.to(target.socketId).emit('friend-added', { fromUserId: userId });
  });

  socket.on('answer-call', ({ toSocketId, answer }) => {
    io.to(toSocketId).emit('call-answered', { answer });
  });

  socket.on('ice-candidate', ({ toSocketId, candidate }) => {
    io.to(toSocketId).emit('ice-candidate', { candidate });
  });

  socket.on('disconnect', () => {
    if (userId) {
      const user = users.get(userId);
      if (user) {
        user.socketId = undefined;
        users.set(userId, user);
      }
    }
  });
});

httpServer.listen(PORT, () => console.log(`Server executing seamlessly on port ${PORT}`));
