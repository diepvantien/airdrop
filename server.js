const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 50 * 1024 * 1024 // 50MB
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Lưu trữ file tạm thời
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = './uploads';
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

// Lưu trữ thông tin phiên chia sẻ
const activeSessions = new Map();
const userSessions = new Map();

// Tạo mã chia sẻ ngẫu nhiên
function generateShareCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API tạo phiên chia sẻ
app.post('/api/create-session', (req, res) => {
    const shareCode = generateShareCode();
    const sessionId = Date.now().toString();
    
    activeSessions.set(shareCode, {
        id: sessionId,
        files: [],
        createdAt: new Date(),
        senderSocketId: null,
        receiverSocketId: null,
        isActive: true
    });
    
    res.json({ 
        success: true, 
        shareCode, 
        sessionId 
    });
});

// API upload file
app.post('/api/upload/:shareCode', upload.array('files', 10), (req, res) => {
    const { shareCode } = req.params;
    const session = activeSessions.get(shareCode);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    const uploadedFiles = req.files.map(file => ({
        id: Date.now() + Math.random(),
        originalName: file.originalname,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
        uploadedAt: new Date()
    }));
    
    session.files = uploadedFiles;
    
    // Thông báo cho receiver nếu đã kết nối
    if (session.receiverSocketId) {
        io.to(session.receiverSocketId).emit('files-available', {
            files: uploadedFiles.map(f => ({
                id: f.id,
                name: f.originalName,
                size: f.size,
                type: f.mimetype
            }))
        });
    }
    
    res.json({ 
        success: true, 
        files: uploadedFiles.map(f => ({
            id: f.id,
            name: f.originalName,
            size: f.size
        }))
    });
});

// API tải file
app.get('/api/download/:shareCode/:fileId', (req, res) => {
    const { shareCode, fileId } = req.params;
    const session = activeSessions.get(shareCode);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    const file = session.files.find(f => f.id == fileId);
    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(file.path, file.originalName);
});

// Socket.IO xử lý real-time
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Người gửi kết nối
    socket.on('join-sender', (data) => {
        const { shareCode } = data;
        const session = activeSessions.get(shareCode);
        
        if (session) {
            session.senderSocketId = socket.id;
            userSessions.set(socket.id, { shareCode, role: 'sender' });
            
            socket.emit('sender-connected', { 
                shareCode,
                sessionActive: true 
            });
            
            console.log(`Sender joined session: ${shareCode}`);
        }
    });
    
    // Người nhận kết nối
    socket.on('join-receiver', (data) => {
        const { shareCode } = data;
        const session = activeSessions.get(shareCode);
        
        if (session) {
            session.receiverSocketId = socket.id;
            userSessions.set(socket.id, { shareCode, role: 'receiver' });
            
            socket.emit('receiver-connected', { 
                shareCode,
                hasFiles: session.files.length > 0 
            });
            
            // Thông báo cho sender
            if (session.senderSocketId) {
                io.to(session.senderSocketId).emit('receiver-joined', {
                    message: 'Có người muốn nhận file của bạn'
                });
            }
            
            // Gửi danh sách file nếu có
            if (session.files.length > 0) {
                socket.emit('files-available', {
                    files: session.files.map(f => ({
                        id: f.id,
                        name: f.originalName,
                        size: f.size,
                        type: f.mimetype
                    }))
                });
            }
            
            console.log(`Receiver joined session: ${shareCode}`);
        } else {
            socket.emit('error', { message: 'Mã chia sẻ không tồn tại' });
        }
    });
    
    // Xử lý upload progress
    socket.on('upload-progress', (data) => {
        const userSession = userSessions.get(socket.id);
        if (userSession && userSession.role === 'sender') {
            const session = activeSessions.get(userSession.shareCode);
            if (session && session.receiverSocketId) {
                io.to(session.receiverSocketId).emit('upload-progress', data);
            }
        }
    });
    
    // Xử lý download progress
    socket.on('download-progress', (data) => {
        const userSession = userSessions.get(socket.id);
        if (userSession && userSession.role === 'receiver') {
            const session = activeSessions.get(userSession.shareCode);
            if (session && session.senderSocketId) {
                io.to(session.senderSocketId).emit('download-progress', data);
            }
        }
    });
    
    // Người dùng ngắt kết nối
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const userSession = userSessions.get(socket.id);
        
        if (userSession) {
            const session = activeSessions.get(userSession.shareCode);
            if (session) {
                if (userSession.role === 'sender') {
                    session.senderSocketId = null;
                    if (session.receiverSocketId) {
                        io.to(session.receiverSocketId).emit('sender-disconnected');
                    }
                } else if (userSession.role === 'receiver') {
                    session.receiverSocketId = null;
                    if (session.senderSocketId) {
                        io.to(session.senderSocketId).emit('receiver-disconnected');
                    }
                }
            }
            userSessions.delete(socket.id);
        }
    });
});

// Tự động xóa session cũ (sau 1 giờ)
setInterval(() => {
    const now = new Date();
    for (const [shareCode, session] of activeSessions.entries()) {
        const sessionAge = now - session.createdAt;
        if (sessionAge > 60 * 60 * 1000) { // 1 hour
            // Xóa files
            session.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
            activeSessions.delete(shareCode);
            console.log(`Cleaned up expired session: ${shareCode}`);
        }
    }
}, 5 * 60 * 1000); // Chạy mỗi 5 phút

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure to create a "public" folder and place your HTML, CSS, JS files there');
});