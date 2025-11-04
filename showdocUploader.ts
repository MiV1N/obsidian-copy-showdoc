import { App, TFile, Notice } from 'obsidian';
import { CopyDocumentAsHTMLSettings } from './settings';
import { ShowDocClient } from './showdocClient';
import { DocumentRenderer } from 'documentRenderer';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);

export class ShowDocUploader {
    private client: ShowDocClient;

    constructor(private app: App, private settings: CopyDocumentAsHTMLSettings) {
        this.client = new ShowDocClient(this.app, this.settings);
    }

    public async upload(markdown: string, title: string, file: TFile) {
        try {
            new Notice('Uploading to ShowDoc...');
            const token = await this.client.login();

            const processedMarkdown = await this.replaceImagesInMarkdown(markdown, file, token);

            let catName = '';
            if (this.settings.showdocParentCat) {
                catName = this.settings.showdocParentCat;
                if (file.parent) {
                    catName += `/${file.parent.name}`;
                }
            } else if (file.parent) {
                catName = file.parent.name;
            }

            await this.client.updateArticle(title, processedMarkdown, catName, token);

        } catch (error) {
            console.error('Failed to upload to ShowDoc:', error);
            new Notice(`ShowDoc upload failed: ${error.message}`);
        }
    }

    private async replaceImagesInMarkdown(markdown: string, containingFile: TFile, token: string): Promise<string> {
        try {
            // 修改图片正则表达式以支持带有额外参数的图片链接格式
            // 匹配 ![[file]] 或 ![[file|width]] 或 ![[file#anchor]] 或 ![[file#anchor|width]] 等格式
            const imageRegex = /!\[\[([^||\]]+)(?:\|([^\]]+))?\]\]/gu; // Added 'g' and 'u' flags	
            const imagePromises = [];
            const imageMatches = [...markdown.matchAll(imageRegex)];

            // 渲染Markdown以获取图片元素
            const documentRenderer = new DocumentRenderer(this.app, this.settings);
            const topNode = await documentRenderer.renderDocument(markdown, containingFile.path);
            const imgElements = topNode.querySelectorAll('img');

        // 上传所有图片，传递同一个token
			for (const match of imageMatches) {
				try {
					// 提取完整的链接内容（包括可能的锚点和参数）
					const fullLink = match[0];
					// 提取完整的路径部分（可能包含锚点）
					const fullPathWithAnchor = match[1]; // 匹配第一组或第二组
					// 提取基本文件名（用于获取文件引用）
					let baseFileNameWithAnchor = fullPathWithAnchor.split('/').pop()!.split('\\').pop()!;
					// 检查是否包含#^锚点部分
					const hasAnchor = fullPathWithAnchor.includes('#^');
					let fullPathWithoutAnchor = fullPathWithAnchor;
					if (hasAnchor) {
						fullPathWithoutAnchor = fullPathWithAnchor.split('#^')[0];
					}
					
					console.log(`Processing image: ${fullPathWithAnchor}, Base filename: ${baseFileNameWithAnchor}, Has anchor: ${hasAnchor}`);
					
					// 获取实际的文件引用（使用基本文件名）
					const imageFile = this.app.metadataCache.getFirstLinkpathDest(fullPathWithoutAnchor, containingFile.path);
					if (imageFile instanceof TFile) {

						//在imgElements中匹配img元素，匹配方式为filesource属性或者alt中是否包含markdown中的文件名	
						let imgElement: HTMLImageElement | null = null;
						for (const imgNode of Array.from(imgElements)) {
							const img = imgNode as HTMLImageElement;
							const filesource = img.getAttribute('filesource');
							console.log(`Image processing: Full path with anchor: ${fullPathWithAnchor}, Base filename: ${baseFileNameWithAnchor}, Filesource: ${filesource}`);
							
							// 检查filesource属性是否包含文件名,Excalidraw文件
							if (filesource && filesource.includes(baseFileNameWithAnchor)) {
								imgElement = img;
								break;
							}
					
							// 检查alt属性是否包含文件名
							if (img.alt && img.alt.includes(baseFileNameWithAnchor) ) {
								imgElement = img;
								break;
							}
						}
						
						//如果没有找到img元素，跳过该文件
						if (!imgElement) {
							console.log(`No img element found for ${fullPathWithAnchor}, skip`);
							// 直接上传文件
							continue;
						}

						console.log(`Found img element for ${fullPathWithAnchor}, checking file type: ${imageFile.extension}`);
					
						// 检查是否需要特殊处理（svg嵌入或Excalidraw嵌入）
						// 如果是手动输入的方式嵌入的excalidraw文件，引用的文件是.excalidraw,如果是在excalidraw中拷贝的连接，引用的文件是.excalidraw.md
						if (fullPathWithAnchor.includes('.svg') || 
						   (fullPathWithAnchor.includes('.excalidraw'))) {
								console.log(`Special handling for ${imageFile.extension} file: ${fullPathWithAnchor}`);
								
							// 创建一个新的公共方法来处理图片转换，避免访问私有方法
							try {

								let svgDataUri: string;
								if (imageFile.extension === 'svg') {
									// 直接从文件系统读取SVG内容，避免使用可能导致跨域问题的imgElement.src
									const fileContent = await this.app.vault.readBinary(imageFile);
									const textDecoder = new TextDecoder('utf-8');
									const svgContent = textDecoder.decode(fileContent);
									
									// 创建一个数据URI，这样可以避免跨域问题
									const dataUriPrefix = 'data:image/svg+xml;charset=utf-8,';
										
									const encodedSvgContent = encodeURIComponent(svgContent);
									svgDataUri = dataUriPrefix + encodedSvgContent;
								}

								// 使用canvas将img/svg元素转换为data URL
								const canvas = document.createElement('canvas');
								const ctx = canvas.getContext('2d');
								if (!ctx) {
									throw new Error('Could not create canvas context');
								}
								
								// 创建一个新的Image对象，并设置crossOrigin以避免canvas污染问题
								const tempImage = new Image();
								tempImage.crossOrigin = "anonymous";
								const imageMinSize = this.settings.imageMinSize || 1080;
								
								// 使用Promise来处理图片加载
								const dataUri = await new Promise<string>((resolve, reject) => {
									tempImage.onload = () => {
										// 计算尺寸
										// 保持原始比例，仅当宽或高小于 imageMinSize 时才放大
										let newWidth = tempImage.naturalWidth;
										let newHeight = tempImage.naturalHeight;

										if (tempImage.naturalWidth < imageMinSize || tempImage.naturalHeight < imageMinSize) {
											const scale = Math.max(
												imageMinSize / tempImage.naturalWidth,
												imageMinSize / tempImage.naturalHeight
											);
											newWidth = tempImage.naturalWidth * scale;
											newHeight = tempImage.naturalHeight * scale;
										}

										// 设置 canvas 尺寸并绘制
										canvas.width = newWidth;
										canvas.height = newHeight;
										ctx.drawImage(tempImage, 0, 0, newWidth, newHeight);

										try {
											const uri = canvas.toDataURL('image/png');
											resolve(uri);
										} catch (err) {
											console.error(`Failed to convert image to data URL: ${err}`);
											reject(err);
										}
									};

									tempImage.onerror = (err) => {
										console.error(`Could not load image: ${err}`);
										reject(new Error('Failed to load image'));
									};
									
									if (imageFile.extension === 'svg') {
										// 使用从文件系统读取的SVG内容创建的数据URI
										tempImage.src = svgDataUri;
									}else if (imgElement) {
										// 直接使用img元素的src（添加null检查）
										tempImage.src = imgElement.src;
									} else {
										reject(new Error('Image element is null'));
									}
									
								});
								if (!dataUri || !dataUri.startsWith('data:image/png;base64,')) {
									throw new Error('Invalid data URI format or not a PNG image');
								}
								
								// 从dataUri中提取base64数据
								const base64Data = dataUri.split(',')[1];
								if (!base64Data) {
									throw new Error('Failed to extract base64 data');
								}
								
								// 转换为Uint8Array
								const byteCharacters = atob(base64Data);
								const byteArray = new Uint8Array(byteCharacters.length);
								for (let i = 0; i < byteCharacters.length; i++) {
									byteArray[i] = byteCharacters.charCodeAt(i);
								}
								
								// 创建一个新的唯一文件名，使用png扩展名和时间戳确保唯一性
								const timestamp = Date.now();
								const pngFileName = imageFile.name.replace(/\.[^/.]+$/, '') + `_${timestamp}.png`;
								
								console.log(`Converted ${fullPathWithAnchor} to ${pngFileName}, size: ${byteArray.length} bytes`);
								
								// 创建一个临时的TFile对象
								const processedImageFile = {
									...imageFile,
									name: pngFileName,
									extension: 'png'
								} as TFile;
								
								// 使用修改后的文件对象和数据上传
								imagePromises.push(this.client.uploadImageWithData(processedImageFile, byteArray, token).then(url => {
									console.log(`Successfully uploaded converted image: ${url}`);
									return { fullLink, url };
								}).catch(error => {
									console.error(`Failed to upload converted image ${fullPathWithAnchor}: ${error.message}`);
									// 失败时尝试直接上传原始文件
									return this.client.uploadImage(imageFile, token).then(url => ({ fullLink, url })).catch(fallbackError => {
										console.error(`Fallback upload failed for ${fullPathWithAnchor}: ${fallbackError.message}`);
										return { fullLink, url: null };
									});
								}));
							} catch (conversionError) {
								console.error(`Conversion error for ${fullPathWithAnchor}: ${conversionError.message}`);
								// 转换失败时尝试直接上传原始文件
								imagePromises.push(this.client.uploadImage(imageFile, token).then(url => ({ fullLink, url })).catch(fallbackError => {
									console.error(`Fallback upload failed for ${fullPathWithAnchor}: ${fallbackError.message}`);
									return { fullLink, url: null };
								}));
							}
						} else {
							// 普通图片文件直接上传
							console.log(`Uploading regular image: ${fullPathWithAnchor}`);
							imagePromises.push(this.client.uploadImage(imageFile, token).then(url => ({ fullLink, url })).catch(error => {
								console.error(`Failed to upload regular image ${fullPathWithAnchor}: ${error.message}`);
								return { fullLink, url: null };
							}));
						}
					} else {
						console.log(`File not found or not a TFile: ${fullPathWithAnchor}`);
					}
				} catch (error) {
					console.error(`Error processing image match: ${error.message}`);
					// 继续处理下一个图片，避免一个图片处理失败影响整体上传
				}
			}

			const uploadedImages = await Promise.all(imagePromises);
			console.log(`Total images processed: ${uploadedImages.length}`);
			
			// 过滤掉上传失败的图片（url为null）
			const successfulUploads = uploadedImages.filter(img => img.url !== null);
			console.log(`Successfully uploaded images: ${successfulUploads.length}`);
			
			// 使用完整链接作为key，以便准确替换
			const imageUrlMap = new Map(successfulUploads.map(img => [img.fullLink, img.url]));

			// 更新markdown中的图片链接
			let replacementCount = 0;
			for (const [fullLink, url] of imageUrlMap.entries()) {
				// 使用正则表达式进行全局替换，并转义特殊字符
				const escapedLink = fullLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const regex = new RegExp(escapedLink, 'g');
				const matches = markdown.match(regex);
				const originalLength = markdown.length;
				markdown = markdown.replace(regex, `![](${url})`);
				const replacements = matches ? matches.length : 0;
				if (replacements > 0) {
					replacementCount += replacements;
					console.log(`Replaced ${replacements} occurrence(s) of link: ${fullLink.substring(0, 50)}... with URL: ${url}`);
				}
			}
			
			console.log(`Total image links replaced: ${replacementCount}`);
			
			// 如果有上传失败的图片，显示警告
			if (uploadedImages.length > successfulUploads.length) {
				const failedCount = uploadedImages.length - successfulUploads.length;
				console.warn(`Warning: ${failedCount} images failed to upload`);
			}

			// 处理分类名称
			let catName = containingFile.parent?.path.replace(/\\/g, '/') || '';
			if (this.settings.showdocParentCat) {
				catName = `${this.settings.showdocParentCat}/${catName}`.replace(/^\/|\/$/, '');
			}

			// 更新文章，传递同一个token
			// await client.updateArticle(title, markdown, catName, userToken);

		} catch (error) {
			new Notice(`Upload to ShowDoc failed: ${error.message}`);
			console.error('Upload to ShowDoc failed', error);
		} finally {
			// Cleanup code if needed
		}

        return markdown;
    }
}
