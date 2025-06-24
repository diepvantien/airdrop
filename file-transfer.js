// WebRTC File Transfer Implementation
class FileTransfer {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.pendingFiles = [];
        this.currentTransfer = null;
        this.shareCode = null;
        this.ws = null;
        this.onConnectionStateChange = null;
        this.onFileReceived = null;
        this.onTransferProgress = null;
        
        this.initSignalingServer();
    }

    initSignalingServer() {
        // Simple WebSocket signaling server simulation
        // In production, you would use a real WebSocket server
        this.signaling = {
            connections: new Map(),
            
            send: (code, message) => {
                // Simulate WebSocket messaging through localStorage events
                const event = new CustomEvent('signaling', {
                    detail: { code, message }
                });
                window.dispatchEvent(event);
            },
            
            onMessage: (callback) => {
                window.addEventListener('signaling', (e) => {
                    callback(e.detail);
                });
            }
        };
    }

    async createShare(files) {
        this.isInitiator = true;
        this.pendingFiles = Array.from(files);
        this.shareCode = this.generateShareCode();
        
        await this.initPeerConnection();
        this.setupDataChannel();
        
        // Listen for incoming connections
        this.signaling.onMessage(async (data) => {
            if (data.code === this.shareCode) {
                await this.handleSignalingMessage(data.message);
            }
        });
        
        return this.shareCode;
    }

    async connectToShare(shareCode) {
        this.isInitiator = false;
        this.shareCode = shareCode;
        
        await this.initPeerConnection();
        
        // Send connection request
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        this.signaling.send(shareCode, {
            type: 'offer',
            offer: offer
        });
        
        // Listen for responses
        this.signaling.onMessage(async (data) => {
            if (data.code === shareCode) {
                await this.handleSignalingMessage(data.message);
            }
        });
    }

    async initPeerConnection() {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.peerConnection = new RTCPeerConnection(config);
        
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.send(this.shareCode, {
                    type: 'ice-candidate',
                    candidate: event.candidate
                });
            }
        };
        
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(state);
            }
        };
        
        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannelHandlers(channel);
        };
    }

    setupDataChannel() {
        this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
            ordered: true
        });
        this.setupDataChannelHandlers(this.dataChannel);
    }

    setupDataChannelHandlers(channel) {
        channel.onopen = () => {
            console.log('Data channel opened');
            if (this.isInitiator && this.pendingFiles.length > 0) {
                this.sendFileList();
            }
        };
        
        channel.onmessage = (event) => {
            this.handleDataChannelMessage(event.data);
        };
        
        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };
        
        if (!this.dataChannel) {
            this.dataChannel = channel;
        }
    }

    async handleSignalingMessage(message) {
        switch (message.type) {
            case 'offer':
                await this.peerConnection.setRemoteDescription(message.offer);
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                this.signaling.send(this.shareCode, {
                    type: 'answer',
                    answer: answer
                });
                break;
                
            case 'answer':
                await this.peerConnection.setRemoteDescription(message.answer);
                break;
                
            case 'ice-candidate':
                await this.peerConnection.addIceCandidate(message.candidate);
                break;
        }
    }

    sendFileList() {
        const fileList = this.pendingFiles.map(file => ({
            name: file.name,
            size: file.size,
            type: file.type
        }));
        
        this.dataChannel.send(JSON.stringify({
            type: 'file-list',
            files: fileList
        }));
    }

    async sendFile(file) {
        const chunkSize = 16384; // 16KB chunks
        const totalChunks = Math.ceil(file.size / chunkSize);
        
        // Send file metadata
        this.dataChannel.send(JSON.stringify({
            type: 'file-start',
            name: file.name,
            size: file.size,
            type: file.type,
            totalChunks: totalChunks
        }));
        
        let offset = 0;
        let chunkIndex = 0;
        
        const sendNextChunk = () => {
            const chunk = file.slice(offset, offset + chunkSize);
            const reader = new FileReader();
            
            reader.onload = () => {
                this.dataChannel.send(JSON.stringify({
                    type: 'file-chunk',
                    index: chunkIndex,
                    data: Array.from(new Uint8Array(reader.result))
                }));
                
                offset += chunkSize;
                chunkIndex++;
                
                if (this.onTransferProgress) {
                    const progress = Math.min((chunkIndex / totalChunks) * 100, 100);
                    this.onTransferProgress(progress, file.name);
                }
                
                if (offset < file.size) {
                    setTimeout(sendNextChunk, 10); // Small delay to prevent overwhelming
                } else {
                    this.dataChannel.send(JSON.stringify({
                        type: 'file-end',
                        name: file.name
                    }));
                }
            };
            
            reader.readAsArrayBuffer(chunk);
        };
        
        sendNextChunk();
    }

    handleDataChannelMessage(data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'file-list':
                    if (this.onFileReceived) {
                        this.onFileReceived('file-list', message.files);
                    }
                    break;
                    
                case 'file-start':
                    this.currentTransfer = {
                        name: message.name,
                        size: message.size,
                        type: message.type,
                        totalChunks: message.totalChunks,
                        receivedChunks: 0,
                        chunks: new Array(message.totalChunks)
                    };
                    break;
                    
                case 'file-chunk':
                    if (this.currentTransfer) {
                        this.currentTransfer.chunks[message.index] = new Uint8Array(message.data);
                        this.currentTransfer.receivedChunks++;
                        
                        if (this.onTransferProgress) {
                            const progress = (this.currentTransfer.receivedChunks / this.currentTransfer.totalChunks) * 100;
                            this.onTransferProgress(progress, this.currentTransfer.name);
                        }
                    }
                    break;
                    
                case 'file-end':
                    if (this.currentTransfer) {
                        this.completeFileTransfer();
                    }
                    break;
                    
                case 'transfer-request':
                    this.sendAllFiles();
                    break;
            }
        } catch (error) {
            console.error('Error handling data channel message:', error);
        }
    }

    completeFileTransfer() {
        // Combine all chunks into a single file
        const chunks = this.currentTransfer.chunks;
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        
        const blob = new Blob([combined], { type: this.currentTransfer.type });
        const url = URL.createObjectURL(blob);
        
        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentTransfer.name;
        a.click();
        
        URL.revokeObjectURL(url);
        
        if (this.onFileReceived) {
            this.onFileReceived('file-complete', this.currentTransfer);
        }
        
        this.currentTransfer = null;
    }

    sendAllFiles() {
        if (this.pendingFiles.length === 0) return;
        
        let currentFileIndex = 0;
        
        const sendNext = () => {
            if (currentFileIndex < this.pendingFiles.length) {
                this.sendFile(this.pendingFiles[currentFileIndex]).then(() => {
                    currentFileIndex++;
                    setTimeout(sendNext, 100);
                });
            }
        };
        
        sendNext();
    }

    requestTransfer() {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'transfer-request'
            }));
        }
    }

    generateShareCode() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.dataChannel = null;
        this.peerConnection = null;
        this.currentTransfer = null;
        this.pendingFiles = [];
    }
}

// Global file transfer instance
window.fileTransfer = new FileTransfer();