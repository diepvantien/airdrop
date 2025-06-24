// Global variables
let socket = null;
let currentUser = null;
let currentSession = null;
let selectedFiles = [];
let uploadProgress = {};
let downloadProgress = {};

// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const userSetupModal = document.getElementById('userSetupModal');
const uploadModal = document.getElementById('uploadModal');
const receiveModal = document.getElementById('receiveModal');
const heroUploadArea = document.getElementById('heroUploadArea');
const heroFileInput = document.getElementById('heroFileInput');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    try {
        // Check if user already exists in localStorage
        const savedUser = localStorage.getItem('airshare_user');
        
        if (savedUser) {
            const userData = JSON.parse(savedUser);
            await authenticateUser(userData.userId);
        } else {
            // Show user setup
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                userSetupModal.style.display = 'block';
            }, 2000);
        }
        
        // Check for share code in URL
        const urlParams = new URLSearchParams(window.location.search);
        const shareCode = urlParams.get('code');
        if (shareCode && currentUser) {
            setTimeout(() => {
                openReceiveModal();
                document.getElementById('receiveShareCode').value = shareCode;
                connectToSender();
            }, 1000);
        }
        
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification('Lỗi khởi tạo ứng dụng', 'error');
    }
}

// User management
async function createUser() {
    const userName = document.getElementById('userNameInput').value.trim();
    
    if (!userName) {
        showNotification('Vui lòng nhập tên của bạn', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/create-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = {
                id: data.userId,
                name: data.userName
            };
            
            // Save to localStorage
            localStorage.setItem('airshare_user', JSON.stringify(currentUser));
            
            // Show user ID
            document.getElementById('currentUserId').textContent = data.userId;
            document.getElementById('userIdDisplay').style.display = 'block';
            
            // Authenticate and connect
            setTimeout(async () => {
                await authenticateUser(data.userId);
                userSetupModal.style.display = 'none';
                loadingScreen.style.display = 'none';
            }, 2000);
            
        } else {
            throw new Error('Failed to create user');
        }
        
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification('Lỗi tạo tài khoản người dùng', 'error');
    }
}

async function authenticateUser(userId) {
    try {
        // Initialize socket connection
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to server');
            socket.emit('authenticate', { userId });
        });
        
        socket.on('authenticated', (data) => {
            if (data.success) {
                currentUser = data.user;
                updateUserInterface();
                setupSocketEventListeners();
                showNotification('Đã kết nối thành công!', 'success');
                loadingScreen.style.display = 'none';
            }
        });
        
        socket.on('authentication-failed', (data) => {
            console.error('Authentication failed:', data.error);
            localStorage.removeItem('airshare_user');
            location.reload();
        });
        
    } catch (error) {
        console.error('Authentication error:', error);
        showNotification('Lỗi xác thực người dùng', 'error');
    }
}

function updateUserInterface() {
    if (currentUser) {
        // Update header user info
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('currentUserName').textContent = currentUser.name;
        document.getElementById('currentUserIdSmall').textContent = currentUser.id;
        
        // Setup event listeners
        setupEventListeners();
    }
}

function setupSocketEventListeners() {
    socket.on('disconnect', () => {
        showNotification('Mất kết nối đến server', 'warning');
    });
    
    socket.on('joined-session', (data) => {
        if (data.success) {
            currentSession = data.session;
            if (data.role === 'creator') {
                updateConnectionStatus('waiting');
            } else {
                updateReceiveConnectionStatus('connected');
            }
        }
    });
    
    socket.on('join-failed', (data) => {
        showNotification('Lỗi tham gia phiên: ' + data.error, 'error');
        resetReceiveModal();
    });
    
    socket.on('participant-joined', (data) => {
        showNotification(`${data.userName} đã tham gia phiên`, 'info');
        updateParticipantCount(data.participantCount);
        updateConnectionStatus('connected');
    });
    
    socket.on('participant-left', (data) => {
        updateParticipantCount(data.participantCount);
        if (data.participantCount === 1) {
            updateConnectionStatus('waiting');
        }
    });
    
    socket.on('files-updated', (data) => {
        showAvailableFiles(data.files);
    });
    
    socket.on('upload-progress-update', (data) => {
        updateReceiverUploadProgress(data);
    });
    
    socket.on('download-progress', (data) => {
        updateSenderDownloadProgress(data);
    });
    
    socket.on('download-complete', (data) => {
        showNotification(`Hoàn thành tải: ${data.fileName}`, 'success');
        updateDownloadCount();
    });
    
    socket.on('download-ready', (data) => {
        initiateDownload(data.downloadUrl, data.fileId);
    });
}

function setupEventListeners() {
    // Hero upload area
    heroUploadArea.addEventListener('click', () => heroFileInput.click());
    heroUploadArea.addEventListener('dragover', handleDragOver);
    heroUploadArea.addEventListener('dragleave', handleDragLeave);
    heroUploadArea.addEventListener('drop', handleDrop);
    
    heroFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            openUploadModal();
            addFilesToModal(e.target.files);
        }
    });
    
    // Modal upload zone
    const uploadZone = document.getElementById('uploadZone');
    const modalFileInput = document.getElementById('modalFileInput');
    
    uploadZone.addEventListener('click', () => modalFileInput.click());
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    
    modalFileInput.addEventListener('change', (e) => {
        addFilesToModal(e.target.files);
    });
    
    // Modal close events
    [uploadModal, receiveModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal === uploadModal) closeUploadModal();
                else if (modal === receiveModal) closeReceiveModal();
            }
        });
    });
    
    // Share code input formatting
    const shareCodeInputs = document.querySelectorAll('.share-code-input');
    shareCodeInputs.forEach(input => {
        input.addEventListener('input', formatShareCodeInput);
        input.addEventListener('paste', handleShareCodePaste);
    });
    
    // User name input enter key
    document.getElementById('userNameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            createUser();
        }
    });
}

// File handling
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        if (e.currentTarget.id === 'heroUploadArea') {
            openUploadModal();
        }
        addFilesToModal(files);
    }
}

function addFilesToModal(files) {
    Array.from(files).forEach(file => {
        if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            selectedFiles.push(file);
        }
    });
    displayFiles();
    updateUploadButton();
}

function displayFiles() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileIcon = getFileIcon(file.name);
        const fileExtension = getFileExtension(file.name);
        
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon ${fileExtension}">
                    <i class="fas ${fileIcon}"></i>
                </div>
                <div class="file-details">
                    <h5 title="${file.name}">${file.name}</h5>
                    <div class="file-meta">
                        <span>${formatFileSize(file.size)}</span>
                        <span>${fileExtension.toUpperCase()}</span>
                        <span>${file.type || 'Unknown'}</span>
                    </div>
                </div>
            </div>
            <div class="file-actions">
                <button class="remove-file" onclick="removeFile(${index})" title="Xóa file">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        fileList.appendChild(fileItem);
    });
    
    updateUploadButton();
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFiles();
}

function updateUploadButton() {
    const uploadSection = document.getElementById('uploadSection');
    uploadSection.style.display = selectedFiles.length > 0 ? 'block' : 'none';
}

// Upload functionality
async function startUpload() {
    if (selectedFiles.length === 0 || !currentUser) return;
    
    try {
        // Create session
        const sessionResponse = await fetch('/api/create-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUser.id })
        });
        
        const sessionData = await sessionResponse.json();
        
        if (!sessionData.success) {
            throw new Error('Failed to create session');
        }
        
        currentSession = sessionData;
        
        // Join as creator
        socket.emit('join-as-creator', {
            shareCode: sessionData.shareCode,
            userId: currentUser.id
        });
        
        // Show progress
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('uploadProgressSection').style.display = 'block';
        
        // Upload files
        await uploadFilesWithProgress(sessionData.shareCode);
        
    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Lỗi tải lên: ' + error.message, 'error');
        resetUploadModal();
    }
}

async function uploadFilesWithProgress(shareCode) {
    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });
    
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    document.getElementById('totalSize').textContent = formatFileSize(totalSize);
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        let startTime = Date.now();
        let lastLoaded = 0;
        let lastTime = startTime;
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                const currentTime = Date.now();
                
                updateUploadProgressDisplay(progress, e.loaded, e.total);
                
                // Calculate speed
                const timeDiff = currentTime - lastTime;
                if (timeDiff > 1000) {
                    const dataDiff = e.loaded - lastLoaded;
                    const speed = dataDiff / (timeDiff / 1000);
                    
                    updateUploadSpeedDisplay(speed);
                    updateUploadETA(e.loaded, e.total, speed);
                    
                    // Emit progress to participants
                    socket.emit('upload-progress', {
                        progress: progress,
                        speed: speed,
                        loaded: e.loaded,
                        total: e.total
                    });
                    
                    lastLoaded = e.loaded;
                    lastTime = currentTime;
                }
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                showShareResult();
                resolve(response);
            } else {
                reject(new Error('Upload failed'));
            }
        });
        
        xhr.addEventListener('error', () => {
            reject(new Error('Network error'));
        });
        
        xhr.open('POST', `/api/upload/${shareCode}`);
        xhr.send(formData);
    });
}

function updateUploadProgressDisplay(progress, loaded, total) {
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const uploadedSize = document.getElementById('uploadedSize');
    
    progressBar.style.width = progress + '%';
    progressText.textContent = Math.round(progress) + '%';
    uploadedSize.textContent = formatFileSize(loaded);
}

function updateUploadSpeedDisplay(speed) {
    const uploadSpeed = document.getElementById('uploadSpeed');
    uploadSpeed.textContent = formatSpeed(speed);
}

function updateUploadETA(loaded, total, speed) {
    const uploadETA = document.getElementById('uploadETA');
    
    if (speed > 0 && loaded < total) {
        const remaining = total - loaded;
        const eta = remaining / speed;
        uploadETA.textContent = `ETA: ${formatTime(eta)}`;
    } else {
        uploadETA.textContent = 'ETA: --';
    }
}

function showShareResult() {
    document.getElementById('uploadProgressSection').style.display = 'none';
    document.getElementById('shareResult').style.display = 'block';
    
    if (currentSession) {
        document.getElementById('generatedShareCode').textContent = currentSession.shareCode;
        
        if (currentSession.qrCode) {
            const qrImage = document.getElementById('qrCodeImage');
            qrImage.src = currentSession.qrCode;
            qrImage.style.display = 'block';
            document.getElementById('downloadQRBtn').style.display = 'block';
        }
        
        if (currentSession.shareUrl) {
            document.getElementById('shareLink').value = currentSession.shareUrl;
        }
    }
    
    updateConnectionStatus('waiting');
}

// Receive functionality
function quickConnect() {
    const shareCode = document.getElementById('quickShareCode').value.trim().toUpperCase();
    if (shareCode && shareCode.length === 6) {
        openReceiveModal();
        document.getElementById('receiveShareCode').value = shareCode;
        connectToSender();
    } else {
        showNotification('Vui lòng nhập mã chia sẻ 6 ký tự', 'error');
    }
}

async function connectToSender() {
    const shareCode = document.getElementById('receiveShareCode').value.trim().toUpperCase();
    
    if (!shareCode || shareCode.length !== 6) {
        showNotification('Vui lòng nhập mã chia sẻ 6 ký tự', 'error');
        return;
    }
    
    if (!currentUser) {
        showNotification('Vui lòng đăng nhập trước', 'error');
        return;
    }
    
    // Show connection status
    updateReceiveConnectionStatus('connecting');
    
    // Join as participant
    socket.emit('join-as-participant', {
        shareCode: shareCode,
        userId: currentUser.id
    });
}

function showAvailableFiles(files) {
    updateReceiveConnectionStatus('connected');
    
    document.getElementById('availableFiles').style.display = 'block';
    
    // Update file statistics
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    document.getElementById('fileCount').textContent = `${files.length} file${files.length > 1 ? 's' : ''}`;
    document.getElementById('totalFileSize').textContent = formatFileSize(totalSize);
    
    // Display files
    const filesList = document.getElementById('availableFilesList');
    filesList.innerHTML = '';
    
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileIcon = getFileIcon(file.name);
        const fileExtension = getFileExtension(file.name);
        
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon ${fileExtension}">
                    <i class="fas ${fileIcon}"></i>
                </div>
                <div class="file-details">
                    <h5 title="${file.name}">${file.name}</h5>
                    <div class="file-meta">
                        <span>${file.sizeFormatted}</span>
                        <span>${file.extension.toUpperCase()}</span>
                        <span>${new Date(file.uploadedAt).toLocaleTimeString()}</span>
                    </div>
                </div>
            </div>
            <div class="file-actions">
                <button class="download-btn" onclick="downloadSingleFile('${file.id}')" title="Tải file này">
                    <i class="fas fa-download"></i>
                    Tải xuống
                </button>
            </div>
        `;
        
        filesList.appendChild(fileItem);
    });
}

function downloadSingleFile(fileId) {
    socket.emit('request-download', { fileId });
}

function downloadAllFiles() {
    const availableFiles = document.querySelectorAll('#availableFilesList .file-item');
    availableFiles.forEach((fileItem, index) => {
        const downloadBtn = fileItem.querySelector('.download-btn');
        setTimeout(() => {
            downloadBtn.click();
        }, index * 500); // Stagger downloads
    });
}

function initiateDownload(downloadUrl, fileId) {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = '';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Đã bắt đầu tải xuống', 'success');
}

// Progress tracking for receiver
function updateReceiverUploadProgress(data) {
    // Show upload progress from sender's perspective
    if (data.progress !== undefined) {
        showNotification(`Người gửi đang tải lên: ${Math.round(data.progress)}%`, 'info');
    }
}

// Progress tracking for sender
function updateSenderDownloadProgress(data) {
    const downloadTracking = document.getElementById('downloadTracking');
    
    if (downloadTracking && data.progress !== undefined) {
        downloadTracking.style.display = 'block';
        
        const progressBar = document.getElementById('downloadProgressBar');
        const progressText = document.getElementById('downloadProgressText');
        const downloadSpeedSender = document.getElementById('downloadSpeedSender');
        const downloadFileName = document.getElementById('downloadFileName');
        
        progressBar.style.width = data.progress + '%';
        progressText.textContent = Math.round(data.progress) + '%';
        downloadSpeedSender.textContent = formatSpeed(data.speed);
        downloadFileName.textContent = data.fileName;
    }
}

// UI update functions
function updateConnectionStatus(status) {
    const connectionStatus = document.getElementById('connectionStatus');
    
    switch (status) {
        case 'waiting':
            connectionStatus.innerHTML = '<i class="fas fa-clock"></i> <span>Đang chờ người nhận...</span>';
            connectionStatus.className = 'connection-status waiting';
            break;
        case 'connected':
            connectionStatus.innerHTML = '<i class="fas fa-users"></i> <span>Đã có người kết nối</span>';
            connectionStatus.className = 'connection-status connected';
            break;
    }
}

function updateReceiveConnectionStatus(status) {
    const receiveConnectionStatus = document.getElementById('receiveConnectionStatus');
    
    switch (status) {
        case 'connecting':
            receiveConnectionStatus.style.display = 'block';
            receiveConnectionStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Đang kết nối...</span>';
            break;
        case 'connected':
            receiveConnectionStatus.style.display = 'none';
            break;
    }
}

function updateParticipantCount(count) {
    const participantCount = document.getElementById('participantCount');
    if (participantCount) {
        participantCount.textContent = count - 1; // Exclude creator
    }
}

function updateDownloadCount() {
    const downloadCount = document.getElementById('downloadCount');
    if (downloadCount) {
        const current = parseInt(downloadCount.textContent) || 0;
        downloadCount.textContent = current + 1;
    }
}

// Modal functions
function openUploadModal() {
    if (!currentUser) {
        showNotification('Vui lòng đăng nhập trước', 'error');
        return;
    }
    uploadModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeUploadModal() {
    uploadModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetUploadModal();
}

function openReceiveModal() {
    if (!currentUser) {
        showNotification('Vui lòng đăng nhập trước', 'error');
        return;
    }
    receiveModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeReceiveModal() {
    receiveModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetReceiveModal();
}

function resetUploadModal() {
    selectedFiles = [];
    document.getElementById('fileList').innerHTML = '';
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('uploadProgressSection').style.display = 'none';
    document.getElementById('shareResult').style.display = 'none';
    currentSession = null;
}

function resetReceiveModal() {
    document.getElementById('receiveShareCode').value = '';
    document.getElementById('receiveConnectionStatus').style.display = 'none';
    document.getElementById('availableFiles').style.display = 'none';
    document.getElementById('receiveProgress').style.display = 'none';
    document.getElementById('downloadComplete').style.display = 'none';
    currentSession = null;
}

// Utility functions
function copyShareCode() {
    const shareCode = document.getElementById('generatedShareCode').textContent;
    navigator.clipboard.writeText(shareCode).then(() => {
        showNotification('Đã sao chép mã chia sẻ!', 'success');
    });
}

function copyShareLink() {
    const shareLink = document.getElementById('shareLink').value;
    navigator.clipboard.writeText(shareLink).then(() => {
        showNotification('Đã sao chép link chia sẻ!', 'success');
    });
}

function downloadQRCode() {
    const qrImage = document.getElementById('qrCodeImage');
    if (qrImage.src) {
        const link = document.createElement('a');
        link.href = qrImage.src;
        link.download = `AirShare-QR-${currentSession.shareCode}.png`;
        link.click();
    }
}

function formatShareCodeInput(e) {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length > 6) value = value.substr(0, 6);
    e.target.value = value;
}

function handleShareCodePaste(e) {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text');
    const cleaned = paste.toUpperCase().replace(/[^A-Z0-9]/g, '').substr(0, 6);
    e.target.value = cleaned;
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word', 'docx': 'fa-file-word',
        'xls': 'fa-file-excel', 'xlsx': 'fa-file-excel',
        'ppt': 'fa-file-powerpoint', 'pptx': 'fa-file-powerpoint',
        'txt': 'fa-file-alt', 'md': 'fa-file-alt',
        'jpg': 'fa-file-image', 'jpeg': 'fa-file-image', 'png': 'fa-file-image', 
        'gif': 'fa-file-image', 'bmp': 'fa-file-image', 'svg': 'fa-file-image',
        'mp4': 'fa-file-video', 'avi': 'fa-file-video', 'mov': 'fa-file-video',
        'mkv': 'fa-file-video', 'wmv': 'fa-file-video',
        'mp3': 'fa-file-audio', 'wav': 'fa-file-audio', 'flac': 'fa-file-audio',
        'zip': 'fa-file-archive', 'rar': 'fa-file-archive', '7z': 'fa-file-archive',
        'js': 'fa-file-code', 'html': 'fa-file-code', 'css': 'fa-file-code',
        'py': 'fa-file-code', 'java': 'fa-file-code', 'cpp': 'fa-file-code'
    };
    return iconMap[ext] || 'fa-file';
}

function getFileExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const extensionMap = {
        'pdf': 'pdf',
        'doc': 'word', 'docx': 'word',
        'xls': 'excel', 'xlsx': 'excel',
        'ppt': 'powerpoint', 'pptx': 'powerpoint',
        'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'bmp': 'image', 'svg': 'image',
        'mp4': 'video', 'avi': 'video', 'mov': 'video', 'mkv': 'video', 'wmv': 'video',
        'mp3': 'audio', 'wav': 'audio', 'flac': 'audio',
        'zip': 'archive', 'rar': 'archive', '7z': 'archive',
        'js': 'code', 'html': 'code', 'css': 'code', 'py': 'code', 'java': 'code', 'cpp': 'code'
    };
    return extensionMap[ext] || 'file';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
    const speeds = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let speed = bytesPerSecond;
    let unitIndex = 0;
    
    while (speed >= 1024 && unitIndex < speeds.length - 1) {
        speed /= 1024;
        unitIndex++;
    }
    
    return speed.toFixed(1) + ' ' + speeds[unitIndex];
}

function formatTime(seconds) {
    if (seconds < 60) {
        return Math.round(seconds) + ' giây';
    } else if (seconds < 3600) {
        return Math.round(seconds / 60) + ' phút';
    } else {
        return Math.round(seconds / 3600) + ' giờ';
    }
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in forwards';
        setTimeout(() => {
            if (container.contains(notification)) {
                container.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);