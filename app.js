// Kết nối Socket.IO
const socket = io();

// Biến global
let selectedFiles = [];
let currentSession = null;
let uploadProgress = {};
let downloadProgress = {};

// DOM Elements
const uploadModal = document.getElementById('uploadModal');
const receiveModal = document.getElementById('receiveModal');
const heroUploadArea = document.getElementById('heroUploadArea');
const heroFileInput = document.getElementById('heroFileInput');

// Khởi tạo khi trang load
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    detectNetworkInfo();
});

function initializeApp() {
    console.log('AirShare initialized');
    
    // Socket event listeners
    socket.on('connect', () => {
        console.log('Connected to server');
        showNotification('Đã kết nối đến server', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showNotification('Mất kết nối đến server', 'warning');
    });
    
    socket.on('sender-connected', (data) => {
        console.log('Sender connected:', data);
        currentSession = data;
        updateConnectionStatus('connected');
    });
    
    socket.on('receiver-connected', (data) => {
        console.log('Receiver connected:', data);
        showNotification('Có người muốn nhận file của bạn!', 'info');
        updateConnectionStatus('receiver-connected');
    });
    
    socket.on('receiver-joined', (data) => {
        showNotification(data.message, 'info');
        updateConnectionStatus('receiver-connected');
    });
    
    socket.on('files-available', (data) => {
        console.log('Files available:', data);
        showAvailableFiles(data.files);
    });
    
    socket.on('upload-progress', (data) => {
        updateSenderDownloadProgress(data);
    });
    
    socket.on('download-progress', (data) => {
        updateReceiverUploadProgress(data);
    });
    
    socket.on('error', (data) => {
        console.error('Socket error:', data);
        showNotification(data.message, 'error');
    });
    
    socket.on('sender-disconnected', () => {
        showNotification('Người gửi đã ngắt kết nối', 'warning');
        resetReceiveModal();
    });
    
    socket.on('receiver-disconnected', () => {
        showNotification('Người nhận đã ngắt kết nối', 'warning');
        updateConnectionStatus('waiting');
    });
}

function setupEventListeners() {
    // Hero upload area
    heroUploadArea.addEventListener('click', () => {
        heroFileInput.click();
    });
    
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
    
    uploadZone.addEventListener('click', () => {
        modalFileInput.click();
    });
    
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    
    modalFileInput.addEventListener('change', (e) => {
        addFilesToModal(e.target.files);
    });
    
    // Close modals when clicking outside
    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
            closeUploadModal();
        }
    });
    
    receiveModal.addEventListener('click', (e) => {
        if (e.target === receiveModal) {
            closeReceiveModal();
        }
    });
    
    // Share code input formatting
    const shareCodeInputs = document.querySelectorAll('.share-code-input');
    shareCodeInputs.forEach(input => {
        input.addEventListener('input', formatShareCodeInput);
        input.addEventListener('paste', handleShareCodePaste);
    });
}

function detectNetworkInfo() {
    // Giả lập thông tin mạng (trong thực tế sẽ cần API để lấy thông tin thật)
    const networkName = document.getElementById('networkName');
    const deviceCount = document.getElementById('deviceCount');
    
    // Simulate network detection
    setTimeout(() => {
        networkName.textContent = 'WiFi-Network-' + Math.floor(Math.random() * 1000);
        deviceCount.textContent = Math.floor(Math.random() * 10) + 1 + ' thiết bị online';
    }, 1000);
}

// File handling functions
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
        
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="fas ${fileIcon}"></i>
                </div>
                <div class="file-details">
                    <h5>${file.name}</h5>
                    <span>${formatFileSize(file.size)}</span>
                </div>
            </div>
            <button class="remove-file" onclick="removeFile(${index})">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        fileList.appendChild(fileItem);
    });
    
    // Show upload section if files exist
    const uploadSection = document.getElementById('uploadSection');
    uploadSection.style.display = selectedFiles.length > 0 ? 'block' : 'none';
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFiles();
    updateUploadButton();
}

function updateUploadButton() {
    const uploadSection = document.getElementById('uploadSection');
    uploadSection.style.display = selectedFiles.length > 0 ? 'block' : 'none';
}

// Upload functions
async function startUpload() {
    if (selectedFiles.length === 0) return;
    
    try {
        // Create session first
        const response = await fetch('/api/create-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const sessionData = await response.json();
        
        if (!sessionData.success) {
            throw new Error('Failed to create session');
        }
        
        currentSession = sessionData;
        
        // Join as sender
        socket.emit('join-sender', { shareCode: sessionData.shareCode });
        
        // Show progress section
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('uploadProgressSection').style.display = 'block';
        
        // Upload files
        await uploadFiles(sessionData.shareCode);
        
    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Lỗi khi tải lên: ' + error.message, 'error');
    }
}

async function uploadFiles(shareCode) {
    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });
    
    // Upload with progress tracking
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            updateUploadProgress(progress, e.loaded, e.total);
        }
    });
    
    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            showShareResult(shareCode);
        } else {
            showNotification('Lỗi khi tải lên file', 'error');
        }
    });
    
    xhr.addEventListener('error', () => {
        showNotification('Lỗi kết nối khi tải lên', 'error');
    });
    
    xhr.open('POST', `/api/upload/${shareCode}`);
    xhr.send(formData);
}

function updateUploadProgress(progress, loaded, total) {
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const uploadSpeed = document.getElementById('uploadSpeed');
    const uploadETA = document.getElementById('uploadETA');
    
    progressBar.style.width = progress + '%';
    progressText.textContent = Math.round(progress) + '%';
    
    // Calculate speed and ETA
    const currentTime = Date.now();
    if (!uploadProgress.startTime) {
        uploadProgress.startTime = currentTime;
        uploadProgress.lastUpdate = currentTime;
        uploadProgress.lastLoaded = loaded;
    }
    
    const timeDiff = currentTime - uploadProgress.lastUpdate;
    if (timeDiff > 1000) { // Update every second
        const dataDiff = loaded - uploadProgress.lastLoaded;
        const speed = dataDiff / (timeDiff / 1000); // bytes per second
        
        uploadSpeed.textContent = formatSpeed(speed);
        
        if (speed > 0 && progress < 100) {
            const remaining = total - loaded;
            const eta = remaining / speed;
            uploadETA.textContent = 'Ước tính: ' + formatTime(eta);
        }
        
        uploadProgress.lastUpdate = currentTime;
        uploadProgress.lastLoaded = loaded;
    }
}

function showShareResult(shareCode) {
    document.getElementById('uploadProgressSection').style.display = 'none';
    document.getElementById('shareResult').style.display = 'block';
    document.getElementById('generatedShareCode').textContent = shareCode;
    
    updateConnectionStatus('waiting');
}

function updateConnectionStatus(status) {
    const connectionStatus = document.getElementById('connectionStatus');
    
    switch (status) {
        case 'waiting':
            connectionStatus.innerHTML = '<i class="fas fa-clock"></i> <span>Đang chờ người nhận kết nối...</span>';
            connectionStatus.className = 'connection-status waiting';
            break;
        case 'connected':
            connectionStatus.innerHTML = '<i class="fas fa-wifi"></i> <span>Đã kết nối thành công!</span>';
            connectionStatus.className = 'connection-status connected';
            break;
        case 'receiver-connected':
            connectionStatus.innerHTML = '<i class="fas fa-users"></i> <span>Người nhận đã kết nối</span>';
            connectionStatus.className = 'connection-status connected';
            break;
    }
}

// Receive functions
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
    
    // Show connection status
    document.getElementById('receiveConnectionStatus').style.display = 'block';
    document.getElementById('receiveConnectionStatus').innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        <span>Đang kết nối với mã: ${shareCode}...</span>
    `;
    
    // Join as receiver
    socket.emit('join-receiver', { shareCode });
    currentSession = { shareCode };
}

function showAvailableFiles(files) {
    document.getElementById('receiveConnectionStatus').style.display = 'none';
    document.getElementById('availableFiles').style.display = 'block';
    
    const filesList = document.getElementById('availableFilesList');
    filesList.innerHTML = '';
    
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="fas ${getFileIcon(file.name)}"></i>
                </div>
                <div class="file-details">
                    <h5>${file.name}</h5>
                    <span>${formatFileSize(file.size)}</span>
                </div>
            </div>
        `;
        filesList.appendChild(fileItem);
    });
}

function downloadAllFiles() {
    if (!currentSession) return;
    
    document.getElementById('availableFiles').style.display = 'none';
    document.getElementById('receiveProgress').style.display = 'block';
    
    // Simulate download (in real implementation, this would download files)
    simulateDownload();
}

function simulateDownload() {
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            showDownloadComplete();
        }
        
        updateReceiveProgress(progress);
        
        // Simulate progress reporting to sender
        socket.emit('download-progress', {
            progress: progress,
            speed: Math.random() * 5 + 1 // MB/s
        });
        
    }, 500);
}

function updateReceiveProgress(progress) {
    const progressBar = document.getElementById('receiveProgressBar');
    const progressText = document.getElementById('receiveProgressText');
    
    progressBar.style.width = progress + '%';
    progressText.textContent = Math.round(progress) + '%';
}

function showDownloadComplete() {
    document.getElementById('receiveProgress').style.display = 'none';
    document.getElementById('downloadComplete').style.display = 'block';
    
    showNotification('Tải xuống hoàn tất!', 'success');
}

function updateSenderDownloadProgress(data) {
    const downloadTracking = document.getElementById('downloadTracking');
    const downloadProgressBar = document.getElementById('downloadProgressBar');
    const downloadProgressText = document.getElementById('downloadProgressText');
    const downloadSpeed = document.getElementById('downloadSpeed');
    
    if (downloadTracking) {
        downloadTracking.style.display = 'block';
        downloadProgressBar.style.width = data.progress + '%';
        downloadProgressText.textContent = Math.round(data.progress) + '%';
        downloadSpeed.textContent = data.speed.toFixed(1) + ' MB/s';
    }
}

// Modal functions
function openUploadModal() {
    uploadModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeUploadModal() {
    uploadModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetUploadModal();
}

function openReceiveModal() {
    receiveModal.style.display = 'block