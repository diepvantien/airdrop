const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const qrcode = require('qrcode');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 100 * 1024 * 1024 // 100MB
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// Get local IP address
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return 'localhost';
}

const SERVER_IP = getLocalIPAddress();

// Storage setup
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
        cb(null, uniqueSuffix + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8'));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept all file types
        cb(null, true);
    }
});

// Data storage
const users = new Map(); // userId -> user info
const activeSessions = new Map(); // shareCode -> session info
const userSessions = new Map(); // socketId -> session info

// Generate unique IDs
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function generateShareCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function getFileIcon(filename) {
    const ext = path.extname(filename).toLowerCase();
    const iconMap = {
        '.pdf': 'fa-file-pdf',
        '.doc': 'fa-file-word', '.docx': 'fa-file-word',
        '.xls': 'fa-file-excel', '.xlsx': 'fa-file-excel',
        '.ppt': 'fa-file-powerpoint', '.pptx': 'fa-file-powerpoint',
        '.txt': 'fa-file-alt', '.md': 'fa-file-alt',
        '.jpg': 'fa-file-image', '.jpeg': 'fa-file-image', '.png': 'fa-file-image', 
        '.gif': 'fa-file-image', '.bmp': 'fa-file-image', '.svg': 'fa-file-image',
        '.mp4': 'fa-file-video', '.avi': 'fa-file-video', '.mov': 'fa-file-video',
        '.mkv': 'fa-file-video', '.wmv': 'fa-file-video',
        '.mp3': 'fa-file-audio', '.wav': 'fa-file-audio', '.flac': 'fa-file-audio',
        '.zip': 'fa-file-archive', '.rar': 'fa-file-archive', '.7z': 'fa-file-archive',
        '.js': 'fa-file-code', '.html': 'fa-file-code', '.css': 'fa-file-code',
        '.py': 'fa-file-code', '.java': 'fa-file-code', '.cpp': 'fa-file-code'
    };
    return iconMap[ext] || 'fa-file';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create user ID
app.post('/api/create-user', (req, res) => {
    const userId = generateUserId();
    const userName = req.body.userName || `User_${Date.now()}`;
    
    const user = {
        id: userId,
        name: userName,
        createdAt: new Date(),
        isOnline: true,
        lastSeen: new Date()
    };
    
    users.set(userId, user);
    
    res.json({
        success: true,
        userId: userId,
        userName: userName
    });
});

// Create sharing session
app.post('/api/create-session', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId || !users.has(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        const shareCode = generateShareCode();
        const sessionId = uuidv4();
        
        const session = {
            id: sessionId,
            shareCode: shareCode,
            creatorId: userId,
            createdAt: new Date(),
            files: [],
            participants: new Map(), // socketId -> userInfo
            isActive: true,
            settings: {
                maxParticipants: 10,
                allowDownload: true,
                autoExpire: true
            }
        };
        
        activeSessions.set(shareCode, session);
        
        // Generate QR code and share link
        const shareUrl = `http://${SERVER_IP}:${PORT}/receive/${shareCode}`;
        const qrCodeData = await qrcode.toDataURL(shareUrl, {
            width: 300,
            margin: 2,
            color: {
                dark: '#667eea',
                light: '#ffffff'
            }
        });
        
        res.json({
            success: true,
            shareCode,
            sessionId,
            shareUrl,
            qrCode: qrCodeData,
            serverIP: SERVER_IP
        });
        
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Upload files
app.post('/api/upload/:shareCode', (req, res) => {
    const { shareCode } = req.params;
    const session = activeSessions.get(shareCode);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    const uploadHandler = upload.array('files', 20);
    
    uploadHandler(req, res, (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(500).json({ error: 'Upload failed: ' + err.message });
        }
        
        const uploadedFiles = req.files.map(file => {
            const fileInfo = {
                id: uuidv4(),
                originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
                filename: file.filename,
                size: file.size,
                mimetype: file.mimetype,
                path: file.path,
                uploadedAt: new Date(),
                uploadedBy: session.creatorId,
                icon: getFileIcon(file.originalname),
                extension: path.extname(file.originalname).toLowerCase(),
                sizeFormatted: formatFileSize(file.size)
            };
            return fileInfo;
        });
        
        session.files.push(...uploadedFiles);
        
        // Notify all participants about new files
        session.participants.forEach((participant, socketId) => {
            io.to(socketId).emit('files-updated', {
                files: session.files.map(f => ({
                    id: f.id,
                    name: f.originalName,
                    size: f.size,
                    sizeFormatted: f.sizeFormatted,
                    type: f.mimetype,
                    icon: f.icon,
                    extension: f.extension,
                    uploadedAt: f.uploadedAt
                }))
            });
        });
        
        res.json({
            success: true,
            files: uploadedFiles.map(f => ({
                id: f.id,
                name: f.originalName,
                size: f.size,
                sizeFormatted: f.sizeFormatted,
                icon: f.icon
            }))
        });
    });
});

// Download single file
app.get('/api/download/:shareCode/:fileId', (req, res) => {
    const { shareCode, fileId } = req.params;
    const session = activeSessions.get(shareCode);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    const file = session.files.find(f => f.id === fileId);
    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    if (!fs.existsSync(file.path)) {
        return res.status(404).json({ error: 'File no longer exists' });
    }
    
    const stat = fs.statSync(file.path);
    const fileSize = stat.size;
    
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    const fileStream = fs.createReadStream(file.path);
    let downloadedBytes = 0;
    const startTime = Date.now();
    
    fileStream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = (downloadedBytes / fileSize) * 100;
        const currentTime = Date.now();
        const duration = (currentTime - startTime) / 1000;
        const speed = downloadedBytes / duration; // bytes per second
        
        // Notify creator about download progress
        const creatorSocket = Array.from(session.participants.entries())
            .find(([socketId, participant]) => participant.userId === session.creatorId);
        
        if (creatorSocket) {
            io.to(creatorSocket[0]).emit('download-progress', {
                fileId: file.id,
                fileName: file.originalName,
                progress: progress,
                speed: speed,
                downloadedBytes: downloadedBytes,
                totalBytes: fileSize
            });
        }
    });
    
    fileStream.on('end', () => {
        // Notify completion
        const creatorSocket = Array.from(session.participants.entries())
            .find(([socketId, participant]) => participant.userId === session.creatorId);
        
        if (creatorSocket) {
            io.to(creatorSocket[0]).emit('download-complete', {
                fileId: file.id,
                fileName: file.originalName
            });
        }
    });
    
    fileStream.pipe(res);
});

// Get session info
app.get('/api/session/:shareCode', (req, res) => {
    const { shareCode } = req.params;
    const session = activeSessions.get(shareCode);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({
        success: true,
        session: {
            shareCode: session.shareCode,
            createdAt: session.createdAt,
            fileCount: session.files.length,
            participantCount: session.participants.size,
            files: session.files.map(f => ({
                id: f.id,
                name: f.originalName,
                size: f.size,
                sizeFormatted: f.sizeFormatted,
                type: f.mimetype,
                icon: f.icon,
                extension: f.extension,
                uploadedAt: f.uploadedAt
            }))
        }
    });
});

// Receive page redirect
app.get('/receive/:shareCode', (req, res) => {
    const { shareCode } = req.params;
    const session = activeSessions.get(shareCode);
    
    if (!session) {
        return res.status(404).send(`
            <html>
                <head>
                    <title>Mã không hợp lệ - AirShare Pro</title>
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
                        .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                        h1 { color: #e53e3e; }
                        .btn { background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>⚠️ Mã chia sẻ không tồn tại</h1>
                        <p>Mã chia sẻ <strong>${shareCode}</strong> không hợp lệ hoặc đã hết hạn.</p>
                        <p>Vui lòng kiểm tra lại mã chia sẻ từ người gửi.</p>
                        <a href="/" class="btn">Về trang chủ</a>
                    </div>
                </body>
            </html>
        `);
    }
    
    res.redirect(`/?code=${shareCode}`);
});

// Socket.IO handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // User authentication
    socket.on('authenticate', (data) => {
        const { userId } = data;
        const user = users.get(userId);
        
        if (user) {
            user.isOnline = true;
            user.lastSeen = new Date();
            user.socketId = socket.id;
            userSessions.set(socket.id, { userId: userId });
            
            socket.emit('authenticated', {
                success: true,
                user: user
            });
        } else {
            socket.emit('authentication-failed', {
                error: 'Invalid user ID'
            });
        }
    });
    
    // Join session as creator
    socket.on('join-as-creator', (data) => {
        const { shareCode, userId } = data;
        const session = activeSessions.get(shareCode);
        const user = users.get(userId);
        
        if (session && user && session.creatorId === userId) {
            session.participants.set(socket.id, {
                userId: userId,
                userName: user.name,
                role: 'creator',
                joinedAt: new Date()
            });
            
            userSessions.set(socket.id, {
                userId: userId,
                shareCode: shareCode,
                role: 'creator'
            });
            
            socket.emit('joined-session', {
                success: true,
                role: 'creator',
                session: {
                    shareCode: session.shareCode,
                    participantCount: session.participants.size,
                    fileCount: session.files.length
                }
            });
            
            console.log(`Creator ${user.name} joined session: ${shareCode}`);
        } else {
            socket.emit('join-failed', { error: 'Invalid session or permissions' });
        }
    });
    
    // Join session as participant
    socket.on('join-as-participant', (data) => {
        const { shareCode, userId } = data;
        const session = activeSessions.get(shareCode);
        const user = users.get(userId);
        
        if (session && user) {
            if (session.participants.size >= session.settings.maxParticipants) {
                socket.emit('join-failed', { error: 'Session is full' });
                return;
            }
            
            session.participants.set(socket.id, {
                userId: userId,
                userName: user.name,
                role: 'participant',
                joinedAt: new Date()
            });
            
            userSessions.set(socket.id, {
                userId: userId,
                shareCode: shareCode,
                role: 'participant'
            });
            
            socket.emit('joined-session', {
                success: true,
                role: 'participant',
                session: {
                    shareCode: session.shareCode,
                    participantCount: session.participants.size,
                    fileCount: session.files.length
                }
            });
            
            // Send available files
            if (session.files.length > 0) {
                socket.emit('files-updated', {
                    files: session.files.map(f => ({
                        id: f.id,
                        name: f.originalName,
                        size: f.size,
                        sizeFormatted: f.sizeFormatted,
                        type: f.mimetype,
                        icon: f.icon,
                        extension: f.extension,
                        uploadedAt: f.uploadedAt
                    }))
                });
            }
            
            // Notify creator about new participant
            const creatorSocket = Array.from(session.participants.entries())
                .find(([socketId, participant]) => participant.role === 'creator');
            
            if (creatorSocket) {
                io.to(creatorSocket[0]).emit('participant-joined', {
                    userName: user.name,
                    participantCount: session.participants.size
                });
            }
            
            console.log(`Participant ${user.name} joined session: ${shareCode}`);
        } else {
            socket.emit('join-failed', { error: 'Session not found' });
        }
    });
    
    // Upload progress
    socket.on('upload-progress', (data) => {
        const userSession = userSessions.get(socket.id);
        if (userSession && userSession.role === 'creator') {
            const session = activeSessions.get(userSession.shareCode);
            if (session) {
                // Broadcast to all participants
                session.participants.forEach((participant, socketId) => {
                    if (socketId !== socket.id) {
                        io.to(socketId).emit('upload-progress-update', data);
                    }
                });
            }
        }
    });
    
    // Download request
    socket.on('request-download', (data) => {
        const { fileId } = data;
        const userSession = userSessions.get(socket.id);
        
        if (userSession) {
            const session = activeSessions.get(userSession.shareCode);
            if (session) {
                const file = session.files.find(f => f.id === fileId);
                if (file) {
                    socket.emit('download-ready', {
                        fileId: fileId,
                        downloadUrl: `/api/download/${userSession.shareCode}/${fileId}`
                    });
                }
            }
        }
    });
    
    // Disconnect handling
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const userSession = userSessions.get(socket.id);
        if (userSession) {
            const session = activeSessions.get(userSession.shareCode);
            if (session) {
                session.participants.delete(socket.id);
                
                // Notify remaining participants
                session.participants.forEach((participant, socketId) => {
                    io.to(socketId).emit('participant-left', {
                        participantCount: session.participants.size
                    });
                });
                
                // Clean up empty sessions
                if (session.participants.size === 0) {
                    // Don't delete immediately, allow reconnection
                    setTimeout(() => {
                        if (session.participants.size === 0) {
                            activeSessions.delete(userSession.shareCode);
                            console.log(`Cleaned up empty session: ${userSession.shareCode}`);
                        }
                    }, 5 * 60 * 1000); // 5 minutes
                }
            }
            
            // Update user status
            const user = users.get(userSession.userId);
            if (user) {
                user.isOnline = false;
                user.lastSeen = new Date();
                delete user.socketId;
            }
        }
        
        userSessions.delete(socket.id);
    });
});

// Cleanup expired sessions
setInterval(() => {
    const now = new Date();
    for (const [shareCode, session] of activeSessions.entries()) {
        const sessionAge = now - session.createdAt;
        if (sessionAge > 4 * 60 * 60 * 1000) { // 4 hours
            // Delete files
            session.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
            activeSessions.delete(shareCode);
            console.log(`Cleaned up expired session: ${shareCode}`);
        }
    }
}, 15 * 60 * 1000); // Every 15 minutes

// Cleanup inactive users
setInterval(() => {
    const now = new Date();
    for (const [userId, user] of users.entries()) {
        const inactiveTime = now - user.lastSeen;
        if (inactiveTime > 24 * 60 * 60 * 1000 && !user.isOnline) { // 24 hours
            users.delete(userId);
            console.log(`Cleaned up inactive user: ${userId}`);
        }
    }
}, 60 * 60 * 1000); // Every hour

server.listen(PORT, () => {
    console.log(`AirShare Pro Server running on http://${SERVER_IP}:${PORT}`);
    console.log(`Local IP: ${SERVER_IP}`);
    console.log('Make sure devices are on the same WiFi network');
});