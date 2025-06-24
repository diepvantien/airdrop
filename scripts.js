const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');

// Configure AWS S3 for CDN
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

class CDNManager {
    constructor() {
        this.bucketName = process.env.CDN_BUCKET_NAME;
    }

    async uploadToS3(filePath, key) {
        try {
            const fileContent = await fs.readFile(filePath);
            
            const params = {
                Bucket: this.bucketName,
                Key: `files/${key}`,
                Body: fileContent,
                ContentType: 'application/octet-stream',
                CacheControl: 'public, max-age=31536000', // 1 year
                ServerSideEncryption: 'AES256'
            };

            const result = await s3.upload(params).promise();
            return result.Location;
        } catch (error) {
            console.error('S3 upload error:', error);
            throw error;
        }
    }

    async deleteFromS3(key) {
        try {
            const params = {
                Bucket: this.bucketName,
                Key: `files/${key}`
            };

            await s3.deleteObject(params).promise();
        } catch (error) {
            console.error('S3 delete error:', error);
            throw error;
        }
    }

    async generatePresignedUrl(key, expiresIn = 3600) {
        try {
            const params = {
                Bucket: this.bucketName,
                Key: `files/${key}`,
                Expires: expiresIn
            };

            return s3.getSignedUrl('getObject', params);
        } catch (error) {
            console.error('Presigned URL error:', error);
            throw error;
        }
    }
}

module.exports = CDNManager;