import { io } from "socket.io-client";
const socket = io('http://localhost:3000');
socket.on('connect', () => {
    console.log('Connected to socket', socket.id);
});
socket.on('detection', (data) => {
    console.log('Detection event:', data.camera_id);
});
setTimeout(() => process.exit(0), 5000);
