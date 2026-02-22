import { io } from "socket.io-client";
const socket = io('http://localhost:3000');
socket.on('connect', () => {
    console.log('Connected to socket', socket.id);
});
socket.onAny((eventName, ...args) => {
  console.log('Got event:', eventName, args);
});
setTimeout(() => process.exit(0), 10000);
