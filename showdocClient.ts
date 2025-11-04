import { App, Notice, requestUrl, TFile } from 'obsidian';
import { CopyDocumentAsHTMLSettings } from './settings';

/**
 * Client for ShowDoc API
 */
export class ShowDocClient {
	private userToken: string | null = null;

	constructor(private app: App, private settings: CopyDocumentAsHTMLSettings) {}

	/**
	 * 登录ShowDoc并获取用户token
	 * @returns 用户认证token
	 */
	public async login(): Promise<string> {
		// 如果已经有缓存的token，直接返回
		if (this.userToken) {
			return this.userToken;
		}

		// 验证登录凭证是否已配置
		if (!this.settings.showdocUrl || !this.settings.showdocUsername || !this.settings.showdocPassword) {
			new Notice('ShowDoc login credentials are not configured.');
			throw new Error('ShowDoc login credentials are not configured.');
		}

		// 执行登录请求 - 符合OpenAPI规范，s作为查询参数
		const loginBaseUrl = `${this.settings.showdocUrl}/server/index.php`;
		const response = await requestUrl({
			url: `${loginBaseUrl}?s=/api/user/login`,
			method: 'POST',
			// 添加跨域相关配置
		headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Accept': 'application/json',
			},
			body: new URLSearchParams({
				username: this.settings.showdocUsername,
				password: this.settings.showdocPassword,
			}).toString(),
		});
		console.log('Login response text:', response.text);

		// 处理响应状态
		if (response.status !== 200) {
			throw new Error(`Failed to login to ShowDoc. Status: ${response.status}`);
		}

		// 处理登录结果
		const data = response.json;
		if (data.error_code !== 0) {
			throw new Error(`ShowDoc login failed: ${data.error_message}`);
		}

		// 缓存并返回token
		this.userToken = data.data?.user_token;
		if (!this.userToken) {
			throw new Error('Failed to get user token from ShowDoc response');
		}
		new Notice(`Logged in. Token starts with: ${this.userToken.substring(0, 8)}`);
		return this.userToken;
	}


	/**
	 * 上传图片到ShowDoc
	 * @param file 要上传的文件
	 * @param token 可选的 user token
	 * @returns 上传后的图片URL
	 */
	async uploadImage(file: TFile, token?: string): Promise<string> {
        // 读取文件内容
        const fileContent = await this.app.vault.readBinary(file);
        return this.uploadImageWithData(file, new Uint8Array(fileContent), token);
	}


    /**
     * 使用二进制数据上传图片到ShowDoc
     * @param file 模拟的文件对象
     * @param fileContent 二进制文件内容
     * @param token 可选的 user token
     * @returns 上传后的图片URL
     */
    async uploadImageWithData(file: TFile, fileContent: Uint8Array, token?: string): Promise<string> {
        try {
            // 使用提供的token或自动获取
            const userToken = token || this.userToken || await this.login();
            console.log('Uploading image with data, userToken:', userToken);

            // 构建基础URL，确保URL格式正确
            let showdocUrl = this.settings.showdocUrl;
            // 确保URL不以/结尾
            if (showdocUrl.endsWith('/')) {
                showdocUrl = showdocUrl.slice(0, -1);
            }
            const baseUploadUrl = `${showdocUrl}/server/index.php`;
            console.log('Base upload URL:', baseUploadUrl);

            console.log('File content length:', fileContent.byteLength);
            console.log('File name:', file.name);

            // 生成边界
            const genBoundary = () => {
                return '---------------------------' + Math.random().toString(36).substring(2, 15);
            };
            const boundary = genBoundary();
            const sBoundary = '--' + boundary + '\r\n';

            // 根据文件扩展名动态设置Content-Type
            let contentType = 'application/octet-stream';
            const extension = file.name.split('.').pop()?.toLowerCase();
            const mimeTypes: {[key: string]: string} = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'svg': 'image/svg+xml',
                'bmp': 'image/bmp'
            };
            if (extension && mimeTypes[extension]) {
                contentType = mimeTypes[extension];
            }
            console.log('Setting content type:', contentType, 'for file:', file.name);

            // 创建文件部分的form-data
            const fileForm = `${sBoundary}Content-Disposition: form-data; name="editormd-image-file"; filename="${file.name}"\r\nContent-Type: ${contentType}\r\n\r\n`;
            const fileFormArray = new TextEncoder().encode(fileForm);

            // 创建其他参数部分
            let paramsBody = '';
            paramsBody += `\r\n${sBoundary}Content-Disposition: form-data; name="user_token"\r\n\r\n${userToken}\r\n`;
            
            // 如果有项目ID，添加到表单数据中
            if (this.settings.showdocProjectId) {
                paramsBody += `${sBoundary}Content-Disposition: form-data; name="item_id"\r\n\r\n${this.settings.showdocProjectId}\r\n`;
                console.log('Adding project ID:', this.settings.showdocProjectId);
            }

            const paramsBodyArray = new TextEncoder().encode(paramsBody);
            const endBoundaryArray = new TextEncoder().encode('\r\n--' + boundary + '--\r\n');

            // 合并所有Uint8Array
            const formDataArray = new Uint8Array(
                fileFormArray.length + 
                fileContent.byteLength + 
                paramsBodyArray.length + 
                endBoundaryArray.length
            );
            
            formDataArray.set(fileFormArray, 0);
            formDataArray.set(fileContent, fileFormArray.length);
            formDataArray.set(paramsBodyArray, fileFormArray.length + fileContent.byteLength);
            formDataArray.set(endBoundaryArray, fileFormArray.length + fileContent.byteLength + paramsBodyArray.length);

            console.log('Generated boundary:', boundary);
            console.log('Form data length:', formDataArray.length);

            // 发送图片上传请求
            const response = await requestUrl({
                url: `${baseUploadUrl}?s=/api/page/uploadImg`,
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': `multipart/form-data; boundary=${boundary}`
                },
                body: formDataArray.buffer,
            });

            // 处理响应状态
            if (response.status < 200 || response.status >= 300) {
                console.error('Upload failed with status:', response.status);
                throw new Error(`Failed to upload image. Status: ${response.status}, Response: ${response.text || 'No response text'}`);
            }

            console.log('Upload response received, status:', response.status);
            console.log('Response text preview:', response.text?.substring(0, 100) + '...');

            // 处理上传结果
            let data;
            try {
                data = response.json;
                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid JSON response format');
                }
                console.log('Response data:', data);
            } catch (jsonError) {
                console.error('JSON parse error:', jsonError.message);
                console.error('Raw response:', response.text);
                throw new Error(`Failed to parse response as JSON: ${jsonError.message}, Response: ${response.text || 'No text available'}`);
            }

            // 检查上传是否成功
            if (data.success !== 1) {
                console.error('Upload failed:', data.error_message);
                if (data.error_message?.includes('token') || data.error_message?.includes('Token')) {
                    this.userToken = null;
                    console.log('Token cleared due to authentication error');
                }
                throw new Error(`ShowDoc image upload failed: ${data.error_message || 'Unknown error'}`);
            }

            // 返回图片URL
            if (!data.url) {
                throw new Error('Upload succeeded but no URL was returned');
            }
            console.log('Image uploaded successfully with data, URL:', data.url);
            return data.url;
        } catch (error) {
            console.error('Image upload with data error:', error);
            new Notice(`Failed to upload image: ${error.message}`);
            throw error;
        }
    }
    
    


	/**
	 * 更新或创建ShowDoc文章
	 * @param title 文章标题
	 * @param content 文章内容
	 * @param catName 分类名称
	 */
	async updateArticle(title: string, content: string, catName?: string, token?: string): Promise<void> {
		// 使用提供的token或自动获取
		const userToken = token || await this.login();
		
		// 验证API设置
		if (!this.settings.showdocUrl || !this.settings.showdocApiKey || !this.settings.showdocApiToken) {
			new Notice('ShowDoc API settings are not configured.');
			throw new Error('ShowDoc API settings are not configured.');
		}

		// 构建基础URL，s参数将在请求时单独添加，符合OpenAPI规范
		const baseUrl = `${this.settings.showdocUrl}/server/index.php`;
		const response = await requestUrl({
			url: `${baseUrl}?s=/api/item/updateByApi`,
			method: 'POST',
			// 添加跨域相关配置
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
				s_number: 99, // 根据OpenAPI规范，这是必填字段，默认值为99
			}),
		});

		// 处理响应状态
		if (response.status !== 200) {
			throw new Error(`Failed to update ShowDoc article. Status: ${response.status}`);
		}

		// 处理更新结果
		const responseData = response.json;
		if (responseData.error_code !== 0) {
			// 如果错误与token相关，清除缓存的token
			if (responseData.error_message?.includes('token') || responseData.error_message?.includes('Token')) {
				this.userToken = null;
			}
			throw new Error(`ShowDoc API error: ${responseData.error_message}`);
		}

		// 显示成功通知
		new Notice('Successfully uploaded to ShowDoc!');
	}
}
