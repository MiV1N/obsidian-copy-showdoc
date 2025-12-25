import { App, TFile, Notice } from 'obsidian';
import { CopyDocumentAsHTMLSettings } from './settings';
import { ShowDocClient } from './showdocClient';
import { DocumentRenderer } from 'documentRenderer';

/**
 * Result of checking/converting an image file
 */
interface ImageProcessResult {
	fullLink: string;
	url: string | null;
}

/**
 * Handles uploading markdown content and its resources to ShowDoc
 */
export class ShowDocUploader {
	private client: ShowDocClient;

	constructor(private app: App, private settings: CopyDocumentAsHTMLSettings) {
		this.client = new ShowDocClient(this.app, this.settings);
	}

	/**
	 * Main entry point to upload a markdown file
	 * @param markdown Markdown content
	 * @param title Title for the article
	 * @param file The original TFile (for context)
	 */
	public async upload(markdown: string, title: string, file: TFile): Promise<void> {
		try {
			new Notice('Uploading to ShowDoc...');
			const token = await this.client.login();

			// Process content (upload images, replace links)
			const processedMarkdown = await this.replaceImagesInMarkdown(markdown, file, token);

			// Determine category
			const catName = this.determineCategory(file);

			// Update article
			await this.client.updateArticle(title, processedMarkdown, catName, token);

		} catch (error) {
			console.error('Failed to upload to ShowDoc:', error);
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`ShowDoc upload failed: ${msg}`);
		}
	}

	private determineCategory(file: TFile): string {
		let catName = '';
		if (this.settings.showdocParentCat) {
			catName = this.settings.showdocParentCat;
			if (file.parent) {
				// Determine if we should append direct parent. 
				// Original logic seemed to try appending parent name if it exists.
				// We keep it simple: if there is a parent, append it.
				catName += `/${file.parent.name}`;
			}
		} else if (file.parent) {
			catName = file.parent.name;
		}
		// Normalize slashes just in case
		return catName.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
	}

	private async replaceImagesInMarkdown(markdown: string, containingFile: TFile, token: string): Promise<string> {
		// Regex to find ![[image|...]] or ![[image]] style links
		const imageRegex = /!\[\[([^||\]]+)(?:\|([^\]]+))?\]\]/gu;
		const matches = [...markdown.matchAll(imageRegex)];

		if (matches.length === 0) {
			return markdown;
		}

		// Render document once to find actual <img> elements (needed for Excalidraw/SVGs sometimes for properties)
		const documentRenderer = new DocumentRenderer(this.app, this.settings);
		const topNode = await documentRenderer.renderDocument(markdown, containingFile.path);
		const imgElements = Array.from(topNode.querySelectorAll('img'));

		console.log(`Found ${matches.length} image references.`);

		const uploadPromises = matches.map(match =>
			this.processSingleImage(match, containingFile, imgElements, token)
		);

		const results = await Promise.all(uploadPromises);
		const successfulUploads = results.filter(r => r.url !== null);

		console.log(`Successfully uploaded: ${successfulUploads.length}/${matches.length}`);

		if (successfulUploads.length < matches.length) {
			console.warn(`${matches.length - successfulUploads.length} images failed to upload.`);
		}

		return this.applyReplacements(markdown, successfulUploads);
	}

	private async processSingleImage(
		match: RegExpMatchArray,
		containingFile: TFile,
		imgElements: HTMLImageElement[],
		token: string
	): Promise<ImageProcessResult> {
		const fullLink = match[0];
		const linkPath = match[1]; // path part e.g. "Assets/Image.png" or "Image.png"

		try {
			const { baseName, cleanPath } = this.parseLinkPath(linkPath);

			// Resolve file
			const imageFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, containingFile.path);

			if (!(imageFile instanceof TFile)) {
				console.warn(`File not found: ${cleanPath}`);
				return { fullLink, url: null };
			}

			// Find corresponding DOM element if needed (for Excalidraw etc)
			const imgElement = this.findMatchingImgElement(baseName, imgElements);

			let url: string | null = null;

			if (this.isConvertible(imageFile, cleanPath)) {
				// Handle conversions (SVG/Excalidraw)
				url = await this.handleConvertibleImage(imageFile, imgElement, token);
			} else {
				// Regular upload
				url = await this.uploadRegularImage(imageFile, token);
			}

			return { fullLink, url };

		} catch (error) {
			console.error(`Error processing image ${fullLink}:`, error);
			return { fullLink, url: null };
		}
	}

	private isConvertible(file: TFile, path: string): boolean {
		return path.includes('.svg') || path.includes('.excalidraw');
	}

	private parseLinkPath(linkPath: string) {
		// Remove anchor if present using regex or split
		// e.g. image.png#^123
		const cleanPath = linkPath.split('#^')[0].split('#')[0];
		const baseName = cleanPath.split('/').pop()!.split('\\').pop()!;
		return { baseName, cleanPath };
	}

	private findMatchingImgElement(baseName: string, elements: HTMLImageElement[]): HTMLImageElement | null {
		for (const img of elements) {
			const src = img.getAttribute('filesource') || img.alt || '';
			if (src.includes(baseName)) {
				return img;
			}
		}
		return null;
	}

	private async uploadRegularImage(file: TFile, token: string): Promise<string> {
		return this.client.uploadImage(file, token);
	}

	/**
	 * Handles complex logic for SVG/Excalidraw conversion -> PNG -> Upload
	 */
	private async handleConvertibleImage(
		file: TFile,
		imgElement: HTMLImageElement | null,
		token: string
	): Promise<string> {
		if (!imgElement && file.extension !== 'svg') {
			// If we don't have an img element to render from, and it's not a direct SVG file we can read, we fallback
			console.warn(`No img element for convertible file ${file.name}, trying raw upload fallback.`);
			return this.client.uploadImage(file, token);
		}

		try {
			// 1. Get Data URI
			const dataUri = await this.generatePngDataUri(file, imgElement);

			// 2. Convert to Binary
			const { content, name } = this.dataUriToBuffer(dataUri, file.name);

			// 3. Upload
			const dummyFile = { name: name } as any; // Mock TFile-like object for client
			return await this.client.uploadImageWithData(dummyFile, content, token);

		} catch (err) {
			console.error(`Conversion upload failed for ${file.name}, falling back to raw upload.`, err);
			return this.client.uploadImage(file, token);
		}
	}

	private async generatePngDataUri(file: TFile, imgElement: HTMLImageElement | null): Promise<string> {
		return new Promise(async (resolve, reject) => {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('Canvas context failure'));
				return;
			}

			const tempImage = new Image();
			tempImage.crossOrigin = "anonymous";

			// Load logic
			if (file.extension === 'svg') {
				const svgBytes = await this.app.vault.readBinary(file);
				const svgContent = new TextDecoder().decode(svgBytes);
				// Basic SVG sanitization/encoding could be here
				tempImage.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
			} else if (imgElement) {
				tempImage.src = imgElement.src;
			} else {
				reject(new Error('No source for image conversion'));
				return;
			}

			tempImage.onload = () => {
				const minSize = this.settings.imageMinSize || 1080;
				let { width, height } = tempImage;

				if (width < minSize || height < minSize) {
					const scale = Math.max(minSize / width, minSize / height);
					width *= scale;
					height *= scale;
				}

				canvas.width = width;
				canvas.height = height;
				ctx.drawImage(tempImage, 0, 0, width, height);

				try {
					const uri = canvas.toDataURL('image/png');
					resolve(uri);
				} catch (e) {
					reject(e);
				}
			};

			tempImage.onerror = (e) => reject(new Error('Image load failed'));
		});
	}

	private dataUriToBuffer(dataUri: string, originalName: string) {
		const base64 = dataUri.split(',')[1];
		if (!base64) throw new Error('Invalid Data URI');

		const bindata = atob(base64);
		const buffer = new Uint8Array(bindata.length);
		for (let i = 0; i < bindata.length; i++) {
			buffer[i] = bindata.charCodeAt(i);
		}

		const name = originalName.replace(/\.[^/.]+$/, '') + `_${Date.now()}.png`;
		return { content: buffer, name };
	}

	private applyReplacements(markdown: string, replacements: ImageProcessResult[]): string {
		let result = markdown;
		// Build map for unique replacements to avoid duplicate work
		// Sort by length desc to avoid partial replacement issues (though unlikely with fullLink)
		// Actually fullLink is safe.

		for (const { fullLink, url } of replacements) {
			if (!url) continue;

			// Global replace carefully
			// Escape special regex chars in fullLink
			const escapedLink = fullLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(escapedLink, 'g');
			result = result.replace(regex, `![](${url})`);
		}
		return result;
	}
}

