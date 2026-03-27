import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	TAbstractFile,
	TFile
} from 'obsidian';
import { DEFAULT_HTML_TEMPLATE, DEFAULT_STYLESHEET, MERMAID_STYLESHEET } from './constants';
import { CopyDocumentAsHTMLSettings, CopyDocumentAsHTMLSettingsTab, DEFAULT_SETTINGS } from './settings';
import { DocumentRenderer } from './documentRenderer';
import { setPpIsProcessing, setPpLastBlockDate } from './renderingState';
import { ShowDocUploader } from './showdocUploader';

/** Don't allow multiple copy processes to run at the same time */
let copyIsRunning = false;

export default class CopyDocumentAsHTMLPlugin extends Plugin {
	settings: CopyDocumentAsHTMLSettings;

	async onload() {
		await this.loadSettings();

		this.registerCommands();
		this.registerPostProcessors();

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

	private registerCommands() {
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
	}

	private registerPostProcessors() {
		// Register post-processors that keep track of the blocks being rendered.
		const beforeAllPostProcessor = this.registerMarkdownPostProcessor(async () => {
			setPpIsProcessing(true);
		});
		beforeAllPostProcessor.sortOrder = -10000;

		const afterAllPostProcessor = this.registerMarkdownPostProcessor(async () => {
			setPpLastBlockDate(Date.now());
			setPpIsProcessing(false);
		});
		afterAllPostProcessor.sortOrder = 10000;
	}

	private buildCheckCallback(action: (activeView: MarkdownView) => void) {
		return (checking: boolean): boolean => {
			if (copyIsRunning) {
				console.log('Document is already being copied');
				return false;
			}

			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) {
				// console.log('Nothing to copy: No active markdown view');
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
			// Basic re-entrancy protection
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

		this.executeUpload(activeView.file);
	}

	private async executeUpload(file: TFile) {
		// Validations
		const s = this.settings;
		if (!s.showdocUrl) {
			new Notice('ShowDoc URL is not configured');
			return;
		}
		if (!s.showdocApiKey || !s.showdocApiToken) {
			new Notice('ShowDoc API key and token are not configured');
			return;
		}

		const uploader = new ShowDocUploader(this.app, this.settings);
		const title = file.basename;

		try {
			// Read the file directly from vault
			const markdown = await this.app.vault.cachedRead(file);
			await uploader.upload(markdown, title, file);
		} catch (e) {
			console.error(`Upload error for ${file.path}:`, e);
			new Notice(`Failed to read file: ${e.message}`);
		}
	}

	private expandHtmlTemplate(html: string, title: string) {
		const template = this.settings.useCustomHtmlTemplate
			? this.settings.htmlTemplate
			: DEFAULT_HTML_TEMPLATE;

		return template
			.replace('${title}', title) // Intentional single quote for template literal placeholder if needed, though here it's string replace
			.replace('${body}', html)
			.replace('${stylesheet}', this.settings.styleSheet)
			.replace('${MERMAID_STYLESHEET}', MERMAID_STYLESHEET);
	}

	private setupEditorMenuEntry() {
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				// Only show for markdown files
				if (!(file instanceof TFile) || file.extension !== 'md') {
					return;
				}

				menu.addItem((item) => {
					item
						.setTitle("Upload to ShowDoc")
						.setIcon("upload")
						.onClick(async () => {
							try {
								// Directly upload without opening view
								await this.executeUpload(file);
							} catch (error) {
								console.error("Error in upload to showdoc:", error);
								new Notice("Failed to initiate upload: " + (error instanceof Error ? error.message : String(error)));
							}
						});
				});
			})
		);
	}
}
