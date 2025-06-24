const { PrismaClient } = require('@prisma/client');

class Database {
    constructor() {
        this.prisma = new PrismaClient();
    }

    async saveFile(fileData) {
        return await this.prisma.file.create({
            data: fileData
        });
    }

    async getFile(fileId, accessToken) {
        return await this.prisma.file.findFirst({
            where: {
                id: fileId,
                access_token: accessToken
            }
        });
    }

    async deleteFile(fileId) {
        return await this.prisma.file.delete({
            where: { id: fileId }
        });
    }

    async incrementDownloadCount(fileId) {
        return await this.prisma.file.update({
            where: { id: fileId },
            data: {
                download_count: {
                    increment: 1
                }
            }
        });
    }

    async getExpiredFiles() {
        return await this.prisma.file.findMany({
            where: {
                expires_at: {
                    lt: new Date()
                }
            }
        });
    }

    async getFileStats() {
        const totalFiles = await this.prisma.file.count();
        const totalSize = await this.prisma.file.aggregate({
            _sum: {
                size: true
            }
        });
        const totalDownloads = await this.prisma.file.aggregate({
            _sum: {
                download_count: true
            }
        });

        return {
            totalFiles,
            totalSize: totalSize._sum.size || 0,
            totalDownloads: totalDownloads._sum.download_count || 0
        };
    }
}

module.exports = Database;