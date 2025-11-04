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

import { DEFAULT_HTML_TEMPLATE, DEFAULT_STYLESHEET ,MERMAID_STYLESHEET} from './constants';
import { CopyDocumentAsHTMLSettings, CopyDocumentAsHTMLSettingsTab, DEFAULT_SETTINGS,FootnoteHandling,InternalLinkHandling } from './settings';
import { DocumentRenderer } from './documentRenderer';
import { setPpIsProcessing, setPpLastBlockDate } from './renderingState';
import { ShowDocUploader } from './showdocUploader';
/*
 * Generic lib functions
 */



/*
 * Plugin code
 */

/** Don't allow multiple copy processes to run at the same time */
let copyIsRunning = false;








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
			setPpIsProcessing(true);
		});
		beforeAllPostProcessor.sortOrder = -10000;

		const afterAllPostProcessor = this.registerMarkdownPostProcessor(async () => {
			setPpLastBlockDate(Date.now());
			setPpIsProcessing(false);
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

			setPpLastBlockDate(Date.now());
			setPpIsProcessing(true);

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

		const uploader = new ShowDocUploader(this.app, this.settings);
		const title = activeView.file.basename;
        // const markdown = activeView.data;
		let markdown = await this.app.vault.cachedRead(activeView.file);
        
        await uploader.upload(markdown, title, activeView.file);

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
						.setTitle("upload to showdoc")
						.setIcon("upload")
						.onClick(async () => {
							try {
								// 尝试为文件创建一个临时的Markdown视图
								await this.app.workspace.getLeaf(false).setViewState({
									type: "markdown",
									state: { file: file.path }
								});
								
								// 再次获取活动视图
								const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
								if (activeView) {
									return this.uploadToShowDoc(activeView);
								} else {
									new Notice("Failed to create markdown view for upload");
								}
							} catch (error) {
								console.error("Error in upload to showdoc:", error);
								new Notice("Failed to upload to ShowDoc: " + (error instanceof Error ? error.message : String(error)));
							}
						});
				});
			})
		);
	}
}
