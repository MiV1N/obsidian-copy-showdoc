import { App, Notice, requestUrl, RequestUrlParam, TFile } from 'obsidian';
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
 * Interface for Login response data
 */
interface LoginData {
    user_token: string;
}

/**
 * Interface for Upload Image response
 */
interface UploadImageResponse {
    url: string;
    success: number; // 1 for success
    error_message?: string;
}

/**
 * Client for ShowDoc API
 * Handles authentication and data transmission to ShowDoc server.
 */
export class ShowDocClient {
    private userToken: string | null = null;
    private readonly LOGIN_Endpoint = '/api/user/login';
    private readonly UPLOAD_IMG_Endpoint = '/api/page/uploadImg';
    private readonly UPDATE_ITEM_Endpoint = '/api/item/updateByApi';

    constructor(private app: App, private settings: CopyDocumentAsHTMLSettings) {}

    /**
     * Get the base API URL (server/index.php).
     */
    private get baseUrl(): string {
        let url = this.settings.showdocUrl;
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        return `${url}/server/index.php`;
    }

    /**
     * Login to ShowDoc and retrieve user token.
     * Uses cache if available.
     * @returns User authentication token
     */
    public async login(): Promise<string> {
        if (this.userToken) {
            return this.userToken;
        }

        this.validateCredentials();

        try {
            const response = await requestUrl({
                url: `${this.baseUrl}?s=${this.LOGIN_Endpoint}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                },
                body: new URLSearchParams({
                    username: this.settings.showdocUsername,
                    password: this.settings.showdocPassword,
                }).toString(),
            });

            if (response.status !== 200) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = response.json as ShowdocResponse<LoginData>;
            if (data.error_code !== 0) {
                throw new Error(data.error_message);
            }

            this.userToken = data.data?.user_token;
            if (!this.userToken) {
                throw new Error('No user token found in response');
            }

            new Notice(`ShowDoc Login Successful`);
            return this.userToken;

        } catch (error) {
            console.error('ShowDoc Login Failed:', error);
            const msg = error instanceof Error ? error.message : String(error);
            new Notice(`ShowDoc Login Failed: ${msg}`);
            throw error;
        }
    }

    /**
     * Upload an image file to ShowDoc.
     * @param file The file to upload
     * @param token Optional user token
     * @returns Uploaded image URL
     */
    async uploadImage(file: TFile, token?: string): Promise<string> {
        const fileContent = await this.app.vault.readBinary(file);
        return this.uploadImageWithData(file, new Uint8Array(fileContent), token);
    }

    /**
     * Upload binary image data to ShowDoc.
     * Handles multipart/form-data construction manually for Obsidian compatibility.
     * @param file File metadata (name required)
     * @param fileContent Binary content
     * @param token Optional user token
     */
    async uploadImageWithData(file: { name: string }, fileContent: Uint8Array, token?: string): Promise<string> {
        try {
            const userToken = token || this.userToken || await this.login();
            
            const boundary = this.generateBoundary();
            const formData = this.buildMultipartData(file, fileContent, userToken, boundary);

            const response = await requestUrl({
                url: `${this.baseUrl}?s=${this.UPLOAD_IMG_Endpoint}`,
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

            // The uploadImg API returns a slightly different structure than standard response
            const data = response.json as UploadImageResponse;

            if (data.success !== 1) {
                this.handleTokenError(data.error_message);
                throw new Error(data.error_message || 'Upload failed');
            }

            if (!data.url) {
                throw new Error('Upload succeeded but returned no URL');
            }

            return data.url;

        } catch (error) {
            console.error('Image Upload Failed:', error, file.name);
            // new Notice handled by caller most likely, but we can log
            throw error;
        }
    }

    /**
     * Update or create a ShowDoc article.
     * @param title Page title
     * @param content Page content (Markdown)
     * @param catName Category name
     * @param token Optional token
     */
    async updateArticle(title: string, content: string, catName?: string, token?: string): Promise<void> {
        const userToken = token || await this.login();
        
        if (!this.settings.showdocApiKey || !this.settings.showdocApiToken) {
            throw new Error('ShowDoc API Key/Token not configured');
        }

        // Default s_number to 99 as per docs
        const s_number = 99;

        try {
            const response = await requestUrl({
                url: `${this.baseUrl}?s=${this.UPDATE_ITEM_Endpoint}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    api_key: this.settings.showdocApiKey,
                    api_token: this.settings.showdocApiToken,
                    user_token: userToken,
                    cat_name: catName || '',
                    page_title: title,
                    page_content: content,
                    s_number: s_number,
                }),
            });

            if (response.status !== 200) {
                 throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = response.json as ShowdocResponse;
            if (data.error_code !== 0) {
                this.handleTokenError(data.error_message);
                throw new Error(data.error_message);
            }

            new Notice('Successfully uploaded to ShowDoc!');

        } catch (error) {
            console.error('Update Article Failed:', error);
            throw error;
        }
    }

    private validateCredentials() {
         if (!this.settings.showdocUrl || !this.settings.showdocUsername || !this.settings.showdocPassword) {
            const msg = 'ShowDoc credentials missing';
            new Notice(msg);
            throw new Error(msg);
        }
    }

    private handleTokenError(errorMessage?: string) {
        if (errorMessage && (errorMessage.includes('token') || errorMessage.includes('Token'))) {
            this.userToken = null;
            console.log('Token cleared due to auth error');
        }
    }

    private generateBoundary(): string {
        return '---------------------------' + Math.random().toString(36).substring(2, 15);
    }

    private buildMultipartData(file: { name: string }, fileContent: Uint8Array, token: string, boundary: string): Uint8Array {
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

        // Parts
        const fileHeader = `${sBoundary}Content-Disposition: form-data; name="editormd-image-file"; filename="${file.name}"\r\nContent-Type: ${contentType}\r\n\r\n`;
        const tokenPart = `\r\n${sBoundary}Content-Disposition: form-data; name="user_token"\r\n\r\n${token}\r\n`;
        
        let projectPart = '';
        if (this.settings.showdocProjectId) {
            projectPart = `${sBoundary}Content-Disposition: form-data; name="item_id"\r\n\r\n${this.settings.showdocProjectId}\r\n`;
        }

        const enc = new TextEncoder();
        const fileHeaderBuf = enc.encode(fileHeader);
        const tokenBuf = enc.encode(tokenPart);
        const projectBuf = enc.encode(projectPart);
        const endBuf = enc.encode(eBoundary);

        const totalLength = fileHeaderBuf.length + fileContent.byteLength + tokenBuf.length + projectBuf.length + endBuf.length;
        const result = new Uint8Array(totalLength);

        let offset = 0;
        result.set(fileHeaderBuf, offset); offset += fileHeaderBuf.length;
        result.set(fileContent, offset); offset += fileContent.byteLength;
        result.set(tokenBuf, offset); offset += tokenBuf.length;
        if (projectBuf.length > 0) {
            result.set(projectBuf, offset); offset += projectBuf.length;
        }
        result.set(endBuf, offset);

        return result;
    }
}
