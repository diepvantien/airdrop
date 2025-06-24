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
        handleFiles(files);
    }
});

fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
        handleFiles(files);
    }
});

function handleFiles(files) {
    // Open modal with files
    openUploadModal();
    addFilesToModal(files);
}

// Stats counter animation
function animateCounter(element) {
    const target = parseInt(element.getAttribute('data-target'));
    const count = +element.innerText;
    const increment = target / 200;

    if (count < target) {
        element.innerText = Math.ceil(count + increment);
        setTimeout(() => animateCounter(element), 1);
    } else {
        element.innerText = target;
    }
}

// Intersection Observer for stats animation
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const counters = entry.target.querySelectorAll('.stat-number');
            counters.forEach(counter => {
                counter.innerText = '0';
                animateCounter(counter);
            });
            statsObserver.unobserve(entry.target);
        }
    });
});

const statsSection = document.querySelector('.stats');
if (statsSection) {
    statsObserver.observe(statsSection);
}

// Modal functionality
const modal = document.getElementById('uploadModal');
const uploadZone = document.getElementById('uploadZone');
const modalFileInput = document.getElementById('modalFileInput');
const fileList = document.getElementById('fileList');
const uploadBtn = document.getElementById('uploadBtn');

let selectedFiles = [];

function openUploadModal() {
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeUploadModal() {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    selectedFiles = [];
    fileList.innerHTML = '';
    uploadBtn.disabled = true;
}

// Close modal when clicking outside
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeUploadModal();
    }
});

// Upload zone functionality
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
    updateUploadButton();
}

function displayFiles() {
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
    updateUploadButton();
}

function updateUploadButton() {
    uploadBtn.disabled = selectedFiles.length === 0;
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

// Upload button click handler
uploadBtn.addEventListener('click', () => {
    if (selectedFiles.length > 0) {
        // Simulate upload process
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo link...';
        uploadBtn.disabled = true;
        
        setTimeout(() => {
            // Simulate successful upload
            showShareLink();
        }, 2000);
    }
});

function showShareLink() {
    const shareUrl = `https://airshare.example.com/share/${generateRandomId()}`;
    
    fileList.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div style="background: #f0fff4; border: 1px solid #9ae6b4; border-radius: 10px; padding: 1.5rem; margin-bottom: 1rem;">
                <i class="fas fa-check-circle" style="color: #38a169; font-size: 2rem; margin-bottom: 1rem;"></i>
                <h4 style="color: #22543d; margin-bottom: 1rem;">Link chia sẻ đã được tạo!</h4>
                <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e2e8f0;">
                    <code style="word-break: break-all; color: #667eea; font-weight: 500;">${shareUrl}</code>
                </div>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button onclick="copyToClipboard('${shareUrl}')" style="background: #667eea; color: white; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer;">
                        <i class="fas fa-copy"></i> Sao chép
                    </button>
                    <button onclick="shareViaEmail('${shareUrl}')" style="background: #48bb78; color: white; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer;">
                        <i class="fas fa-envelope"></i> Email
                    </button>
                </div>
            </div>
        </div>
    `;
    
    uploadBtn.innerHTML = '<i class="fas fa-plus"></i> Chia sẻ file khác';
    uploadBtn.disabled = false;
    uploadBtn.onclick = () => {
        selectedFiles = [];
        fileList.innerHTML = '';
        displayFiles();
        updateUploadButton();
        uploadBtn.onclick = () => uploadBtn.click();
    };
}

function generateRandomId() {
    return Math.random().toString(36).substr(2, 9);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Link đã được sao chép!', 'success');
    });
}

function shareViaEmail(url) {
    const subject = encodeURIComponent('Chia sẻ file từ AirShare');
    const body = encodeURIComponent(`Xin chào,\n\nTôi đã chia sẻ một file với bạn thông qua AirShare. Bạn có thể tải file tại đây:\n\n${url}\n\nTrân trọng!`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#48bb78' : '#667eea'};
        color: white;
        padding: 1rem 2rem;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        z-index: 3000;
        animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in forwards';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
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

// Header scroll effect
window.addEventListener('scroll', () => {
    const header = document.querySelector('.header');
    if (window.scrollY > 100) {
        header.style.background = 'rgba(255, 255, 255, 0.98)';
        header.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
    } else {
        header.style.background = 'rgba(255, 255, 255, 0.95)';
        header.style.boxShadow = 'none';
    }
});

// Add loading states and animations
document.addEventListener('DOMContentLoaded', () => {
    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe feature cards
    document.querySelectorAll('.feature-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(50px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });

    // Observe steps
    document.querySelectorAll('.step').forEach((step, index) => {
        step.style.opacity = '0';
        step.style.transform = 'translateY(50px)';
        step.style.transition = `opacity 0.6s ease ${index * 0.2}s, transform 0.6s ease ${index * 0.2}s`;
        observer.observe(step);
    });
});