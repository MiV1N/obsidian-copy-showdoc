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

			// 1. Process Transclusions
			const expandedMarkdown = await this.processTransclusions(markdown, file);

			// 2. Process Callouts (Convert > [!type] to HTML)
			// Do this before image replacement so images inside callouts work? 
			// Or after? HTML inside markdown might affect image regex? 
			// Better do it before image replacement, as image replacement relies on ![[...]] which is robust. 
			// Callout conversion creates HTML <div>s, which are fine.
			const markdownWithCallouts = this.processCallouts(expandedMarkdown);

			// 3. Process content (upload images, replace links)
			const processedMarkdown = await this.replaceImagesInMarkdown(markdownWithCallouts, file, token);

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

	// ... (existing methods for category, transclusion, etc.)

	/**
	 * Converts Obsidian callouts to styled HTML divs.
	 */
	private processCallouts(markdown: string): string {
		const lines = markdown.split('\n');
		const resultLines: string[] = [];
		let inCallout = false;
		let calloutType = '';
		let calloutTitle = '';
		let calloutContent: string[] = [];

		// Callout definitions
		const calloutStyles: Record<string, { color: string, bg: string, icon: string, title: string }> = {
			'note': { color: '#0c5460', bg: '#e7f3fe', icon: 'ℹ', title: 'Note' },
			'abstract': { color: '#004085', bg: '#cce5ff', icon: '📋', title: 'Abstract' },
			'info': { color: '#0c5460', bg: '#d1ecf1', icon: 'ℹ', title: 'Info' },
			'todo': { color: '#004085', bg: '#cce5ff', icon: '✓', title: 'To Do' },
			'tip': { color: '#155724', bg: '#d4edda', icon: '💡', title: 'Tip' },
			'success': { color: '#155724', bg: '#d4edda', icon: '✔', title: 'Success' },
			'question': { color: '#856404', bg: '#fff3cd', icon: '❓', title: 'Question' },
			'warning': { color: '#856404', bg: '#fff3cd', icon: '⚠', title: 'Warning' },
			'failure': { color: '#721c24', bg: '#f8d7da', icon: '❌', title: 'Failure' },
			'danger': { color: '#721c24', bg: '#f8d7da', icon: '⚡', title: 'Danger' },
			'bug': { color: '#721c24', bg: '#f8d7da', icon: '🐞', title: 'Bug' },
			'error': { color: '#721c24', bg: '#f8d7da', icon: '✖', title: 'Error' },
			'example': { color: '#383d41', bg: '#e2e3e5', icon: '📝', title: 'Example' },
			'quote': { color: '#6c757d', bg: '#f8f9fa', icon: '💬', title: 'Quote' },
		};
		// Fallback for aliases or unknown types could map to 'note' or specific ones.
		// Some maps:
		const typeAliases: Record<string, string> = {
			'tldr': 'abstract',
			'faq': 'question',
			'help': 'question',
			'caution': 'danger',
			'attention': 'warning',
			'check': 'success',
			'done': 'success',
			'fail': 'failure',
			'missing': 'failure',
			'important': 'attention', // wait, attention -> warning
			// Add simpler mappings logic later if needed
		};


		const closeCallout = () => {
			if (!inCallout) return;

			// Normalize type
			let type = calloutType.toLowerCase();
			if (typeAliases[type]) type = typeAliases[type];
			const style = calloutStyles[type] || calloutStyles['note'];

			// Build HTML
			const titleHtml = `<strong style="display: block; margin-bottom: 5px;">${style.icon} ${calloutTitle || style.title}</strong>`;

			// Should content be parsed as markdown? ShowDoc might support MD inside HTML if we just output the inner MD.
			// But usually ShowDoc (Editor.md) might handle mixed HTML/MD okay, OR we might need to rely on the outer renderer.
			// However, wrapping MD in <div> usually works in many parsers.
			// We just strip the '> ' prefix.

			// Remove first line if it's empty (padding)
			if (calloutContent.length > 0 && calloutContent[0].trim() === '') calloutContent.shift();

			const bodyText = calloutContent.join('\n');

			const html = `<div style="padding: 15px; border-left: 5px solid #2196F3; border-color: ${style.color}; background-color: ${style.bg}; color: ${style.color}; border-radius: 4px; margin-bottom: 20px;">${titleHtml}${bodyText}</div>`;
			resultLines.push(html);

			inCallout = false;
			calloutContent = [];
		};

		const calloutRegex = /^>\s*\[!\s*(\w+)\](.*)$/;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = line.match(calloutRegex);

			if (match) {
				// If already in callout, close it (though standard obsidian merges blockquotes if contiguous? 
				// typically new callout header means new callout)
				if (inCallout) {
					closeCallout();
				}

				inCallout = true;
				calloutType = match[1];
				calloutTitle = match[2].trim();
				calloutContent = [];
				continue;
			}

			if (inCallout) {
				// Check if line continues the blockquote
				// Line must start with '>'
				if (line.trim().startsWith('>')) {
					// Strip the first '>' and optional space
					let contentLine = line.trimStart();
					if (contentLine.startsWith('>')) {
						contentLine = contentLine.substring(1);
						if (contentLine.startsWith(' ')) contentLine = contentLine.substring(1);
					}
					calloutContent.push(contentLine);
				} else if (line.trim() === '') {
					// Empty line inside a blockquote (in Obsidian source, often represented as just '>') 
					// But if it's truly empty string in split, it breaks the blockquote usually unless next line has >.
					// Obsidian handles "lazy" blockquotes sometimes?
					// Safe regex assumption: if line has no '>', block ends.
					closeCallout();
					resultLines.push(line);
				} else {
					// Non-quoted line, ends callout
					closeCallout();
					resultLines.push(line);
				}
			} else {
				resultLines.push(line);
			}
		}

		// Close any processing callout at EOF
		if (inCallout) {
			closeCallout();
		}

		return resultLines.join('\n');
	}

	// ... (rest of methods like replaceImagesInMarkdown)


	private determineCategory(file: TFile): string {
		let catName = '';
		if (this.settings.showdocParentCat) {
			catName = this.settings.showdocParentCat;
			if (file.parent && !file.parent.isRoot()) {
				catName += `/${file.parent.path}`;
			}
		} else if (file.parent && !file.parent.isRoot()) {
			catName = file.parent.path;
		}
		// Normalize slashes just in case
		return catName.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
	}

	/**
	 * Resolves ![[Note#Section]] style transclusions.
	 * Content is wrapped in blockquotes (>).
	 */
	private async processTransclusions(markdown: string, sourceFile: TFile): Promise<string> {
		// Regex for standard wikilink embed: ![[Path|Alt]] or ![[Path]]
		// We capture: 1=Path (including #anchor), 2=Alt (optional)
		const embedRegex = /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;

		// We need to replace async, so we gather matches first
		// Note: We use a loop to handle replacements to handle multiple instances correctly

		// Since we can't easily do async replace with string.replace, we'll build a map of replacements
		const matches = [...markdown.matchAll(embedRegex)];
		if (matches.length === 0) return markdown;

		let newMarkdown = markdown;
		const replacements = new Map<string, string>();

		for (const match of matches) {
			const fullMatch = match[0];
			const linkPath = match[1];

			// Skip if looks like an image or other asset (handled by image processor)
			if (this.isAsset(linkPath)) {
				continue;
			}

			try {
				const content = await this.resolveTransclusion(linkPath, sourceFile);
				if (content !== null) {
					// Wrap in blockquote
					const quotedContent = content.split('\n').map(line => `> ${line}`).join('\n');
					replacements.set(fullMatch, quotedContent);
				}
			} catch (e) {
				console.error(`Failed to resolve transclusion for ${linkPath}`, e);
				// Leave as is if failed
			}
		}

		// Apply replacements
		for (const [key, value] of replacements) {
			newMarkdown = newMarkdown.split(key).join(value + '\n');
		}

		return newMarkdown;
	}

	private isAsset(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase();
		// Include excalidraw and other common non-markdown extensions
		const assetExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'excalidraw'];
		return ext ? assetExts.includes(ext) : false;
	}

	private async resolveTransclusion(linkPath: string, sourceFile: TFile): Promise<string | null> {
		const { cleanPath, anchor } = this.parseLink(linkPath);

		const targetFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, sourceFile.path);

		// Strict check: Must be a TFile and must be markdown (.md)
		if (!targetFile || !(targetFile instanceof TFile) || targetFile.extension !== 'md') {
			return null;
		}

		const fileContent = await this.app.vault.read(targetFile);

		if (!anchor) {
			// Whole file
			return fileContent;
		}

		const cache = this.app.metadataCache.getFileCache(targetFile);
		if (!cache) return fileContent;

		if (anchor.startsWith('^')) {
			// Block reference
			const blockId = anchor.substring(1);
			if (cache.blocks && cache.blocks[blockId]) {
				const block = cache.blocks[blockId];
				return this.substringLines(fileContent, block.position.start.line, block.position.end.line);
			}
		} else {
			// Header reference
			// Heading matching is fuzzy (case-insensitive usually in Obsidian?) - let's try exact first
			// Anchors in linkPath usually come as "Header Name" or "Group#Header"
			// The linkPath passed here is stripped of # by parseLink? No, parseLink separates it.

			if (cache.headings) {
				const headingName = anchor;
				// Find matching heading
				const headingIndex = cache.headings.findIndex(h => h.heading === headingName);
				if (headingIndex >= 0) {
					const startHeading = cache.headings[headingIndex];
					const startLine = startHeading.position.start.line;
					let endLine = -1;

					// Find end: next heading of same or lower level (numerically smaller or equal?)
					// H1=1, H2=2. Subsections are higher level number.
					// We stop at next heading where level <= startHeading.level
					for (let i = headingIndex + 1; i < cache.headings.length; i++) {
						const h = cache.headings[i];
						if (h.level <= startHeading.level) {
							endLine = h.position.start.line - 1;
							break;
						}
					}

					// If no end heading found, go to end of file? 
					// Or end of sections? MetadataCache usually behaves well.
					// We can also check sections or just take to EOF.

					if (endLine === -1) {
						// To end of file?
						// Read simply to end
						return this.substringLines(fileContent, startLine);
					}
					return this.substringLines(fileContent, startLine, endLine);
				}
			}
		}

		// Fallback: return whole content or null?
		return null;
	}

	private parseLink(linkPath: string) {
		// linkPath is like "Folder/File#Header" or "File#^blockid"
		// We already stripped |Alt in previous step regex match
		const parts = linkPath.split('#');
		const cleanPath = parts[0];
		// Handle case where header itself might contain # (unlikely but possible)
		const anchor = parts.length > 1 ? parts.slice(1).join('#') : null;
		return { cleanPath, anchor };
	}

	private substringLines(content: string, startLine: number, endLine?: number): string {
		const lines = content.split('\n');
		if (endLine === undefined) {
			return lines.slice(startLine).join('\n');
		}
		return lines.slice(startLine, endLine + 1).join('\n');
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
		for (let i = 0; i < elements.length; i++) {
			const img = elements[i];
			const src = img.getAttribute('filesource') || img.alt || '';
			// Decode src to handle URL encoding (e.g. spaces -> %20)
			const decodedSrc = decodeURIComponent(src);

			if (decodedSrc.includes(baseName) || src.includes(baseName)) {
				elements.splice(i, 1); // Consume the element so it's not reused
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

