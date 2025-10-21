import {
	App,
	arrayBufferToBase64,
	Component,
	FileSystemAdapter,
	MarkdownRenderer,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	requestUrl,
	request,
	Setting,
	TAbstractFile,
	TFile
} from 'obsidian';
// MultipartLite removed, now using Uint8Array directly

/*
 * Generic lib functions
 */

/**
 * Like Promise.all(), but with a callback to indicate progress. Graciously lifted from
 * https://stackoverflow.com/a/42342373/1341132
 */
function allWithProgress(promises: Promise<never>[], callback: (percentCompleted: number) => void) {
	let count = 0;
	callback(0);
	for (const promise of promises) {
		promise.then(() => {
			count++;
			callback((count * 100) / promises.length);
		});
	}
	return Promise.all(promises);
}

/**
 * Do nothing for a while
 */
async function delay(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Static assets
 */

const DEFAULT_STYLESHEET =
	`body,input {
  font-family: "Roboto","Helvetica Neue",Helvetica,Arial,sans-serif
}

code, kbd, pre {
  font-family: "Roboto Mono", "Courier New", Courier, monospace;
  background-color: #f5f5f5;
}

pre {
  padding: 1em 0.5em;
}

table {
  background: white;
  border: 1px solid #666;
  border-collapse: collapse;
  padding: 0.5em;
}

table thead th,
table tfoot th {
  text-align: left;
  background-color: #eaeaea;
  color: black;
}

table th, table td {
  border: 1px solid #ddd;
  padding: 0.5em;
}

table td {
  color: #222222;
}

.callout[data-callout="abstract"] .callout-title,
.callout[data-callout="summary"] .callout-title,
.callout[data-callout="tldr"]  .callout-title,
.callout[data-callout="faq"] .callout-title,
.callout[data-callout="info"] .callout-title,
.callout[data-callout="help"] .callout-title {
  background-color: #828ee7;
}
.callout[data-callout="tip"] .callout-title,
.callout[data-callout="hint"] .callout-title,
.callout[data-callout="important"] .callout-title {
  background-color: #34bbe6;
}
.callout[data-callout="success"] .callout-title,
.callout[data-callout="check"] .callout-title,
.callout[data-callout="done"] .callout-title {
  background-color: #a3e048;
}
.callout[data-callout="question"] .callout-title,
.callout[data-callout="todo"] .callout-title {
  background-color: #49da9a;
}
.callout[data-callout="caution"] .callout-title,
.callout[data-callout="attention"] .callout-title {
  background-color: #f7d038;
}
.callout[data-callout="warning"] .callout-title,
.callout[data-callout="missing"] .callout-title,
.callout[data-callout="bug"] .callout-title {
  background-color: #eb7532;
}
.callout[data-callout="failure"] .callout-title,
.callout[data-callout="fail"] .callout-title,
.callout[data-callout="danger"] .callout-title,
.callout[data-callout="error"] .callout-title {
  background-color: #e6261f;
}
.callout[data-callout="example"] .callout-title {
  background-color: #d23be7;
}
.callout[data-callout="quote"] .callout-title,
.callout[data-callout="cite"] .callout-title {
  background-color: #aaaaaa;
}

.callout-icon {
  flex: 0 0 auto;
  display: flex;
  align-self: center;
}

svg.svg-icon {
  height: 18px;
  width: 18px;
  stroke-width: 1.75px;
}

.callout {
  overflow: hidden;
  margin: 1em 0;
  box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12), 0 3px 1px -2px rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.callout-title {
  padding: .5em;
  display: flex;
  gap: 8px;
  font-size: inherit;
  color: black;
  line-height: 1.3em;
}

.callout-title-inner {
  font-weight: bold;
  color: black;
}

.callout-content {
  overflow-x: auto;
  padding: 0.25em .5em;
  color: #222222;
  background-color: white !important;
}

ul.contains-task-list {
  padding-left: 0;
  list-style: none;
}

ul.contains-task-list ul.contains-task-list {
  padding-left: 2em;
}

ul.contains-task-list li input[type="checkbox"] {
  margin-right: .5em;
}

.callout-table,
.callout-table tr,
.callout-table p {
  width: 100%;
  padding: 0;
}

.callout-table td {
  width: 100%;
  padding: 0 1em;
}

.callout-table p {
  padding-bottom: 0.5em;
}

.source-table {
  width: 100%;
  background-color: #f5f5f5;
}
`;

// Thank you again Olivier Balfour !
const MERMAID_STYLESHEET = `
:root {
  --default-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif;
  --font-monospace: 'Source Code Pro', monospace;
  --background-primary: #ffffff;
  --background-modifier-border: #ddd;
  --text-accent: #705dcf;
  --text-accent-hover: #7a6ae6;
  --text-normal: #2e3338;
  --background-secondary: #f2f3f5;
  --background-secondary-alt: #fcfcfc;
  --text-muted: #888888;
  --font-mermaid: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif;
  --text-error: #E4374B;
  --background-primary-alt: '#fafafa';
  --background-accent: '';
  --interactive-accent: hsl( 254,  80%, calc( 68% + 2.5%));
  --background-modifier-error: #E4374B;
  --background-primary-alt: #fafafa;
  --background-modifier-border: #e0e0e0;
}
`;

const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>\${title}</title>
  <style>
    \${MERMAID_STYLESHEET}
    \${stylesheet}
  </style>
</head>
<body>
\${body}
</body>
</html>
`;


/*
 * Plugin code
 */

/** Don't allow multiple copy processes to run at the same time */
let copyIsRunning = false;

/** true while a block is being processed by MarkDownPostProcessor instances */
let ppIsProcessing = false;

/** moment at which the last block finished post-processing */
let ppLastBlockDate = Date.now();


enum FootnoteHandling {
	/** Remove references and links */
	REMOVE_ALL,

	/** Reference links to footnote using a unique id */
	LEAVE_LINK,

	/** Links are removed from reference and back-link from footnote */
	REMOVE_LINK,

	/** Footnote is moved to title attribute */
	TITLE_ATTRIBUTE
}

enum InternalLinkHandling {
	/**
	 * remove link and only display link text
	 */
	CONVERT_TO_TEXT,

	/**
	 * convert to an obsidian:// link to open the file or tag in Obsidian
	 */
	CONVERT_TO_OBSIDIAN_URI,

	/**
	 * Keep link, but convert extension to .html
	 */
	LINK_TO_HTML,

	/**
	 * Keep generated link
	 */
	LEAVE_AS_IS
}

/**
 * Options for DocumentRenderer
 */
type DocumentRendererOptions = {
	convertSvgToBitmap: boolean,
	removeFrontMatter: boolean,
	formatCodeWithTables: boolean,
	formatCalloutsWithTables: boolean,
	embedExternalLinks: boolean,
	removeDataviewMetadataLines: boolean,
	footnoteHandling: FootnoteHandling
	internalLinkHandling: InternalLinkHandling,
	disableImageEmbedding: boolean,
	imageMinSize: number
};

const documentRendererDefaults: DocumentRendererOptions = {
	convertSvgToBitmap: true,
	removeFrontMatter: true,
	formatCodeWithTables: false,
	formatCalloutsWithTables: false,
	embedExternalLinks: false,
	removeDataviewMetadataLines: false,
	footnoteHandling: FootnoteHandling.REMOVE_LINK,
	internalLinkHandling: InternalLinkHandling.CONVERT_TO_TEXT,
	disableImageEmbedding: false,
	imageMinSize: 1080,
};

/**
 * Render markdown to DOM, with some clean-up and embed images as data uris.
 */
class DocumentRenderer {
	private modal: CopyingToHtmlModal;
	private view: Component;

	// time required after last block was rendered before we decide that rendering a view is completed
	private optionRenderSettlingDelay: number = 100;

	// only those which are different from image/${extension}
	private readonly mimeMap = new Map([
		['svg', 'image/svg+xml'],
		['jpg', 'image/jpeg'],
	]);

	private readonly externalSchemes = ['http', 'https'];

	private readonly vaultPath: string;
	private readonly vaultLocalUriPrefix: string;
	private readonly vaultOpenUri: string;
	private readonly vaultSearchUri: string;

	constructor(private app: App,
				private options: DocumentRendererOptions = documentRendererDefaults) {
		this.vaultPath = (this.app.vault.getRoot().vault.adapter as FileSystemAdapter).getBasePath()
			.replace(/\\/g, '/');

		this.vaultLocalUriPrefix = `app://local/${this.vaultPath}`;

		this.vaultOpenUri = `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}`;
		this.vaultSearchUri = `obsidian://search?vault=${encodeURIComponent(this.app.vault.getName())}`;

		this.view = new Component();
	}

	/**
	 * Render document into detached HTMLElement
	 */
	public async renderDocument(markdown: string, path: string): Promise<HTMLElement> {
		this.modal = new CopyingToHtmlModal(this.app);
		this.modal.open();

		try {
			const topNode = await this.renderMarkdown(markdown, path);
			return await this.transformHTML(topNode!);
		} finally {
			this.modal.close();
		}
	}

	/**
	 * Render current view into HTMLElement, expanding embedded links
	 */
	private async renderMarkdown(markdown: string, path: string): Promise<HTMLElement> {
		const processedMarkdown = this.preprocessMarkdown(markdown);

		const wrapper = document.createElement('div');
		wrapper.style.display = 'hidden';
		document.body.appendChild(wrapper);
		await MarkdownRenderer.render(this.app, processedMarkdown, wrapper, path, this.view);
		await this.untilRendered();

		await this.loadComponents(this.view);

		const result = wrapper.cloneNode(true) as HTMLElement;
		document.body.removeChild(wrapper);

		this.view.unload();
		return result;
	}

	/**
	 * Some plugins may expose components that rely on onload() to be called which isn't the case due to the
	 * way we render the markdown. We need to call onload() on all components to ensure they are properly loaded.
	 * Since this is a bit of a hack (we need to access Obsidian internals), we limit this to components of which
	 * we know that they don't get rendered correctly otherwise.
	 * We attempt to make sure that if the Obsidian internals change, this will fail gracefully.
	 */
	private async loadComponents(view: Component) {
		type InternalComponent = Component & {
			_children: Component[];
			onload: () => void | Promise<void>;
		}

		const internalView = view as InternalComponent;

		// recursively call onload() on all children, depth-first
		const loadChildren = async (
			component: Component,
			visited: Set<Component> = new Set()
		): Promise<void> => {
			if (visited.has(component)) {
				return;  // Skip if already visited
			}

			visited.add(component);

			const internalComponent = component as InternalComponent;

			if (internalComponent._children?.length) {
				for (const child of internalComponent._children) {
					await loadChildren(child, visited);
				}
			}

			try {
				// relies on the Sheet plugin (advanced-table-xt) not to be minified
				if (component?.constructor?.name === 'SheetElement') {
					await component.onload();
				}
			} catch (error) {
				console.error(`Error calling onload()`, error);
			}
		};

		await loadChildren(internalView);
	}

	private preprocessMarkdown(markdown: string): string {
		let processed = markdown;

		if (this.options.removeDataviewMetadataLines) {
			processed = processed.replace(/^[^ \t:#`<>][^:#`<>]+::.*$/gm, '');
		}

		return processed;
	}

	/**
	 * Wait until the view has finished rendering
	 *
	 * Beware, this is a dirty hack...
	 *
	 * We have no reliable way to know if the document finished rendering. For instance dataviews or task blocks
	 * may not have been post processed.
	 * MarkdownPostProcessors are called on all the "blocks" in the HTML view. So we register one post-processor
	 * with high-priority (low-number to mark the block as being processed), and another one with low-priority that
	 * runs after all other post-processors.
	 * Now if we see that no blocks are being post-processed, it can mean 2 things :
	 *  - either we are between blocks
	 *  - or we finished rendering the view
	 * On the premise that the time that elapses between the post-processing of consecutive blocks is always very
	 * short (just iteration, no work is done), we conclude that the render is finished if no block has been
	 * rendered for enough time.
	 */
	private async untilRendered() {
		while (ppIsProcessing || Date.now() - ppLastBlockDate < this.optionRenderSettlingDelay) {
			if (ppLastBlockDate === 0) {
				break;
			}
			await delay(20);
		}
	}

	/**
	 * Transform rendered markdown to clean it up and embed images
	 */
	private async transformHTML(element: HTMLElement): Promise<HTMLElement> {
		// Remove styling which forces the preview to fill the window vertically
		// @ts-ignore
		const node: HTMLElement = element.cloneNode(true);
		node.removeAttribute('style');

		if (this.options.removeFrontMatter) {
			this.removeFrontMatter(node);
		}

		this.replaceLinksOfClass(node, 'internal-link');
		this.replaceLinksOfClass(node, 'tag');
		this.makeCheckboxesReadOnly(node);
		this.removeCollapseIndicators(node);
		this.removeButtons(node);
		this.removeStrangeNewWorldsLinks(node);

		if (this.options.formatCodeWithTables) {
			this.transformCodeToTables(node);
		}

		if (this.options.formatCalloutsWithTables) {
			this.transformCalloutsToTables(node);
		}

		if (this.options.footnoteHandling == FootnoteHandling.REMOVE_ALL) {
			this.removeAllFootnotes(node);
		}
		if (this.options.footnoteHandling == FootnoteHandling.REMOVE_LINK) {
			this.removeFootnoteLinks(node);
		} else if (this.options.footnoteHandling == FootnoteHandling.TITLE_ATTRIBUTE) {
			// not supported yet
		}

		if (!this.options.disableImageEmbedding) {
			await this.embedImages(node);
			await this.renderSvg(node);
		}

		return node;
	}

	/** Remove front-matter */
	private removeFrontMatter(node: HTMLElement) {
		node.querySelectorAll('.frontmatter, .frontmatter-container')
			.forEach(node => node.remove());
	}

	private replaceLinksOfClass(node: HTMLElement, className: string) {
		if (this.options.internalLinkHandling === InternalLinkHandling.LEAVE_AS_IS) {
			return;
		}

		node.querySelectorAll(`a.${className}`)
			.forEach(node => {
				switch (this.options.internalLinkHandling) {
					case InternalLinkHandling.CONVERT_TO_OBSIDIAN_URI: {
						const linkNode = node.parentNode!.createEl('a');
						linkNode.innerText = node.getText();

						if (className === 'tag') {
							linkNode.href = this.vaultSearchUri + "&query=tag:" + encodeURIComponent(node.getAttribute('href')!);
						} else {
							if (node.getAttribute('href')!.startsWith('#')) {
								linkNode.href = node.getAttribute('href')!;
							} else {
								linkNode.href = this.vaultOpenUri + "&file=" + encodeURIComponent(node.getAttribute('href')!);
							}
						}
						linkNode.className = className;
						node.parentNode!.replaceChild(linkNode, node);
					}
						break;

					case InternalLinkHandling.LINK_TO_HTML: {
						const linkNode = node.parentNode!.createEl('a');
						linkNode.innerText = node.getAttribute('href')!; //node.getText();
						linkNode.className = className;
						if (node.getAttribute('href')!.startsWith('#')) {
							linkNode.href = node.getAttribute('href')!;
						} else {
							linkNode.href = node.getAttribute('href')!.replace(/^(.*?)(?:\.md)?(#.*?)?$/, '$1.html$2');
						}
						node.parentNode!.replaceChild(linkNode, node);
					}
						break;

					case InternalLinkHandling.CONVERT_TO_TEXT:
					default: {
						const textNode = node.parentNode!.createEl('span');
						textNode.innerText = node.getText();
						textNode.className = className;
						node.parentNode!.replaceChild(textNode, node);
					}
						break;
				}
			});
	}

	private makeCheckboxesReadOnly(node: HTMLElement) {
		node.querySelectorAll('input[type="checkbox"]')
			.forEach(node => node.setAttribute('disabled', 'disabled'));
	}

	/** Remove the collapse indicators from HTML, not needed (and not working) in copy */
	private removeCollapseIndicators(node: HTMLElement) {
		node.querySelectorAll('.collapse-indicator')
			.forEach(node => node.remove());
	}

	/** Remove button elements (which appear after code blocks) */
	private removeButtons(node: HTMLElement) {
		node.querySelectorAll('button')
			.forEach(node => node.remove());
	}

	/** Remove counters added by Strange New Worlds plugin (https://github.com/TfTHacker/obsidian42-strange-new-worlds) */
	private removeStrangeNewWorldsLinks(node: HTMLElement) {
		node.querySelectorAll('.snw-reference')
			.forEach(node => node.remove());
	}

	/** Transform code blocks to tables */
	private transformCodeToTables(node: HTMLElement) {
		node.querySelectorAll('pre')
			.forEach(node => {
				const codeEl = node.querySelector('code');
				if (codeEl) {
					const code = codeEl.innerHTML.replace(/\n*$/, '');
					const table = node.parentElement!.createEl('table');
					table.className = 'source-table';
					table.innerHTML = `<tr><td><pre>${code}</pre></td></tr>`;
					node.parentElement!.replaceChild(table, node);
				}
			});
	}

	/** Transform callouts to tables */
	private transformCalloutsToTables(node: HTMLElement) {
		node.querySelectorAll('.callout')
			.forEach(node => {
				const callout = node.parentElement!.createEl('table');
				callout.addClass('callout-table', 'callout');
				callout.setAttribute('data-callout', node.getAttribute('data-callout') ?? 'quote');
				const headRow = callout.createEl('tr');
				const headColumn = headRow.createEl('td');
				headColumn.addClass('callout-title');
				// const img = node.querySelector('svg');
				const title = node.querySelector('.callout-title-inner');

				// if (img) {
				// 	headColumn.appendChild(img);
				// }

				if (title) {
					const span = headColumn.createEl('span');
					span.innerHTML = title.innerHTML;
				}

				const originalContent = node.querySelector('.callout-content');
				if (originalContent) {
					const row = callout.createEl('tr');
					const column = row.createEl('td');
					column.innerHTML = originalContent.innerHTML;
				}

				node.replaceWith(callout);
			});
	}

	/** Remove references to footnotes and the footnotes section */
	private removeAllFootnotes(node: HTMLElement) {
		node.querySelectorAll('section.footnotes')
			.forEach(section => section.parentNode!.removeChild(section));

		node.querySelectorAll('.footnote-link')
			.forEach(link => {
				link.parentNode!.parentNode!.removeChild(link.parentNode!);
			});
	}

	/** Keep footnotes and references, but remove links */
	private removeFootnoteLinks(node: HTMLElement) {
		node.querySelectorAll('.footnote-link')
			.forEach(link => {
				const text = link.getText();
				if (text === '↩︎') {
					// remove back-link
					link.parentNode!.removeChild(link);
				} else {
					// remove from reference
					const span = link.parentNode!.createEl('span', {text: link.getText(), cls: 'footnote-link'})
					link.parentNode!.replaceChild(span, link);
				}
			});
	}

	/** Replace all images sources with a data-uri */
	private async embedImages(node: HTMLElement): Promise<HTMLElement> {
		const promises: Promise<void>[] = [];

		// Replace all image sources
		node.querySelectorAll('img')
			.forEach(img => {
				if (img.src) {
					if (img.src.startsWith('data:image/svg+xml') && this.options.convertSvgToBitmap) {
						// image is an SVG, encoded as a data uri. This is the case with Excalidraw for instance.
						// Convert it to bitmap
						promises.push(this.replaceImageSource(img));
						return;
					}

					if (!this.options.embedExternalLinks) {
						const [scheme] = img.src.split(':', 1);
						if (this.externalSchemes.includes(scheme.toLowerCase())) {
							// don't touch external images
							return;
						} else {
							// not an external image, continue processing below
						}
					}

					if (!img.src.startsWith('data:')) {
						// render bitmaps, except if already as data-uri
						promises.push(this.replaceImageSource(img));
						return;
					}
				}
			});

		// @ts-ignore
		this.modal.progress.max = 100;

		// @ts-ignore
		await allWithProgress(promises, percentCompleted => this.modal.progress.value = percentCompleted);
		return node;
	}

	private async renderSvg(node: HTMLElement): Promise<Element> {
		const xmlSerializer = new XMLSerializer();

		if (!this.options.convertSvgToBitmap) {
			return node;
		}

		const promises: Promise<void>[] = [];

		const replaceSvg = async (svg: SVGSVGElement) => {
			const style: HTMLStyleElement = svg.querySelector('style') || svg.appendChild(document.createElement('style'));
			style.innerHTML += MERMAID_STYLESHEET;

			const svgAsString = xmlSerializer.serializeToString(svg);

			const svgData = `data:image/svg+xml;base64,` + Buffer.from(svgAsString).toString('base64');
			const dataUri = await this.imageToDataUri(svgData);

			const img = svg.createEl('img');
			img.style.cssText = svg.style.cssText;
			img.src = dataUri;

			svg.parentElement!.replaceChild(img, svg);
		};

		node.querySelectorAll('svg')
			.forEach(svg => {
				promises.push(replaceSvg(svg));
			});

		// @ts-ignore
		this.modal.progress.max = 0;

		// @ts-ignore
		await allWithProgress(promises, percentCompleted => this.modal.progress.value = percentCompleted);
		return node;
	}

	/** replace image src attribute with data uri */
	private async replaceImageSource(image: HTMLImageElement): Promise<void> {
		const imageSourcePath = decodeURI(image.src);

		if (imageSourcePath.startsWith(this.vaultLocalUriPrefix)) {
			// Transform uri to Obsidian relative path
			let path = imageSourcePath.substring(this.vaultLocalUriPrefix.length + 1)
				.replace(/[?#].*/, '');
			path = decodeURI(path);

			const mimeType = this.guessMimeType(path);
			const data = await this.readFromVault(path, mimeType);

			if (this.isSvg(mimeType) && this.options.convertSvgToBitmap) {
				// render svg to bitmap for compatibility w/ for instance gmail
				image.src = await this.imageToDataUri(data);
			} else {
				// file content as base64 data uri (including svg)
				image.src = data;
			}
		} else {
			// Attempt to render uri to canvas. This is not an uri that points to the vault. Not needed for public
			// urls, but we may have un uri that points to our local machine or network, that will not be accessible
			// wherever we intend to paste the document.
			image.src = await this.imageToDataUri(image.src);
		}
	}


	/**
	 * Draw image url to canvas and return as data uri containing image pixel data
	 */
	private async imageToBlob(url: string): Promise<string> {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		const image = new Image();
		image.setAttribute('crossOrigin', 'anonymous');

		const dataUriPromise = new Promise<string>((resolve, reject) => {
			image.onload = () => {
				// 设置目标最小尺寸为1080
		        const imageMinSize = this.options.imageMinSize;
		        let newWidth = imageMinSize;
		        let newHeight = imageMinSize;
		        
		        if ( image.naturalWidth < imageMinSize || image.naturalHeight < imageMinSize) {
					// 计算保持比例的缩放比例
					if ( image.naturalWidth < image.naturalHeight ){
					    newWidth = imageMinSize;
					    const scale = imageMinSize / image.naturalWidth;
					    newHeight = image.naturalHeight * scale;
					}else{
					    newHeight = imageMinSize;
					    const scale = imageMinSize / image.naturalHeight;
					    newWidth = image.naturalWidth * scale;
					}
		        }
		        // 设置canvas的尺寸
		        canvas.width = newWidth;
		        canvas.height = newHeight;

				ctx!.drawImage(image, 0, 0, canvas.width, canvas.height);

				try {
					canvas.toBlob(
						(blob) => {
							if (blob) {
								const objectUrl = URL.createObjectURL(blob);
								resolve(objectUrl);
							} else {
								resolve(url);
							}
						},
						'image/png'
					);
				} catch (err) {
					// leave error at `log` level (not `error`), since we leave an url that may be workable
					console.log(`failed ${url}`, err);
					// if we fail, leave the original url.
					// This way images that we may not load from external sources (tainted) may still be accessed
					// (eg. plantuml)
					// TODO: should we attempt to fallback with fetch ?
					resolve(url);
				}

				canvas.remove();
			}

			image.onerror = (err) => {
				console.log('could not load data uri');
				// if we fail, leave the original url
				resolve(url);
			}
		})

		image.src = url;

		return dataUriPromise;
	}




	/**
	 * Draw image url to canvas and return as data uri containing image pixel data
	 */
	private async imageToDataUri(url: string): Promise<string> {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		const image = new Image();
		image.setAttribute('crossOrigin', 'anonymous');

		const dataUriPromise = new Promise<string>((resolve, reject) => {
			image.onload = () => {
				// 设置目标最小尺寸为1080
		        const imageMinSize = this.options.imageMinSize;
		        let newWidth = imageMinSize;
		        let newHeight = imageMinSize;
		        
		        if ( image.naturalWidth < imageMinSize || image.naturalHeight < imageMinSize) {
					// 计算保持比例的缩放比例
					if ( image.naturalWidth < image.naturalHeight ){
					    newWidth = imageMinSize;
					    const scale = imageMinSize / image.naturalWidth;
					    newHeight = image.naturalHeight * scale;
					}else{
					    newHeight = imageMinSize;
					    const scale = imageMinSize / image.naturalHeight;
					    newWidth = image.naturalWidth * scale;
					}
		        }
		        // 设置canvas的尺寸
		        canvas.width = newWidth;
		        canvas.height = newHeight;

				ctx!.drawImage(image, 0, 0, canvas.width, canvas.height);

				try {
					const uri = canvas.toDataURL('image/png');
					resolve(uri);
				} catch (err) {
					// leave error at `log` level (not `error`), since we leave an url that may be workable
					console.log(`failed ${url}`, err);
					// if we fail, leave the original url.
					// This way images that we may not load from external sources (tainted) may still be accessed
					// (eg. plantuml)
					// TODO: should we attempt to fallback with fetch ?
					resolve(url);
				}

				canvas.remove();
			}

			image.onerror = (err) => {
				console.log('could not load data uri');
				// if we fail, leave the original url
				resolve(url);
			}
		})

		image.src = url;

		return dataUriPromise;
	}

	/**
	 * Get binary data as b64 from a file in the vault
	 */
	private async readFromVault(path: string, mimeType: string): Promise<string> {
		const tfile = this.app.vault.getAbstractFileByPath(path) as TFile;
		const data = await this.app.vault.readBinary(tfile);
		return `data:${mimeType};base64,` + arrayBufferToBase64(data);
	}

	/** Guess an image's mime-type based on its extension */
	private guessMimeType(filePath: string): string {
		const extension = this.getExtension(filePath) || 'png';
		return this.mimeMap.get(extension) || `image/${extension}`;
	}

	/** Get lower-case extension for a path */
	private getExtension(filePath: string): string {
		// avoid using the "path" library
		const fileName = filePath.slice(filePath.lastIndexOf('/') + 1);
		return fileName.slice(fileName.lastIndexOf('.') + 1 || fileName.length)
			.toLowerCase();
	}

	private isSvg(mimeType: string): boolean {
		return mimeType === 'image/svg+xml';
	}
}

/**
 * Modal to show progress during conversion
 */
class CopyingToHtmlModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	private _progress: HTMLElement;

	get progress() {
		return this._progress;
	}

	onOpen() {
		const {titleEl, contentEl} = this;
		titleEl.setText('Copying to clipboard');
		this._progress = contentEl.createEl('progress');
		this._progress.style.width = '100%';
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

/**
 * Settings dialog
 */
class CopyDocumentAsHTMLSettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: CopyDocumentAsHTMLPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// Thank you, Obsidian Tasks !
	private static createFragmentWithHTML = (html: string) =>
		createFragment((documentFragment) => (documentFragment.createDiv().innerHTML = html));

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Copy document as HTML Settings'});

		containerEl.createEl('h3', {text: 'Compatibility'});

		new Setting(containerEl)
			.setName('Convert SVG files to bitmap')
			.setDesc('If checked, SVG files are converted to bitmap. This makes the copied documents heavier but improves compatibility (eg. with gmail).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.convertSvgToBitmap)
				.onChange(async (value) => {
					this.plugin.settings.convertSvgToBitmap = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Embed external images')
			.setDesc('If checked, external images are downloaded and embedded. If unchecked, the resulting document may contain links to external resources')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.embedExternalLinks)
				.onChange(async (value) => {
					this.plugin.settings.embedExternalLinks = value;
					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName('Render code with tables')
			.setDesc("If checked code blocks are rendered as tables, which makes pasting into Google docs somewhat prettier.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.formatCodeWithTables)
				.onChange(async (value) => {
					this.plugin.settings.formatCodeWithTables = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Render callouts with tables')
			.setDesc("If checked callouts are rendered as tables, which makes pasting into Google docs somewhat prettier.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.formatCalloutsWithTables)
				.onChange(async (value) => {
					this.plugin.settings.formatCalloutsWithTables = value;
					await this.plugin.saveSettings();
				}));


		containerEl.createEl('h3', {text: 'Rendering'});

		new Setting(containerEl)  
			.setName('Image minimum size')  
			.setDesc('Image minimum size for image scaling (in pixels)')  
			.addText(text => text  
				.setPlaceholder('1080')  
				.setValue((this.plugin.settings.imageMinSize || 1080).toString())  
				.onChange(async (value) => {  
					const numValue = parseInt(value);  
					if (!isNaN(numValue) && numValue > 0) {  
						this.plugin.settings.imageMinSize = numValue;  
						await this.plugin.saveSettings();  
					}  
				}));

		new Setting(containerEl)
			.setName('Include filename as header')
			.setDesc("If checked, the filename is inserted as a level 1 header. (only if an entire document is copied)")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.fileNameAsHeader)
				.onChange(async (value) => {
					this.plugin.settings.fileNameAsHeader = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Copy HTML fragment only')
			.setDesc("If checked, only generate a HTML fragment and not a full HTML document. This excludes the header, and effectively disables all styling.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.bareHtmlOnly)
				.onChange(async (value) => {
					this.plugin.settings.bareHtmlOnly = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Remove properties / front-matter sections')
			.setDesc("If checked, the YAML content between --- lines at the front of the document are removed. If you don't know what this means, leave it on.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeFrontMatter)
				.onChange(async (value) => {
					this.plugin.settings.removeFrontMatter = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Remove dataview metadata lines')
			.setDesc(CopyDocumentAsHTMLSettingsTab.createFragmentWithHTML(`
				<p>Remove lines that only contain dataview meta-data, eg. "rating:: 9". Metadata between square brackets is left intact.</p>
				<p>Current limitations are that lines starting with a space are not removed, and lines that look like metadata in code blocks are removed if they don't start with a space</p>`))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeDataviewMetadataLines)
				.onChange(async (value) => {
					this.plugin.settings.removeDataviewMetadataLines = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Footnote handling')
			.setDesc(CopyDocumentAsHTMLSettingsTab.createFragmentWithHTML(`
				<ul>
				  <li>Remove everything: Remove references and links.</li>
				  <li>Display only: leave reference and foot-note, but don't display as a link.</li> 
				  <li>Display and link: attempt to link the reference to the footnote, may not work depending on paste target.</li>
				</ul>`)
			)
			.addDropdown(dropdown => dropdown
				.addOption(FootnoteHandling.REMOVE_ALL.toString(), 'Remove everything')
				.addOption(FootnoteHandling.REMOVE_LINK.toString(), 'Display only')
				.addOption(FootnoteHandling.LEAVE_LINK.toString(), 'Display and link')
				.setValue(this.plugin.settings.footnoteHandling.toString())
				.onChange(async (value) => {
					switch (value) {
						case FootnoteHandling.TITLE_ATTRIBUTE.toString():
							this.plugin.settings.footnoteHandling = FootnoteHandling.TITLE_ATTRIBUTE;
							break;
						case FootnoteHandling.REMOVE_ALL.toString():
							this.plugin.settings.footnoteHandling = FootnoteHandling.REMOVE_ALL;
							break;
						case FootnoteHandling.REMOVE_LINK.toString():
							this.plugin.settings.footnoteHandling = FootnoteHandling.REMOVE_LINK;
							break;
						case FootnoteHandling.LEAVE_LINK.toString():
						default:
							this.plugin.settings.footnoteHandling = FootnoteHandling.LEAVE_LINK;
							break;
					}
					await this.plugin.saveSettings();
				})
			)

		new Setting(containerEl)
			.setName('Link handling')
			.setDesc(CopyDocumentAsHTMLSettingsTab.createFragmentWithHTML(`
				This option controls how links to Obsidian documents and tags are handled.
				<ul>
				  <li>Don't link: only render the link title</li>
				  <li>Open with Obsidian: convert the link to an obsidian:// URI</li> 
				  <li>Link to HTML: keep the link, but convert the extension to .html</li>
				  <li>Leave as is: keep the generated link</li>	
				</ul>`)
			)
			.addDropdown(dropdown => dropdown
				.addOption(InternalLinkHandling.CONVERT_TO_TEXT.toString(), 'Don\'t link')
				.addOption(InternalLinkHandling.CONVERT_TO_OBSIDIAN_URI.toString(), 'Open with Obsidian')
				.addOption(InternalLinkHandling.LINK_TO_HTML.toString(), 'Link to HTML')
				.addOption(InternalLinkHandling.LEAVE_AS_IS.toString(), 'Leave as is')
				.setValue(this.plugin.settings.internalLinkHandling.toString())
				.onChange(async (value) => {
					switch (value) {
						case InternalLinkHandling.CONVERT_TO_OBSIDIAN_URI.toString():
							this.plugin.settings.internalLinkHandling = InternalLinkHandling.CONVERT_TO_OBSIDIAN_URI;
							break;
						case InternalLinkHandling.LINK_TO_HTML.toString():
							this.plugin.settings.internalLinkHandling = InternalLinkHandling.LINK_TO_HTML;
							break;
						case InternalLinkHandling.LEAVE_AS_IS.toString():
							this.plugin.settings.internalLinkHandling = InternalLinkHandling.LEAVE_AS_IS;
							break;
						case InternalLinkHandling.CONVERT_TO_TEXT.toString():
						default:
							this.plugin.settings.internalLinkHandling = InternalLinkHandling.CONVERT_TO_TEXT;
							break;
					}
					await this.plugin.saveSettings();
				})
			)

		containerEl.createEl('h3', {text: 'Custom templates (advanced)'});

		const useCustomStylesheetSetting = new Setting(containerEl)
			.setName('Provide a custom stylesheet')
			.setDesc('The default stylesheet provides minimalistic theming. You may want to customize it for better looks. Disabling this setting will restore the default stylesheet.');

		const customStylesheetSetting = new Setting(containerEl)
			.setClass('customizable-text-setting')
			.addTextArea(textArea => textArea
				.setValue(this.plugin.settings.styleSheet)
				.onChange(async (value) => {
					this.plugin.settings.styleSheet = value;
					await this.plugin.saveSettings();
				}));

		useCustomStylesheetSetting.addToggle(toggle => {
			customStylesheetSetting.settingEl.toggle(this.plugin.settings.useCustomStylesheet);

			toggle
				.setValue(this.plugin.settings.useCustomStylesheet)
				.onChange(async (value) => {
					this.plugin.settings.useCustomStylesheet = value;
					customStylesheetSetting.settingEl.toggle(this.plugin.settings.useCustomStylesheet);
					if (!value) {
						this.plugin.settings.styleSheet = DEFAULT_STYLESHEET;
					}
					await this.plugin.saveSettings();
				});
		});

		const useCustomHtmlTemplateSetting = new Setting(containerEl)
			.setName('Provide a custom HTML template')
			.setDesc(CopyDocumentAsHTMLSettingsTab.createFragmentWithHTML(`For even more customization, you can 
provide a custom HTML template. Disabling this setting will restore the default template.<br/><br/>
Note that the template is not used if the "Copy HTML fragment only" setting is enabled.`));

		const customHtmlTemplateSetting = new Setting(containerEl)
			.setDesc(CopyDocumentAsHTMLSettingsTab.createFragmentWithHTML(`
			The template should include the following placeholders :<br/>
<ul>
	<li><code>$\{title}</code>: the document title</li>
	<li><code>$\{stylesheet}</code>: the CSS stylesheet. The custom stylesheet will be applied if any is specified</li>
	<li><code>$\{MERMAID_STYLESHEET}</code>: the CSS for mermaid diagrams</li>
	<li><code>$\{body}</code>: the document body</li>
</ul>`))
			.setClass('customizable-text-setting')
			.addTextArea(textArea => textArea
				.setValue(this.plugin.settings.htmlTemplate)
				.onChange(async (value) => {
					this.plugin.settings.htmlTemplate = value;
					await this.plugin.saveSettings();
				}));

		useCustomHtmlTemplateSetting.addToggle(toggle => {
			customHtmlTemplateSetting.settingEl.toggle(this.plugin.settings.useCustomHtmlTemplate);

			toggle
				.setValue(this.plugin.settings.useCustomHtmlTemplate)
				.onChange(async (value) => {
					this.plugin.settings.useCustomHtmlTemplate = value;
					customHtmlTemplateSetting.settingEl.toggle(this.plugin.settings.useCustomHtmlTemplate);
					if (!value) {
						this.plugin.settings.htmlTemplate = DEFAULT_HTML_TEMPLATE;
					}
					await this.plugin.saveSettings();
				});
		});

		containerEl.createEl('h3', {text: 'ShowDoc Settings'});

		new Setting(containerEl)
			.setName('ShowDoc URL')
			.setDesc('The base URL of your ShowDoc instance.')
			.addText(text => text
				.setPlaceholder('https://your.showdoc.url')
				.setValue(this.plugin.settings.showdocUrl)
				.onChange(async (value) => {
					this.plugin.settings.showdocUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ShowDoc Username')
			.addText(text => text
				.setValue(this.plugin.settings.showdocUsername)
				.onChange(async (value) => {
					this.plugin.settings.showdocUsername = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ShowDoc Password')
			.addText(text => text
				.setValue(this.plugin.settings.showdocPassword)
				.onChange(async (value) => {
					this.plugin.settings.showdocPassword = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ShowDoc Project ID')
			.setDesc('The ID of the project in ShowDoc.')
			.addText(text => text
				.setValue(this.plugin.settings.showdocProjectId)
				.onChange(async (value) => {
					this.plugin.settings.showdocProjectId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ShowDoc Parent Directory')
			.setDesc('Optional. A parent directory to place all uploaded notes under.')
			.addText(text => text
				.setValue(this.plugin.settings.showdocParentCat)
				.onChange(async (value) => {
					this.plugin.settings.showdocParentCat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ShowDoc API Key')
			.addText(text => text
				.setValue(this.plugin.settings.showdocApiKey)
				.onChange(async (value) => {
					this.plugin.settings.showdocApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ShowDoc API Token')
			.addText(text => text
				.setValue(this.plugin.settings.showdocApiToken)
				.onChange(async (value) => {
					this.plugin.settings.showdocApiToken = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', {text: 'Exotic / Developer options'});

		new Setting(containerEl)
			.setName("Don't embed images")
			.setDesc("When this option is enabled, images will not be embedded in the HTML document, but <em>broken</em> links will be left in place. This is not recommended.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.disableImageEmbedding)
				.onChange(async (value) => {
					this.plugin.settings.disableImageEmbedding = value;
					await this.plugin.saveSettings();
				}));
	}
}

/**
 * Client for ShowDoc API
 */
class ShowDocClient {
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
		try {
			// 使用提供的token或自动获取
			const userToken = token || this.userToken || await this.login();
			console.log('Uploading image with userToken:', userToken);

			// 构建基础URL，确保URL格式正确
			let showdocUrl = this.settings.showdocUrl;
			// 确保URL不以/结尾
			if (showdocUrl.endsWith('/')) {
				showdocUrl = showdocUrl.slice(0, -1);
			}
			const baseUploadUrl = `${showdocUrl}/server/index.php`;
			console.log('Base upload URL:', baseUploadUrl);

			// 读取文件内容
			const fileContent = await this.app.vault.readBinary(file);
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
			formDataArray.set(new Uint8Array(fileContent), fileFormArray.length);
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

			// 处理响应状态 - 增强状态码处理
			if (response.status < 200 || response.status >= 300) {
				console.error('Upload failed with status:', response.status);
				throw new Error(`Failed to upload image. Status: ${response.status}, Response: ${response.text || 'No response text'}`);
			}

			console.log('Upload response received, status:', response.status);
			console.log('Response text preview:', response.text?.substring(0, 100) + '...');

			// 处理上传结果，添加错误处理以防止JSON解析错误
			let data;
			try {
				data = response.json;
				// 检查data是否为有效的对象
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
				// 如果错误与token相关，清除缓存的token
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
			console.log('Image uploaded successfully, URL:', data.url);
			return data.url;
		} catch (error) {
			console.error('Image upload error:', error);
			new Notice(`Failed to upload image: ${error.message}`);
			throw error;
		}
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


type CopyDocumentAsHTMLSettings = {
	/** Remove front-matter */
	removeFrontMatter: boolean;

	/** If set svg are converted to bitmap */
	convertSvgToBitmap: boolean;

	/** Render code elements as tables */
	formatCodeWithTables: boolean;

	/** Render callouts as tables */
	formatCalloutsWithTables: boolean;

	/** Embed external links (load them and embed their content) */
	embedExternalLinks: boolean;

	/** Remove dataview meta-data lines (format : `some-tag:: value` */
	removeDataviewMetadataLines: boolean;

	/** How are foot-notes displayed ? */
	footnoteHandling: FootnoteHandling;

	/** How are internal links handled ? */
	internalLinkHandling: InternalLinkHandling;

	/** remember if the stylesheet was default or custom */
	useCustomStylesheet: boolean;

	/**
	 * remember if the HTML wrapper was default or custom
	 */
	useCustomHtmlTemplate: boolean;

	/** Style-sheet */
	styleSheet: string;

	/**
	 * HTML wrapper
	 */
	htmlTemplate: string;

	/** Only generate the HTML body, don't include the <head> section */
	bareHtmlOnly: boolean;

	/** Include filename in copy. Only when entire document is copied */
	fileNameAsHeader: boolean;

	/**
	 * Don't replace image links with data: uris. No idea why you would want this, but here you go.
	 */
	disableImageEmbedding: boolean;

	/** min size for image scaling */  
	imageMinSize: number;

	showdocUrl: string;
	showdocUsername: string;
	showdocPassword: string;
	showdocProjectId: string;
	showdocParentCat: string;

	showdocApiKey: string;
	showdocApiToken: string;
}

const DEFAULT_SETTINGS: CopyDocumentAsHTMLSettings = {
	removeFrontMatter: true,
	convertSvgToBitmap: true,
	useCustomStylesheet: false,
	useCustomHtmlTemplate: false,
	embedExternalLinks: false,
	removeDataviewMetadataLines: false,
	formatCodeWithTables: false,
	formatCalloutsWithTables: false,
	footnoteHandling: FootnoteHandling.REMOVE_LINK,
	internalLinkHandling: InternalLinkHandling.CONVERT_TO_TEXT,
	styleSheet: DEFAULT_STYLESHEET,
	htmlTemplate: DEFAULT_HTML_TEMPLATE,
	bareHtmlOnly: false,
	fileNameAsHeader: false,
	disableImageEmbedding: false,
	imageMinSize: 1080,
	showdocUrl: '',
	showdocUsername: '',
	showdocPassword: '',
	showdocProjectId: '',
	showdocParentCat: '',

	showdocApiKey: '',
	showdocApiToken: '',
}

export default class CopyDocumentAsHTMLPlugin extends Plugin {
	settings: CopyDocumentAsHTMLSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'smart-copy-as-html',
			name: 'Copy selection or document to clipboard',
			checkCallback: this.buildCheckCallback(
				view => this.copyFromView(view, view.editor.somethingSelected()))
		})

		this.addCommand({
			id: 'copy-as-html',
			name: 'Copy entire document to clipboard',
			checkCallback: this.buildCheckCallback(view => this.copyFromView(view, false))
		});

		this.addCommand({
			id: 'copy-selection-as-html',
			name: 'Copy current selection to clipboard',
			checkCallback: this.buildCheckCallback(view => this.copyFromView(view, true))
		});

		this.addCommand({
			id: 'upload-to-showdoc',
			name: 'Upload document to ShowDoc',
			checkCallback: this.buildCheckCallback(view => this.uploadToShowDoc(view))
		});

		// Register post-processors that keep track of the blocks being rendered. For explanation,
		// @see DocumentRenderer#untilRendered()

		const beforeAllPostProcessor = this.registerMarkdownPostProcessor(async () => {
			ppIsProcessing = true;
		});
		beforeAllPostProcessor.sortOrder = -10000;

		const afterAllPostProcessor = this.registerMarkdownPostProcessor(async () => {
			ppLastBlockDate = Date.now();
			ppIsProcessing = false;
		});
		afterAllPostProcessor.sortOrder = 10000;

		// Register UI elements
		this.addSettingTab(new CopyDocumentAsHTMLSettingsTab(this.app, this));
		this.setupEditorMenuEntry();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// reload it so we may update it in a new release
		if (!this.settings.useCustomStylesheet) {
			this.settings.styleSheet = DEFAULT_STYLESHEET;
		}

		if (!this.settings.useCustomHtmlTemplate) {
			this.settings.htmlTemplate = DEFAULT_HTML_TEMPLATE;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private buildCheckCallback(action: (activeView: MarkdownView) => void) {
		return (checking: boolean): boolean => {
			if (copyIsRunning) {
				console.log('Document is already being copied');
				return false;
			}

			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) {
				console.log('Nothing to copy: No active markdown view');
				return false;
			}

			if (!checking) {
				action(activeView);
			}

			return true;
		}
	}

	private async copyFromView(activeView: MarkdownView, onlySelected: boolean) {
		if (!activeView.editor) {
			console.error('No editor in active view, nothing to copy');
			return;
		}

		if (!activeView.file) {
			// should not happen if we have an editor in the active view ?
			console.error('No file in active view, nothing to copy');
			return;
		}

		const markdown = onlySelected ? activeView.editor.getSelection() : activeView.data;

		const path = activeView.file.path;
		const name = activeView.file.name;
		return this.doCopy(markdown, path, name, !onlySelected);
	}

	private async copyFromFile(file: TAbstractFile) {
		if (!(file instanceof TFile)) {
			console.log(`cannot copy folder to HTML: ${file.path}`);
			return;
		}

		if (file.extension.toLowerCase() !== 'md') {
			console.log(`cannot only copy .md files to HTML: ${file.path}`);
			return;
		}

		const markdown = await file.vault.cachedRead(file);
		return this.doCopy(markdown, file.path, file.name, true);
	}

	private async doCopy(markdown: string, path: string, name: string, isFullDocument: boolean) {
		console.log(`Copying "${path}" to clipboard...`);
		const title = name.replace(/\.md$/i, '');

		const copier = new DocumentRenderer(this.app, this.settings);

		try {
			copyIsRunning = true;

			ppLastBlockDate = Date.now();
			ppIsProcessing = true;

			const htmlBody = await copier.renderDocument(markdown, path);

			if (this.settings.fileNameAsHeader && isFullDocument) {
				const h1 = htmlBody.createEl('h1');
				h1.innerHTML = title;
				htmlBody.insertBefore(h1, htmlBody.firstChild);
			}

			const htmlDocument = this.settings.bareHtmlOnly
				? htmlBody.outerHTML
				: this.expandHtmlTemplate(htmlBody.outerHTML, title);

			const data =
				new ClipboardItem({
					"text/html": new Blob([htmlDocument], {
						// @ts-ignore
						type: ["text/html", 'text/plain']
					}),
					"text/plain": new Blob([htmlDocument], {
						type: "text/plain"
					}),
				});

			await navigator.clipboard.write([data]);
			console.log(`Copied to clipboard as HTML`);
			new Notice(`Copied to clipboard as HTML`)
		} catch (error) {
			new Notice(`copy failed: ${error}`);
			console.error('copy failed', error);
		} finally {
			copyIsRunning = false;
		}
	}

	private async uploadToShowDoc(activeView: MarkdownView) {
		if (!activeView.file) {
			new Notice('No file in active view, nothing to upload');
			return;
		}

		// 验证必要的ShowDoc设置
		if (!this.settings.showdocUrl || !this.settings.showdocUsername || !this.settings.showdocPassword) {
			new Notice('ShowDoc login credentials are not configured');
			return;
		}

		if (!this.settings.showdocApiKey || !this.settings.showdocApiToken) {
			new Notice('ShowDoc API key and token are not configured');
			return;
		}

		console.log(`Uploading "${activeView.file.path}" to ShowDoc...`);
		new Notice('Uploading to ShowDoc...');

		const client = new ShowDocClient(this.app, this.settings);

		try {
			copyIsRunning = true;

			// 先登录一次，获取并缓存token
			const userToken = await client.login();
			
			let markdown = await this.app.vault.cachedRead(activeView.file);
			const title = activeView.file.basename;

			// 修改图片正则表达式以支持带有额外参数的图片链接格式
			// 匹配 ![[file]] 或 ![[file|width]] 或 ![[file#anchor]] 或 ![[file#anchor|width]] 等格式
			const imageRegex = /!\[\[([^||\]]+)(?:\|([^\]]+))?\]\]/gu; // Added 'g' and 'u' flags	
			const imagePromises = [];
			const imageMatches = [...markdown.matchAll(imageRegex)];


			// 渲染Markdown以获取图片元素
			const documentRenderer = new DocumentRenderer(this.app, this.settings);
			const topNode = await documentRenderer.renderDocument(markdown, activeView.file.path);
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
					const imageFile = this.app.metadataCache.getFirstLinkpathDest(fullPathWithoutAnchor, activeView.file.path);
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
						if (fullPathWithAnchor.includes('.svg') || 
						   (fullPathWithAnchor.includes('excalidraw.md'))) {
								console.log(`Special handling for ${imageFile.extension} file: ${fullPathWithAnchor}`);
							
							// 创建一个新的公共方法来处理图片转换，避免访问私有方法
							try {
								// 使用canvas将img元素转换为data URL
								const canvas = document.createElement('canvas');
								const ctx = canvas.getContext('2d');
								if (!ctx) {
									throw new Error('Could not create canvas context');
								}
								
								// 创建一个新的Image对象
								const tempImage = new Image();
								const imageMinSize = this.settings.imageMinSize || 1080;
								
								// 使用Promise来处理图片加载
								const dataUri = await new Promise<string>((resolve, reject) => {
									tempImage.onload = () => {
										// 计算尺寸
										let newWidth = imageMinSize;
										let newHeight = imageMinSize;
										
										if (tempImage.naturalWidth < imageMinSize || tempImage.naturalHeight < imageMinSize) {
											if (tempImage.naturalWidth < tempImage.naturalHeight) {
												newWidth = imageMinSize;
												const scale = imageMinSize / tempImage.naturalWidth;
												newHeight = tempImage.naturalHeight * scale;
											} else {
												newHeight = imageMinSize;
												const scale = imageMinSize / tempImage.naturalHeight;
												newWidth = tempImage.naturalWidth * scale;
											}
										}
										
										// 设置canvas尺寸
										canvas.width = newWidth;
										canvas.height = newHeight;
										
										// 绘制图片
										ctx.drawImage(tempImage, 0, 0, canvas.width, canvas.height);
										
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
									
									if (imgElement) {
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
								imagePromises.push(client.uploadImageWithData(processedImageFile, byteArray, userToken).then(url => {
									console.log(`Successfully uploaded converted image: ${url}`);
									return { fullLink, url };
								}).catch(error => {
									console.error(`Failed to upload converted image ${fullPathWithAnchor}: ${error.message}`);
									// 失败时尝试直接上传原始文件
									return client.uploadImage(imageFile, userToken).then(url => ({ fullLink, url })).catch(fallbackError => {
										console.error(`Fallback upload failed for ${fullPathWithAnchor}: ${fallbackError.message}`);
										return { fullLink, url: null };
									});
								}));
							} catch (conversionError) {
								console.error(`Conversion error for ${fullPathWithAnchor}: ${conversionError.message}`);
								// 转换失败时尝试直接上传原始文件
								imagePromises.push(client.uploadImage(imageFile, userToken).then(url => ({ fullLink, url })).catch(fallbackError => {
									console.error(`Fallback upload failed for ${fullPathWithAnchor}: ${fallbackError.message}`);
									return { fullLink, url: null };
								}));
							}
						} else {
							// 普通图片文件直接上传
							console.log(`Uploading regular image: ${fullPathWithAnchor}`);
							imagePromises.push(client.uploadImage(imageFile, userToken).then(url => ({ fullLink, url })).catch(error => {
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
			let catName = activeView.file.parent?.path.replace(/\\/g, '/') || '';
			if (this.settings.showdocParentCat) {
				catName = `${this.settings.showdocParentCat}/${catName}`.replace(/^\/|\/$/, '');
			}

			// 更新文章，传递同一个token
			await client.updateArticle(title, markdown, catName, userToken);

		} catch (error) {
			new Notice(`Upload to ShowDoc failed: ${error.message}`);
			console.error('Upload to ShowDoc failed', error);
		} finally {
			copyIsRunning = false;
		}
	}

	private expandHtmlTemplate(html: string, title: string) {
		const template = this.settings.useCustomHtmlTemplate
			? this.settings.htmlTemplate
			: DEFAULT_HTML_TEMPLATE;

		return template
			.replace('${title}', title)
			.replace('${body}', html)
			.replace('${stylesheet}', this.settings.styleSheet)
			.replace('${MERMAID_STYLESHEET}', MERMAID_STYLESHEET);
	}

	private setupEditorMenuEntry() {
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file, view) => {
				menu.addItem((item) => {
					item
						.setTitle("Copy as HTML")
						.setIcon("clipboard-copy")
						.onClick(async () => {
							return this.copyFromFile(file);
						});
				});
			})
		);
	}
}
