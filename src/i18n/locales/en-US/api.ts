/**
 * API menu, API docs, parameter tables, request body and request runner copy.
 *
 * Grouping mirrors `zh-CN/api.ts` one-to-one.
 */
export const api = {
  /** Save result toasts (shared by docs, quick requests and the runner). */
  save: {
    success: 'Saved successfully',
    failed: 'Failed to save',
    failedWithPermission: 'Failed to save. Please check your permissions',
  },

  response: {
    addTitle: 'Add response',
    name: 'Name',
    statusCode: 'HTTP status code',
    contentType: 'Content type',
    defaultName: 'Success',
    add: 'Add',
    confirmDeletePrefix: 'Delete this response? The change takes effect after you click',
    confirmDeleteSuffix: 'in the top right corner',
    deleted: 'Response deleted. Click Save in the top right corner to apply',
  },

  field: {
    status: 'Status',
    tags: 'Tags',
    tagsPlaceholder: 'Search or press Enter to create a tag',
    description: 'Description',
  },

  /** Left sidebar API tree. */
  menu: {
    selectToDelete: 'Select the menu items to delete (APIs, folders, schemas, etc.)',
    confirmBatchDelete: 'Delete the {{count}} selected item(s)?',
    batchDeleteDesc: 'Folders are deleted together with their children and moved to the recycle bin (restorable within 30 days).',
    batchDeleteSuccess: 'Moved {{count}} item(s) to the recycle bin. Restorable within 30 days; see "Recycle bin" on the left',
    batchDeleteSuccessWithChildren: 'Moved {{count}} item(s) (including {{children}} child item(s)) to the recycle bin. Restorable within 30 days; see "Recycle bin" on the left',
    batchDeleteFailed: 'Batch delete failed',
    retryLater: 'Please try again later',
    movedToRecycleBin: 'Moved to the recycle bin. Restorable within 30 days; see "Recycle bin" on the left',
    batchSelect: 'Batch select',
    batchExit: 'Exit batch',
    deleteSelected: 'Delete selected ({{count}})',
    empty: 'No APIs, schemas or quick requests yet',
    importOpenApi: 'Import OpenAPI',
    searchNoMatch: 'No results matching “{{word}}”',
    clearSearch: 'Clear search',
    unsaved: 'Unsaved',
    crossGroupRejected: '“{{drag}}” cannot be moved into the group containing “{{drop}}”',
    newCatalog: 'New folder',
    newApiFolder: 'New API folder',
    importCurl: 'Import cURL',
    importFromCurl: 'Import from cURL',
    collapseAll: 'Collapse all',
    expandAll: 'Expand all',
    displayAsName: 'Show APIs by name',
    displayAsUrl: 'Show APIs by URL',
    rename: 'Rename',
    moveTo: 'Move to',
    runAll: 'Run all',
    addSubCatalog: 'Add subfolder',
    deleteFolderTitle: 'Delete folder “{{name}}”?',
    deleteFolderWithApisPrefix: 'The folder and all APIs and cases inside it ',
    deleteFolderWithSchemasPrefix: 'The folder and all schemas inside it ',
    moveToRecycleBinSuffix: 'will be moved to the recycle bin and permanently deleted after 30 days.',
    deleteFileTitle: 'Delete {{kind}}“{{name}}”?',
    deleteApiPrefix: 'This API and all cases under it ',
    deleteDocPrefix: 'The document ',
    deleteSchemaPrefix: 'This schema ',
    discardDraft: 'Delete draft',
    noRunnableApi: 'This folder has no runnable APIs',
    missingApiData: 'Missing API data',
    runFailed: 'Run failed',
    batchRunResult: 'Batch run results ({{count}})',
    batchRunSummary: 'Succeeded {{success}} / Failed {{failed}}',
    columnApi: 'API',
    columnStatus: 'Status',
    columnDuration: 'Duration',
    columnInfo: 'Info',
    errorTag: 'Error',
  },

  /** Content tabs. */
  tab: {
    newTab: 'New...',
    closeTab: 'Close tab',
    moveLeft: 'Move tab left',
    moveRight: 'Move tab right',
    closeAll: 'Close all tabs',
    closeOthers: 'Close other tabs',
    unsavedTitle: 'Unsaved changes',
    directClose: 'Close without saving',
    saveAndClose: 'Save and close',
    switchFirst: 'Switch to this tab before saving',
    unsavedContentIntro: 'Your changes are kept in a local draft automatically (reopen the tab to continue editing), ',
    unsavedNotSynced: 'but they have not been synced to the server document yet.',
    unsavedNotCreated: 'This content has not been created yet.',
    saveFirst: 'Save now?',
  },

  /** Overview page. */
  overview: {
    stats: 'Project statistics',
    apiCount: 'APIs',
    apiCaseCount: 'API cases',
    docCount: 'Documents',
    schemaCount: 'Schemas',
    testScenarioCount: 'Test scenarios',
    recent: 'Recently edited',
    recentEmpty: 'No APIs yet. Create one on the right to get started',
    quickCreate: 'Quick create',
  },

  /** Recycle bin page. */
  recycle: {
    selectedCount: '{{count}} selected',
    confirmRestore: 'Restore the {{count}} selected item(s)?',
    confirmDelete: 'Permanently delete the {{count}} selected item(s)?',
    batchRestore: 'Restore selected',
    batchDelete: 'Delete selected',
    deleteIrreversible: 'Permanently deleted items cannot be restored',
    fileName: 'Name',
    operator: 'Deleted by',
    remaining: 'Time left',
    confirmRestoreOne: 'Restore this item?',
    restore: 'Restore',
  },

  /** Markdown document page. */
  markdown: {
    defaultName: 'Untitled document',
    saved: 'Saved',
    exitEditing: 'Exit editing',
  },

  /** Schema page. */
  schema: {
    defaultName: 'Untitled schema',
    namePlaceholder: 'Schema name, preferably the code model name or a synonym',
    confirmDelete: 'Delete schema “{{name}}”?',
  },

  /** API folder page. */
  folder: {
    settings: 'Folder settings',
    allApis: 'All APIs',
    name: 'Folder name',
    nameRequired: 'Folder name is required',
    parent: 'Parent folder',
    apiName: 'API name',
    method: 'Method',
    path: 'API path',
    group: 'API group',
  },

  /** API doc view / edit. */
  doc: {
    tabDoc: 'Document',
    tabEdit: 'Edit document',
    exampleValue: 'Example',
    exampleValueLabel: 'Example: ',
    fieldName: 'Field',
    noFieldDef: 'No fields defined',
    copyId: 'Copy ID',
    clickCopyPath: 'Click to copy the API URL',
    pathCopied: 'API URL copied',
    dateFormat: 'MMM D, YYYY',
    apiDescription: 'Description',
    requestParams: 'Request parameters',
    pathParams: 'Path parameters',
    queryParams: 'Query parameters',
    headerParams: 'Header parameters',
    cookieParams: 'Cookie parameters',
    noQueryToCopy: 'No query parameters to copy',
    queryCopied: 'Query parameters copied',
    copyQuery: 'Copy query',
    requestBody: 'Request body',
    bodyExample: 'Body example',
    bodyParams: 'Body parameters',
    schemaStructure: 'Field structure',
    example: 'Example',
    bodyExampleCopied: 'Body example copied',
    responses: 'Responses',
    httpStatusLabel: 'HTTP status code: ',
    contentTypeLabel: 'Content type: ',
    responseDescLabel: 'Response description: ',
    responseExample: 'Response example',
    descPlaceholder: 'Markdown is supported',
    confirmDeleteApi: 'Delete this API?',
    pathPlaceholder: 'API path, starting with “/”',
    pathHashUnsupported: 'API paths cannot contain a\u00A0URL\u00A0hash (#)',
    queryInPathHintPrefix: 'Please fill in query parameters under',
    queryInPathHintSuffix: 'below',
    queryExtractedPrefix: 'Query parameters found in the path were extracted and added to',
    queryExtractedMiddle: '→',
    queryExtractedSuffix: 'below',
  },

  /** Editable parameter table. */
  paramTable: {
    requestValue: 'Value',
    name: 'Parameter',
    pathParamHint: 'Parameters in the form {param} are extracted from the API path automatically. Edit them in the path instead.',
    addRow: 'Add parameter',
    duplicateName: 'This column must be unique',
    noFile: 'None',
    confirmDelete: 'Delete this parameter?',
    deleteRow: 'Delete parameter',
  },

  /** Global / environment parameter reference bar. */
  params: {
    configured: 'Configured',
    notConfigured: 'Not configured',
    globalActive: 'These global parameters are applied automatically at runtime; API parameters with the same name take precedence.',
    inheritedHint: 'These parameters come from the global/environment config. API parameters with the same name take precedence.',
    overridden: 'Overridden',
    overriddenSuffix: ' (overridden)',
    globalEffective: 'Active globally',
    sourceEnv: 'Environment',
    sourceGlobal: 'Global',
    envQueryTitle: 'Current global/environment query parameters',
    envHeaderTitle: 'Current global/environment header parameters',
    envCookieTitle: 'Current global/environment cookie parameters',
    queryTitle: 'Query parameters',
    pathTitle: 'Path parameters',
  },

  /** Dynamic variable help. */
  variableHelp: {
    title: 'Variable usage',
    introPrefix: 'Type',
    introSuffix: 'in request parameters, headers or the body to trigger autocompletion. Built-in dynamic variables are regenerated on every request and need no definition.',
    columnName: 'Dynamic variable',
    columnExample: 'Example',
    morePrefix: 'In addition, ',
    /** Variable reference syntax example; the value itself reads `{{variableName}}`. */
    syntaxExample: '{{variableName}}',
    moreMiddle: 'references variables defined in the environment/globals/session (precedence: session > environment > global). Typing',
    moreSuffix: 'in an input also shows them in the completion list with their current value.',
  },

  /** Variable highlight input. */
  varHighlight: {
    effectiveValue: 'Effective value: {{value}}',
    undefinedVar: '{{name}} is undefined',
  },

  /** Request body panel and content slots. */
  body: {
    typeLabel: 'Body type',
    comments: 'Comments',
    fillButton: 'Fill example',
    fill: 'Fill',
    fillTitle: 'Fill the body with an example?',
    fillContent: 'This overwrites the content you have entered and cannot be undone.',
    noBody: 'No body',
    none: 'No request body',
    noBodyBody: 'This request has no body',
    paramsOfType: '{{type}} parameters',
    clear: 'Clear',
    binaryHint: 'Choose a local file. Its raw bytes are sent as the request body (Content-Type: application/octet-stream)',
    noFileSelected: 'No file selected',
    selectFile: 'Choose file',
    noFileWarning: 'No request body will be sent without a selected file',
    preservedHint: 'Kept the {{type}} content. Switch back to {{type}} to restore it',
    globalBodyActive: 'These global body parameters are applied automatically at runtime; API parameters with the same name take precedence.',
    globalBodyInactive: 'The current body type is {{type}}, so these global body parameters do not take effect.',
    globalBodyTitle: 'Current global body parameters',
    getHeadWarning: 'GET/HEAD requests cannot carry a request body, so the body was ignored (use POST instead, or move the parameters into Query)',
    binaryNoFileWarning: 'No file selected for the binary body, so no request body will be sent',
    slotParams: 'Form parameters',
    slotRaw: 'Content',
    slotNone: 'No request body',
    noBodySent: 'No request body',
    unknownType: 'Unknown body type “{{type}}”. The request will be sent without a body',
    otherSlots: 'Also has content: {{slots}}',
    slotBadge: '{{title}} ({{hint}})',
    slotJoin: ', ',
  },

  /** Request runner and result viewer. */
  run: {
    run: 'Run',
    requestFailed: 'Request failed',
    suggestions: 'Suggested checks',
    technicalDetail: 'Technical details',
    emptyHint: 'Fill in the request and click “Run” to see the response',
    notInProject: 'You are not on a project page, so the request cannot be run',
    runFailed: 'Request failed',
    genericSuggestion: 'Check that the operation is correct. If the problem persists, try signing in again',
    /**
     * Network error copy, one entry per backend `error_type`
     * (see `categorize_request_error()` in `src-tauri/src/commands/request_runner.rs`).
     */
    networkError: {
      dns_failure: {
        message: 'DNS lookup failed — the server address could not be found',
        suggestion: ['Check that the domain in the URL is correct', 'Check that your network connection works', 'Try using an IP address instead of a domain'],
      },
      connection_refused: {
        message: 'The connection was refused by the server',
        suggestion: ['Make sure the target server is running', 'Check that the port number is correct', 'Make sure a firewall is not blocking the connection'],
      },
      connection_reset: {
        message: 'The connection was reset',
        suggestion: ['Check that your network connection is stable', 'The target server may have closed the connection'],
      },
      network_unreachable: {
        message: 'Network unreachable',
        suggestion: ['Check that your network connection works', 'Make sure the target address is on your local network'],
      },
      connection_failed: {
        message: 'Unable to connect to the server',
        suggestion: ['Check that the network connection and URL are correct', 'Make sure the target server is online'],
      },
      timeout: {
        message: 'Request timed out',
        suggestion: ['The server responded too slowly — try again later', 'Check that your network connection is stable', 'Make sure the target server is not overloaded'],
      },
      tls_error: {
        message: 'TLS/SSL certificate verification failed',
        suggestion: ['Make sure the server SSL certificate is valid', 'Check that your system clock is accurate', 'A self-signed certificate needs to be explicitly trusted'],
      },
      http_error: {
        message: 'Unexpected HTTP response status',
        suggestion: ['Check that the request parameters are correct'],
      },
      redirect_error: {
        message: 'Failed to handle the redirect',
        suggestion: ['Check whether the request URL redirects to an invalid address'],
      },
      body_error: {
        message: 'Failed to send the request body',
        suggestion: ['Check whether the request body is too large or malformed'],
      },
      unknown: {
        message: 'Request error',
        suggestion: ['Check the network and request configuration', 'If the problem persists, expand Technical details'],
      },
    },
    tabResponseBody: 'Response body',
    noResponseBody: 'No response body',
    /** Header title with a count, e.g. "Response headers (3)". */
    headersCount: '{{label}} ({{count}})',
    tabResponseHeaders: 'Response headers',
    noResponseHeaders: 'No response headers',
    tabRequestBody: 'Request',
    noRequestBody: 'No request body',
    tabRequestHeaders: 'Request headers',
    noRequestHeaders: 'No request headers',
    headerNotSent: 'Common client default; reqwest does not actually send it',
    noCurl: 'No cURL command',
    exportMarkdown: 'Export Markdown',
    reportFileName: 'api-report-{{status}}-{{ts}}.md',
    compareHistory: 'Compare with history',
    showRaw: 'Show raw',
    formatJson: 'Format JSON',
    moreActions: 'More actions',
    proxyTooltip: 'Proxy: {{value}}',
    proxyLabel: '{{type}} proxy',
    diffTitle: 'Response diff (current vs history)',
    diffLeftTitle: 'History response',
    diffRightTitle: 'Current response',
    diffOriginal: 'Original',
    diffCompare: 'Compare',
    noDiffContent: 'Nothing to compare',
    savedToDoc: 'Saved to the API document',
    saveToDoc: 'Save to document',
    saveToDocTitle: 'Save to the API document?',
    saveToDocContent: 'The current runtime settings will overwrite the document definition: query/header/cookie parameters, request body, pre/post scripts and timeout.',
    saveToDocOk: 'Overwrite and save',
    savedAsQuickRequest: 'Saved as a quick request after running',
    resetTitle: 'Reset',
    resetConfirm: 'Discard all temporary changes and restore the original values from the document?',
    resetConfirmOk: 'Reset',
    resetSource: 'Choose what to restore:',
    resetToDoc: 'Restore from document',
    resetToSaved: 'Restore from saved point',
    resetToSavedPointDone: 'Restored from the last saved point',
    resetToDocDone: 'Restored the original document values',
    resetHint: 'Restore the original document values (clears all temporary changes: parameters, headers, body, scripts, etc.)',
    verifyCert: 'Verify certificate',
    sslOffHint: 'HTTPS certificate verification is disabled: useful for self-signed certificates, but not recommended in production',
    sslOnHint: 'HTTPS certificate verification: validates the server certificate',
    sslOffShortHint: 'HTTPS certificate verification is disabled, not recommended in production',
    sslOnShortHint: 'When enabled HTTPS certificates are verified; disable it to debug self-signed certificates',
    timeoutHint: 'Request timeout (seconds). Leave empty to use the global default; 0 means no limit',
    timeoutPlaceholder: 'Timeout',
    pathPlaceholderWithEnv: 'Enter a path (e.g. /users) or a full URL',
    urlPlaceholder: 'Enter a full URL, e.g. https://api.example.com/users',
    urlInputHint: 'Two input modes:\n1. Enter a relative path (e.g. /users); the environment baseUrl is prepended at runtime;\n2. Enter a full URL (starting with http:// or https://); it is used as-is without prepending the environment baseUrl.',
    urlInputHintNoEnv: 'Enter a full URL, e.g. https://api.example.com/users',
    fullUrlHint: 'A full URL is entered, so the request uses it directly without prepending the environment baseUrl',
    fullUrl: 'Full URL',
    fileFilter: 'Files',
    fileSaved: 'File saved',
    saveFailed: 'Failed to save',
    binarySize: '{{size}}KB ({{bytes}} bytes)',
    binaryResponse: 'Binary response',
    saveToLocal: 'Save to local',
    responseImageAlt: 'Response image',
    svgHint: 'SVG image (click Save to download)',
    binaryPreviewHint: 'This response is binary and cannot be previewed as text. Save it locally to inspect it',
    largeBodyRawPrefix: 'Response body',
    largeBodyRawSuffix: ' is shown as raw data. ',
    forceFormat: 'Force formatting',
    forceFormatted: 'The {{size}} response body was force-formatted, which may affect performance',
    /** Report export (content of the downloaded .md file). */
    report: {
      title: '# API Request Report',
      overview: '## Overview',
      method: '- **Method**: {{method}}',
      url: '- **URL**: {{url}}',
      status: '- **Status**: {{status}} {{statusText}}',
      duration: '- **Duration**: {{ms}} ms',
      requestHeaders: '## Request headers',
      query: '## Query parameters',
      requestBody: '## Request body',
      responseHeaders: '## Response headers',
      responseBody: '## Response body',
      none: '_None_',
      tableHeader: '| Name | Value |\n| --- | --- |',
    },
  },

  /** Request history. */
  history: {
    title: 'History',
    total: '{{count}} record(s)',
    apply: 'Fill in',
    compare: 'Compare',
    empty: 'No history yet',
    selectHint: 'Select a record on the left to see its details',
    request: 'Request',
    requestHeaders: 'Request headers ({{count}})',
    queryParams: 'Query parameters ({{count}})',
    requestBody: 'Request body',
    requestBodyParams: 'Request body parameters ({{count}})',
    response: 'Response',
    responseHeaders: 'Response headers ({{count}})',
    diffTitle: 'History diff',
    pickTitle: 'Choose a history record to compare',
    loadFailed: 'Failed to load history',
    applied: 'History request filled in',
  },

  /** Pre/post scripts. */
  script: {
    preScript: 'Pre-request script',
    postScript: 'Post-response script',
    noOutput: 'No output',
    consoleTruncated: '... {{count}} more log entries not shown',
    noTestResults: 'No test results',
    testResults: 'Test results',
    passed: 'Passed',
    failed: 'Failed',
    helpButton: 'Usage guide',
    helpTitle: 'Script usage guide',
    aiTitle: 'Need AI to write the script?',
    aiDesc: 'Copy the prompt below to an AI and describe what you need to generate the code',
    copyPrompt: 'Copy prompt',
    promptCopied: 'Copied to the clipboard. Paste it to an AI',
    copyFailed: 'Copy failed. Please copy it manually',
    introPrefix: 'Use the',
    introSuffix: 'object in scripts to read variables, modify the request, read the response and run assertions.',
    timeout: 'Script execution timed out ({{ms}}ms)',
    preFailed: 'Pre-request script failed: {{error}}',
    preError: 'Pre-request script threw an error: {{error}}',
    postFailed: 'Post-response script failed: {{error}}',
    postError: 'Post-response script threw an error: {{error}}',
    help: {
      envVariables: 'Environment variables',
      globals: 'Global variables',
      variables: 'Temporary variables',
      requestOps: 'Request operations (pre-request script)',
      responseOps: 'Response operations (post-response script)',
      assertions: 'Test assertions',
      console: 'Console output',
      envGet: 'Get an environment variable',
      envSet: 'Set an environment variable (shared per session, usable across requests)',
      envUnset: 'Remove an environment variable',
      envHas: 'Check whether an environment variable exists',
      globalsGet: 'Get a global variable',
      globalsSet: 'Set a global variable',
      globalsUnset: 'Remove a global variable',
      variablesGet: 'Get a temporary variable (lives for this request only)',
      variablesSet: 'Set a temporary variable',
      requestUrl: 'Current request URL',
      requestMethod: 'Current request method',
      requestHeadersUpsert: 'Add or update a request header',
      requestHeadersRemove: 'Remove a request header',
      requestHeadersGet: 'Get a request header value',
      requestBodyUpdate: 'Update the request body',
      responseCode: 'HTTP status code',
      responseStatus: 'Status text',
      responseJson: 'Parse the response body as a JSON object',
      responseText: 'Get the raw response body text',
      responseTime: 'Response time (milliseconds)',
      responseHeadersGet: 'Get a response header value',
      testDeclare: 'Declare a test case and use pm.expect inside fn to assert',
      expectEqual: 'Assert equality',
      expectDeepEqual: 'Assert deep equality',
      expectProperty: 'Assert that the object has a property',
      expectTrue: 'Assert that the value is true',
      expectNotEqual: 'Assert inequality',
      consoleLog: 'Log output',
      consoleWarn: 'Log a warning',
      consoleError: 'Log an error',
    },
    aiPrompt: `You are an API test script assistant. I am using ApiMocktle (a local API management desktop app) that runs JavaScript before and after a request.

## Script types

- **Pre-request script**: runs before the request is sent; can modify request parameters and add auth headers
- **Post-response script**: runs after the response arrives; can parse the response, extract data and run assertions

## Available APIs

### Environment variables (shared per session, usable across requests)
- pm.env.get(key) - get
- pm.env.set(key, value) - set
- pm.env.unset(key) - remove
- pm.env.has(key) - check existence

### Global variables
- pm.globals.get(key) / .set(key, value) / .unset(key) / .has(key)

### Temporary variables (this request only)
- pm.variables.get(key) / .set(key, value)

### Request operations (pre-request script)
- pm.request.url - current request URL
- pm.request.method - request method
- pm.request.headers.upsert({ key, value }) - add or update a request header
- pm.request.headers.remove(key) - remove a request header
- pm.request.headers.get(key) - get a request header
- pm.request.body.update(newBody) - update the request body

### Response operations (post-response script)
- pm.response.code - HTTP status code
- pm.response.status - status text
- pm.response.json() - parse as JSON
- pm.response.text() - raw text
- pm.response.responseTime - response time (ms)
- pm.response.headers.get(key) - get a response header

### Test assertions (post-response script)
- pm.test(name, fn) - declare a test case
- pm.expect(value).to.equal(expected) - equality
- pm.expect(value).to.deep.equal(obj) - deep equality
- pm.expect(obj).to.have.property(key) - has property
- pm.expect(value).to.be.true / .to.be.false

### Console output
- console.log() / console.warn() / console.error()

### Time functions (standard JavaScript APIs)
- Date.now() - current timestamp
- new Date() - date object

## Common examples

### 1. Automatic token refresh
Pre-request script:
\`\`\`javascript
const token = pm.env.get('authToken')
if (token) {
  pm.request.headers.upsert({ key: 'Authorization', value: \`Bearer \${token}\` })
}
\`\`\`

Post-response script (extract and store the token):
\`\`\`javascript
const json = pm.response.json()
if (json.data?.token) {
  pm.env.set('authToken', json.data.token)
  console.log('Token updated')
}
\`\`\`

### 2. Response assertions
\`\`\`javascript
pm.test('status code should be 200', () => {
  pm.expect(pm.response.code).to.equal(200)
})

pm.test('should return a success field', () => {
  const json = pm.response.json()
  pm.expect(json).to.have.property('success')
  pm.expect(json.success).to.be.true
})
\`\`\`

### 3. Chained requests (extract an ID from the response for the next request)
\`\`\`javascript
const json = pm.response.json()
if (json.data?.id) {
  pm.env.set('userId', json.data.id)
  console.log(\`Extracted userId: \${json.data.id}\`)
}
\`\`\`

### 4. Dynamic signature
\`\`\`javascript
const timestamp = Date.now()
const sign = btoa(\`\${timestamp}:\${pm.request.url}\`)
pm.request.headers.upsert({ key: 'X-Sign', value: sign })
pm.request.headers.upsert({ key: 'X-Timestamp', value: String(timestamp) })
\`\`\`

## Variable usage

Prefer environment variables for data that must be shared across requests. In request parameters (Params/Headers/Cookie) or the body you can reference variables with the \`{{variableName}}\` syntax; they are replaced with their actual values when the request is sent.

Examples:
- In a header: \`Authorization: Bearer {{authToken}}\`
- In the query: \`?userId={{userId}}\`
- In the body: \`{ "token": "{{authToken}}" }\`

Variable precedence (highest first): session variables > environment variables > global variables

Built-in dynamic variables (\`{{$xxx}}\`, regenerated on every request, no definition needed):
- \`{{$timestamp}}\` second-level timestamp | \`{{$timestampISO}}\` ISO 8601 time
- \`{{$guid}}\` UUID (with dashes) | \`{{$randomUUID}}\` UUID (without dashes)
- \`{{$randomInt}}\` random number 0-1000 | \`{{$randomEmail}}\` random email
- \`{{$randomIP}}\` random IPv4 | \`{{$randomMobile}}\` random mobile number | \`{{$randomString}}\` 8-character random string

Please write the script for my needs and just give me code I can paste.`,
  },

  /** cURL import and parsing. */
  curl: {
    unsupportedMethod: 'Unsupported request method: {{method}}',
    unknown: 'unknown',
    invalidUrl: 'No valid request URL found',
    getOnlyQueryOrForm: 'A GET cURL command only supports URL query parameters or x-www-form-urlencoded data',
    invalidHeader: 'Invalid header format: {{line}}',
    jsonBodyParseFailed: 'Failed to parse the JSON body. Please check the request body in the cURL command',
  },
}
