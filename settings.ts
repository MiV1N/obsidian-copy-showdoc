import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_HTML_TEMPLATE, DEFAULT_STYLESHEET } from './constants';
import CopyDocumentAsHTMLPlugin from './main';

export enum FootnoteHandling {
	/** Remove references and links */
	REMOVE_ALL,

	/** Reference links to footnote using a unique id */
	LEAVE_LINK,

	/** Links are removed from reference and back-link from footnote */
	REMOVE_LINK,

	/** Footnote is moved to title attribute */
	TITLE_ATTRIBUTE
}

export enum InternalLinkHandling {
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

export type CopyDocumentAsHTMLSettings = {
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

export const DEFAULT_SETTINGS: CopyDocumentAsHTMLSettings = {
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


/**
 * Settings dialog
 */
export class CopyDocumentAsHTMLSettingsTab extends PluginSettingTab {
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
