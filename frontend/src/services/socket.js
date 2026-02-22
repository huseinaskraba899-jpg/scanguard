import { io } from "socket.io-client";

// Initialize socket connection to backend
export const socket = io("http://localhost:3000", {
    autoConnect: false,
});

export const connectSocket = (token) => {
    socket.auth = { token };
    socket.connect();
};

export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
    }
};
