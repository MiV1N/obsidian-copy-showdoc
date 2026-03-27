import { App, Notice, requestUrl, TFile } from 'obsidian';
import { CopyDocumentAsHTMLSettings } from './settings';

/**
 * Interface for ShowDoc API response
 */
interface ShowdocResponse<T = any> {
    error_code: number;
    error_message: string;
    data: T;
}

/**
 * Interface for Upload Attachment response
 */
interface UploadAttachmentResponse {
    url: string;
    file_id: number;
    error_message?: string;
}

/**
 * Interface for Update Page response
 */
interface UpdatePageResponse {
    page_id: number;
}

/**
 * Interface for Get Page response
 */
interface GetPageResponse {
    page_id: number;
    page_title: string;
    page_content: string;
}

/**
 * Client for ShowDoc Open API
 * Uses api_key and api_token for authentication (no login required).
 */
export class ShowDocClient {
    // 新版 API 端点
    private readonly UPDATE_PAGE_Endpoint = '/api/open/updatePage';
    private readonly GET_PAGE_Endpoint = '/api/open/getPage';
    private readonly DELETE_PAGE_Endpoint = '/api/open/deletePage';
    private readonly UPLOAD_ATTACHMENT_Endpoint = '/api/open/uploadAttachment';
    private readonly DELETE_ATTACHMENT_Endpoint = '/api/open/deleteAttachment';

    constructor(private app: App, private settings: CopyDocumentAsHTMLSettings) {}

    /**
     * Get the base API URL for new Open API.
     * Note: Private deployment uses /server/index.php?s=, online version uses /server/index.php?s=/api/open/
     */
    private get baseUrl(): string {
        let url = this.settings.showdocUrl;
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        // 使用 server/index.php 作为基础路径
        return `${url}/server/index.php`;
    }

    /**
     * Validate that api_key and api_token are configured.
     */
    private validateApiCredentials() {
        if (!this.settings.showdocApiKey || !this.settings.showdocApiToken) {
            const msg = 'ShowDoc API Key/Token not configured';
            new Notice(msg);
            throw new Error(msg);
        }
    }

    /**
     * Upload an image file to ShowDoc.
     * @param file The file to upload
     * @returns Uploaded image URL
     */
    async uploadImage(file: TFile): Promise<string> {
        const fileContent = await this.app.vault.readBinary(file);
        return this.uploadImageWithData(file, new Uint8Array(fileContent));
    }

    /**
     * Upload binary image data to ShowDoc.
     * Uses the new /api/open/uploadAttachment API.
     * @param file File metadata (name required)
     * @param fileContent Binary content
     */
    async uploadImageWithData(file: { name: string }, fileContent: Uint8Array): Promise<string> {
        this.validateApiCredentials();

        // Debug log
        console.log('[ShowDoc] Uploading with api_key:', this.settings.showdocApiKey.substring(0, 8) + '...');

        try {
            const boundary = this.generateBoundary();
            const formData = this.buildMultipartData(file, fileContent, boundary);

            const response = await requestUrl({
                url: `${this.baseUrl}?s=${this.UPLOAD_ATTACHMENT_Endpoint}`,
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': `multipart/form-data; boundary=${boundary}`
                },
                body: formData.buffer,
            });

            if (response.status !== 200) {
                throw new Error(`HTTP Error: ${response.status} - ${response.text}`);
            }

            const data = response.json as ShowdocResponse<UploadAttachmentResponse>;
            if (data.error_code !== 0) {
                throw new Error(data.error_message || 'Upload failed');
            }

            if (!data.data?.url) {
                throw new Error('Upload succeeded but returned no URL');
            }

            return data.data.url;

        } catch (error) {
            console.error('Image Upload Failed:', error, file.name);
            throw error;
        }
    }

    /**
     * Update or create a ShowDoc page.
     * Uses the new /api/open/updatePage API.
     * @param title Page title
     * @param content Page content (Markdown)
     * @param catName Category name (optional, supports "一级/二级" format)
     * @param sNumber Sort number (default 99)
     */
    async updatePage(title: string, content: string, catName?: string, sNumber: number = 99): Promise<number> {
        this.validateApiCredentials();

        try {
            const response = await requestUrl({
                url: `${this.baseUrl}?s=${this.UPDATE_PAGE_Endpoint}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                },
                body: new URLSearchParams({
                    api_key: this.settings.showdocApiKey,
                    api_token: this.settings.showdocApiToken,
                    page_title: title,
                    page_content: content,
                    cat_name: catName || '',
                    s_number: String(sNumber),
                }).toString(),
            });

            if (response.status !== 200) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = response.json as ShowdocResponse<UpdatePageResponse>;
            if (data.error_code !== 0) {
                throw new Error(data.error_message);
            }

            new Notice('Successfully uploaded to ShowDoc!');
            return data.data?.page_id || 0;

        } catch (error) {
            console.error('Update Page Failed:', error);
            throw error;
        }
    }

    /**
     * Get page details by title.
     * Uses the new /api/open/getPage API.
     * @param title Page title
     * @returns Page details including content
     */
    async getPage(title: string): Promise<GetPageResponse | null> {
        this.validateApiCredentials();

        try {
            const response = await requestUrl({
                url: `${this.baseUrl}?s=${this.GET_PAGE_Endpoint}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                },
                body: new URLSearchParams({
                    api_key: this.settings.showdocApiKey,
                    api_token: this.settings.showdocApiToken,
                    page_title: title,
                }).toString(),
            });

            if (response.status !== 200) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = response.json as ShowdocResponse<GetPageResponse>;
            if (data.error_code !== 0) {
                if (data.error_code === 10302) {
                    // Page not found
                    return null;
                }
                throw new Error(data.error_message);
            }

            return data.data || null;

        } catch (error) {
            console.error('Get Page Failed:', error);
            throw error;
        }
    }

    /**
     * Delete a page (move to trash).
     * Uses the new /api/open/deletePage API.
     * @param pageId Page ID to delete
     */
    async deletePage(pageId: number): Promise<void> {
        this.validateApiCredentials();

        try {
            const response = await requestUrl({
                url: `${this.baseUrl}?s=${this.DELETE_PAGE_Endpoint}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                },
                body: new URLSearchParams({
                    api_key: this.settings.showdocApiKey,
                    api_token: this.settings.showdocApiToken,
                    page_id: String(pageId),
                }).toString(),
            });

            if (response.status !== 200) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = response.json as ShowdocResponse<{ page_id: number }>;
            if (data.error_code !== 0) {
                throw new Error(data.error_message);
            }

            new Notice('Page deleted successfully');

        } catch (error) {
            console.error('Delete Page Failed:', error);
            throw error;
        }
    }

    /**
     * Delete an attachment.
     * Uses the new /api/open/deleteAttachment API.
     * @param fileId File ID to delete
     */
    async deleteAttachment(fileId: number): Promise<void> {
        this.validateApiCredentials();

        try {
            const response = await requestUrl({
                url: `${this.baseUrl}?s=${this.DELETE_ATTACHMENT_Endpoint}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                },
                body: new URLSearchParams({
                    api_key: this.settings.showdocApiKey,
                    api_token: this.settings.showdocApiToken,
                    file_id: String(fileId),
                }).toString(),
            });

            if (response.status !== 200) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = response.json as ShowdocResponse<{ file_id: number }>;
            if (data.error_code !== 0) {
                throw new Error(data.error_message);
            }

        } catch (error) {
            console.error('Delete Attachment Failed:', error);
            throw error;
        }
    }

    private generateBoundary(): string {
        return '---------------------------' + Math.random().toString(36).substring(2, 15);
    }

    private buildMultipartData(file: { name: string }, fileContent: Uint8Array, boundary: string): Uint8Array {
        const sBoundary = '--' + boundary + '\r\n';
        const eBoundary = '\r\n--' + boundary + '--\r\n';

        let contentType = 'application/octet-stream';
        const ext = file.name.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'bmp': 'image/bmp'
        };
        if (ext && mimeTypes[ext]) {
            contentType = mimeTypes[ext];
        }

        // Parts - api_key 和 api_token 在前面，然后是 file
        const apiKeyPart = `${sBoundary}Content-Disposition: form-data; name="api_key"\r\n\r\n${this.settings.showdocApiKey}\r\n`;
        const apiTokenPart = `${sBoundary}Content-Disposition: form-data; name="api_token"\r\n\r\n${this.settings.showdocApiToken}\r\n`;
        const fileHeader = `${sBoundary}Content-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${contentType}\r\n\r\n`;

        const enc = new TextEncoder();
        const apiKeyBuf = enc.encode(apiKeyPart);
        const apiTokenBuf = enc.encode(apiTokenPart);
        const fileHeaderBuf = enc.encode(fileHeader);
        const endBuf = enc.encode(eBoundary);

        const totalLength = apiKeyBuf.length + apiTokenBuf.length + fileHeaderBuf.length + fileContent.byteLength + endBuf.length;
        const result = new Uint8Array(totalLength);

        let offset = 0;
        result.set(apiKeyBuf, offset); offset += apiKeyBuf.length;
        result.set(apiTokenBuf, offset); offset += apiTokenBuf.length;
        result.set(fileHeaderBuf, offset); offset += fileHeaderBuf.length;
        result.set(fileContent, offset); offset += fileContent.byteLength;
        result.set(endBuf, offset);

        return result;
    }
}
