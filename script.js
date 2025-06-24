// Mobile Navigation Toggle
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');

navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        navToggle.classList.remove('active');
    });
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Modal functionality
const uploadModal = document.getElementById('uploadModal');
const receiveModal = document.getElementById('receiveModal');
let selectedFiles = [];

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
    document.getElementById('createShareBtn').disabled = true;
    document.getElementById('shareOptions').style.display = 'none';
    document.getElementById('createShareBtn').innerHTML = '<i class="fas fa-share"></i> Tạo mã chia sẻ';
    fileTransfer.disconnect();
}

function resetReceiveModal() {
    document.getElementById('receiveCode').value = '';
    document.getElementById('receiveStatus').style.display = 'none';
    document.getElementById('incomingFiles').style.display = 'none';
    document.getElementById('downloadProgress').style.display = 'none';
    fileTransfer.disconnect();
}

// Close modal when clicking outside
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

// Hero file upload functionality
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#ffd700';
    uploadArea.style.background = 'rgba(255, 255, 255, 0.2)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.5)';
    uploadArea.style.background = 'transparent';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.5)';
    uploadArea.style.background = 'transparent';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        openUploadModal();
        addFilesToModal(files);
    }
});

fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
        openUploadModal();
        addFilesToModal(files);
    }
});

// Upload zone functionality in modal
const uploadZone = document.getElementById('uploadZone');
const modalFileInput = document.getElementById('modalFileInput');

uploadZone.addEventListener('click', () => {
    modalFileInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    addFilesToModal(files);
});

modalFileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    addFilesToModal(files);
});

function addFilesToModal(files) {
    Array.from(files).forEach(file => {
        if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            selectedFiles.push(file);
        }
    });
    displayFiles();
    updateCreateShareButton();
}

function displayFiles() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const fileIcon = getFileIcon(fileExtension);
        
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
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFiles();
    updateCreateShareButton();
}

function updateCreateShareButton() {
    const btn = document.getElementById('createShareBtn');
    btn.disabled = selectedFiles.length === 0;
}

// Create share functionality
async function createShare() {
    if (selectedFiles.length === 0) return;
    
    const btn = document.getElementById('createShareBtn');
    const shareOptions = document.getElementById('shareOptions');
    const connectionStatus = document.getElementById('connectionStatus');
    
    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';
        btn.disabled = true;
        
        const shareCode = await fileTransfer.createShare(selectedFiles);
        
        document.getElementById('generatedCode').textContent = shareCode;
        shareOptions.style.display = 'block';
        
        // Setup connection status callback
        fileTransfer.onConnectionStateChange = (state) => {
            updateConnectionStatus(connectionStatus, state);
        };
        
        // Setup transfer progress callback
        fileTransfer.onTransferProgress = (progress, fileName) => {
            updateTransferProgress(progress, fileName);
        };
        
        btn.innerHTML = '<i class="fas fa-check"></i> Mã đã tạo';
        
    } catch (error) {
        console.error('Error creating share:', error);
        showNotification('Lỗi tạo mã chia sẻ: ' + error.message, 'error');
        btn.innerHTML = '<i class="fas fa-share"></i> Tạo mã chia sẻ';
        btn.disabled = false;
    }
}

// Connect to sender functionality
async function connectToSender() {
    const shareCode = document.getElementById('receiveCode').value.trim().toUpperCase();
    
    if (!shareCode || shareCode.length !== 6) {
        showNotification('Vui lòng nhập mã chia sẻ 6 ký tự', 'error');
        return;
    }
    
    const receiveStatus = document.getElementById('receiveStatus');
    const incomingFiles = document.getElementById('incomingFiles');
    
    try {
        receiveStatus.style.display = 'block';
        receiveStatus.innerHTML = `
            <div class="status-icon">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <p>Đang kết nối với người gửi...</p>
        `;
        
        // Setup file received callback
        fileTransfer.onFileReceived = (type, data) => {
            if (type === 'file-list') {
                showIncomingFiles(data);
            } else if (type === 'file-complete') {
                showNotification(`Đã tải xong: ${data.name}`, 'success');
            }
        };
        
        // Setup connection status callback
        fileTransfer.onConnectionStateChange = (state) => {
            if (state === 'connected') {
                receiveStatus.innerHTML = `
                    <div class="status-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <p>Đã kết nối thành công!</p>
                `;
                receiveStatus.className = 'receive-status connected';
            } else if (state === 'failed' || state === 'disconnected') {
                receiveStatus.innerHTML = `
                    <div class="status-icon">
                        <i class="fas fa-times-circle"></i>
                    </div>
                    <p>Kết nối thất bại. Vui lòng thử lại.</p>
                `;
            }
        };
        
        // Setup transfer progress callback
        fileTransfer.onTransferProgress = (progress, fileName) => {
            updateDownloadProgress(progress, fileName);
        };
        
        await fileTransfer.connectToShare(shareCode);
        
    } catch (error) {
        console.error('Error connecting to sender:', error);
        receiveStatus.innerHTML = `
            <div class="status-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <p>Lỗi kết nối: ${error.message}</p>
        `;
        showNotification('Lỗi kết nối: ' + error.message, 'error');
    }
}

function showIncomingFiles(files) {
    const incomingFiles = document.getElementById('incomingFiles');
    const incomingFilesList = document.getElementById('incomingFilesList');
    
    incomingFilesList.innerHTML = '';
    
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const fileIcon = getFileIcon(fileExtension);
        
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
        `;
        
        incomingFilesList.appendChild(fileItem);
    });
    
    incomingFiles.style.display = 'block';
}

function acceptFiles() {
    const downloadProgress = document.getElementById('downloadProgress');
    downloadProgress.style.display = 'block';
    
    fileTransfer.requestTransfer();
}

function updateConnectionStatus(element, state) {
    switch (state) {
        case 'connecting':
            element.innerHTML = '<i class="fas fa-wifi"></i> <span>Đang kết nối...</span>';
            element.className = 'connection-status';
            break;
        case 'connected':
            element.innerHTML = '<i class="fas fa-check-circle"></i> <span>Đã kết nối</span>';
            element.className = 'connection-status connected';
            break;
        case 'disconnected':
        case 'failed':
            element.innerHTML = '<i class="fas fa-times-circle"></i> <span>Mất kết nối</span>';
            element.className = 'connection-status';
            break;
    }
}

function updateTransferProgress(progress, fileName) {
    const transferProgress = document.getElementById('transferProgress');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    
    if (transferProgress) {
        transferProgress.style.display = 'block';
        progressText.textContent = `Đang gửi: ${fileName}`;
        progressPercent.textContent = `${Math.round(progress)}%`;
        progressFill.style.width = `${progress}%`;
    }
}

function updateDownloadProgress(progress, fileName) {
    const downloadProgress = document.getElementById('downloadProgress');
    const progressText = document.getElementById('downloadProgressText');
    const progressPercent = document.getElementById('downloadProgressPercent');
    const progressFill = document.getElementById('downloadProgressFill');
    
    if (downloadProgress) {
        downloadProgress.style.display = 'block';
        progressText.textContent = `Đang tải: ${fileName}`;
        progressPercent.textContent = `${Math.round(progress)}%`;
        progressFill.style.width = `${progress}%`;
    }
}

// Utility functions
function copyShareCode() {
    const shareCode = document.getElementById('generatedCode').textContent;
    navigator.clipboard.writeText(shareCode).then(() => {
        showNotification('Đã sao chép mã chia sẻ!', 'success');
    });
}

function getFileIcon(extension) {
    const iconMap = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'xls': 'fa-file-excel',
        'xlsx': 'fa-file-excel',
        'ppt': 'fa-file-powerpoint',
        'pptx': 'fa-file-powerpoint',
        'txt': 'fa-file-alt',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image',
        'mp4': 'fa-file-video',
        'avi': 'fa-file-video',
        'mov': 'fa-file-video',
        'mp3': 'fa-file-audio',
        'wav': 'fa-file-audio',
        'zip': 'fa-file-archive',
        'rar': 'fa-file-archive',
        'default': 'fa-file'
    };
    
    return iconMap[extension] || iconMap['default'];
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification