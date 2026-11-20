/** Shared UI: JSON schema editor, tables, theme editor, editor shells, icons and toast. */
export const ui = {
  /** JSON schema tree editor and the schema generation card. */
  schema: {
    /** Display name for the `ref` schema type; other type names are protocol constants. */
    refModel: 'Reference model',
    /** Label of the root node row. */
    rootNode: 'Root',
    /** First half of the empty-field hint; `addField` is the clickable "Add". */
    emptyHint: 'No fields, ',
    addField: 'Add',
    /** Unlink button shown on hover over a referenced model node. */
    unbind: 'Unlink',
    refNotFound: 'Model not found: {{ref}}',
    /** Description column text used when a `$ref` cannot be resolved in doc tables. */
    refMissing: 'Referenced model not found',
    /** Nullable type template, `{{label}}` is the type name. */
    nullable: '{{label}} (nullable)',

    /** Column headers. */
    columns: {
      name: 'Field name',
      type: 'Type',
      displayName: 'Display name',
      example: 'Example',
      required: 'Required',
      description: 'Description',
    },

    /** Cell placeholders. */
    placeholder: {
      name: 'Field name',
      displayName: 'Display name',
      example: 'Example',
      description: 'Description',
    },

    /** Required marker in read-only mode. */
    requiredLabel: 'Required',
    optionalLabel: 'Optional',

    addChildNode: 'Add child node',
    addSiblingNode: 'Add sibling node',
    /** Advanced settings entry in the type dropdown. */
    advancedSettings: 'Advanced settings',
    selectRefModel: 'Select a model to reference',

    /** Schema generation / view modals. */
    card: {
      generate: 'Generate',
      view: 'View',
      inputJson: 'Input JSON',
      inputJsonSchema: 'Input JSON Schema',
      generateSchema: 'Generate schema',
      generateExample: 'Generate example',
      generatedSchemaPreview: 'Generated schema preview',
      generatedJsonExample: 'Generated JSON example',
      apply: 'Apply',
      copyCode: 'Copy code',
      jsonExampleTab: 'JSON example',
      invalidJson: 'Invalid JSON format, please check!',
      invalidJsonSchema: 'Invalid JSON Schema format, please check!',
      schemaApplied: 'Schema applied',
    },
  },

  /** JSON preview. */
  jsonViewer: {
    invalidJson: 'The example is not valid JSON, showing the raw text',
  },

  /** Monaco code editor shell. */
  monaco: {
    loading: 'The first load may take a while, please wait...',
  },

  /** bytemd Markdown editor (third-party language pack, derived from the current language). */
  markdown: {
    bold: 'Bold',
    boldText: 'bold text',
    cheatsheet: 'Markdown cheatsheet',
    closeHelp: 'Close help',
    closeToc: 'Close table of contents',
    code: 'Code',
    codeBlock: 'Code block',
    codeLang: 'lang',
    codeText: 'code',
    exitFullscreen: 'Exit fullscreen',
    exitPreviewOnly: 'Exit preview only',
    exitWriteOnly: 'Exit write only',
    fullscreen: 'Fullscreen',
    h1: 'Heading 1',
    h2: 'Heading 2',
    h3: 'Heading 3',
    h4: 'Heading 4',
    h5: 'Heading 5',
    h6: 'Heading 6',
    headingText: 'heading',
    help: 'Help',
    hr: 'Horizontal rule',
    image: 'Image',
    imageAlt: 'alt text',
    imageTitle: 'image title',
    italic: 'Italic',
    italicText: 'italic text',
    limited: 'The maximum character limit has been reached',
    lines: 'Lines',
    link: 'Link',
    linkText: 'link text',
    ol: 'Ordered list',
    olItem: 'item',
    preview: 'Preview',
    previewOnly: 'Preview only',
    quote: 'Quote',
    quotedText: 'quoted text',
    shortcuts: 'Shortcuts',
    source: 'Source code',
    sync: 'Scroll sync',
    toc: 'Table of contents',
    top: 'Scroll to top',
    ul: 'Unordered list',
    ulItem: 'item',
    words: 'Words',
    write: 'Write',
    writeOnly: 'Write only',
  },

  /** Theme editor: color mode. */
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
  },

  /** Design style picker. Internal enum values are keys; names and descriptions are translated. */
  designStyle: {
    label: 'Design style',
    default: {
      name: 'Default',
      description: 'Classic Ant Design look: clean and efficient for everyday work',
    },
    glassmorphism: {
      name: 'Glassmorphism',
      description: 'Translucent blur and glow backgrounds, airy and great for demos',
    },
    skeuomorphism: {
      name: 'Skeuomorphism',
      description: 'Real material textures and dimensional lighting for a tactile feel',
    },
    neumorphism: {
      name: 'Neumorphism',
      description: 'Soft embossing and low-contrast shadows, gentle on the eyes',
    },
  },

  /** Interface density picker. */
  density: {
    label: 'Interface density',
    compact: {
      name: 'Compact',
      description: 'Shorter controls, smaller fonts and tighter spacing for more content per screen (default)',
    },
    standard: {
      name: 'Standard',
      description: 'Close to system defaults, balancing density and readability',
    },
    loose: {
      name: 'Loose',
      description: 'Taller controls and more whitespace, easier on the eyes for long sessions',
    },
  },
}
