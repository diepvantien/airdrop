const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const compression = require('compression');
const Database = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const CDN_URL = process.env.CDN_URL || 'https://your-cdn.com';
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const FILE_EXPIRY_HOURS = 24; // Files expire after 24 hours

// Initialize database
const db = new Database();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 uploads per window
    message: { error: 'Quá nhiều upload, vui lòng thử lại sau 15 phút' }
});

const downloadLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 downloads per minute
    message: { error: 'Quá nhiều download, vui lòng thử lại sau' }
});

// Configure multer for chunked upload
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            await fs.mkdir(UPLOAD_DIR, { recursive: true });
            cb(null, UPLOAD_DIR);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const fileId = crypto.randomUUID();
        const ext = path.extname(file.originalname);
        cb(null, `${fileId}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: (req, file, cb) => {
        // Basic security - block executable files
        const dangerousExts = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.vbs', '.js'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (dangerousExts.includes(ext)) {
            return cb(new Error('File type not allowed'));
        }
        cb(null, true);
    }
});

// Cleanup expired files
async function cleanupExpiredFiles() {
    try {
        const expiredFiles = await db.getExpiredFiles();
        
        for (const file of expiredFiles) {
            try {
                await fs.unlink(path.join(UPLOAD_DIR, file.filename));
                await db.deleteFile(file.id);
                console.log(`Deleted expired file: ${file.filename}`);
            } catch (error) {
                console.error(`Error deleting file ${file.filename}:`, error);
            }
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Run cleanup every hour
setInterval(cleanupExpiredFiles, 60 * 60 * 1000);

// Routes
app.post('/api/upload', uploadLimiter, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const fileId = crypto.randomUUID();
        const accessToken = crypto.randomBytes(32).toString('hex');
        const expiryDate = new Date(Date.now() + FILE_EXPIRY_HOURS * 60 * 60 * 1000);

        // Save file metadata to database
        await db.saveFile({
            id: fileId,
            original_name: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            access_token: accessToken,
            download_count: 0,
            expires_at: expiryDate,
            created_at: new Date()
        });

        // Generate CDN URL
        const cdnUrl = `${CDN_URL}/files/${req.file.filename}`;
        const shareUrl = `${req.protocol}://${req.get('host')}/download/${fileId}?token=${accessToken}`;

        res.json({
            success: true,
            fileId,
            shareUrl,
            cdnUrl,
            expiresAt: expiryDate.toISOString(),
            filename: req.file.originalname,
            size: req.file.size
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Lỗi server khi upload file' });
    }
});

app.get('/api/file/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { token } = req.query;

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const file = await db.getFile(fileId, token);

        if (!file) {
            return res.status(404).json({ error: 'File không tồn tại hoặc đã hết hạn' });
        }

        // Check if file has expired
        if (new Date() > new Date(file.expires_at)) {
            await db.deleteFile(fileId);
            return res.status(410).json({ error: 'File đã hết hạn' });
        }

        res.json({
            id: file.id,
            originalName: file.original_name,
            size: file.size,
            mimetype: file.mimetype,
            downloadCount: file.download_count,
            expiresAt: file.expires_at,
            cdnUrl: `${CDN_URL}/files/${file.filename}`
        });

    } catch (error) {
        console.error('Get file error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.get('/api/download/:fileId', downloadLimiter, async (req, res) => {
    try {
        const { fileId } = req.params;
        const { token } = req.query;

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const file = await db.getFile(fileId, token);

        if (!file) {
            return res.status(404).json({ error: 'File không tồn tại' });
        }

        // Check if file has expired
        if (new Date() > new Date(file.expires_at)) {
            await db.deleteFile(fileId);
            return res.status(410).json({ error: 'File đã hết hạn' });
        }

        const filePath = path.join(UPLOAD_DIR, file.filename);

        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'File không tồn tại trên server' });
        }

        // Increment download count
        await db.incrementDownloadCount(fileId);

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', file.mimetype);
        res.setHeader('Content-Length', file.size);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // Stream file
        const fileStream = require('fs').createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('File stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Lỗi khi tải file' });
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Chunked upload endpoint
app.post('/api/upload/chunk', uploadLimiter, express.raw({ limit: '10mb' }), async (req, res) => {
    try {
        const { chunkIndex, totalChunks, fileId, fileName } = req.headers;
        
        if (!chunkIndex || !totalChunks || !fileId || !fileName) {
            return res.status(400).json({ error: 'Missing required headers' });
        }

        const chunkDir = path.join(UPLOAD_DIR, 'chunks', fileId);
        await fs.mkdir(chunkDir, { recursive: true });

        const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);
        await fs.writeFile(chunkPath, req.body);

        // Check if all chunks are uploaded
        const uploadedChunks = await fs.readdir(chunkDir);
        
        if (uploadedChunks.length === parseInt(totalChunks)) {
            // Merge chunks
            const finalPath = path.join(UPLOAD_DIR, `${fileId}${path.extname(fileName)}`);
            const writeStream = require('fs').createWriteStream(finalPath);

            for (let i = 0; i < parseInt(totalChunks); i++) {
                const chunkPath = path.join(chunkDir, `chunk-${i}`);
                const chunkData = await fs.readFile(chunkPath);
                writeStream.write(chunkData);
            }

            writeStream.end();

            // Clean up chunk directory
            await fs.rmdir(chunkDir, { recursive: true });

            // Get file stats
            const stats = await fs.stat(finalPath);
            
            // Save to database
            const accessToken = crypto.randomBytes(32).toString('hex');
            const expiryDate = new Date(Date.now() + FILE_EXPIRY_HOURS * 60 * 60 * 1000);

            await db.saveFile({
                id: fileId,
                original_name: fileName,
                filename: path.basename(finalPath),
                size: stats.size,
                mimetype: 'application/octet-stream',
                access_token: accessToken,
                download_count: 0,
                expires_at: expiryDate,
                created_at: new Date()
            });

            const shareUrl = `${req.protocol}://${req.get('host')}/download/${fileId}?token=${accessToken}`;

            res.json({
                success: true,
                fileId,
                shareUrl,
                expiresAt: expiryDate.toISOString()
            });
        } else {
            res.json({ 
                success: true, 
                message: `Chunk ${chunkIndex} uploaded` 
            });
        }

    } catch (error) {
        console.error('Chunk upload error:', error);
        res.status(500).json({ error: 'Lỗi khi upload chunk' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File quá lớn (tối đa 5GB)' });
        }
    }
    
    res.status(500).json({ error: 'Lỗi server' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Upload directory: ${UPLOAD_DIR}`);
    console.log(`CDN URL: ${CDN_URL}`);
});