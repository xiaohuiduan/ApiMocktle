/**
 * Public read-only share page copy.
 *
 * The share page is a standalone browser entry for LAN visitors: it has no Tauri
 * IPC and no language switcher, so the language follows the visitor's browser
 * (`initI18n({ mode: 'system' })`).
 */
export const share = {
  page: {
    title: 'API documentation',
  },
  /** Password gate */
  auth: {
    passwordProtected: 'This share is password protected',
    passwordPlaceholder: 'Enter the access password',
    passwordRequired: 'Please enter the password',
    enter: 'Enter documentation',
  },
  /** Header counters */
  header: {
    apiCount: '{{total}} APIs',
    docCount: '{{total}} docs',
    schemaCount: '{{total}} models',
  },
  /** Sidebar tree */
  tree: {
    emptyHint: 'Select an API or document on the left to view it',
  },
  /** Schema field table columns (shared by API detail and data model) */
  table: {
    field: 'Field',
    type: 'Type',
    required: 'Required',
    optional: 'Optional',
    description: 'Description',
  },
  /** API detail */
  apiDetail: {
    unnamed: 'Untitled API',
    serverUrl: 'Base URL',
    requestParams: 'Request parameters',
    pathParams: 'Path parameters',
    queryParams: 'Query parameters',
    headerParams: 'Header parameters',
    cookieParams: 'Cookie parameters',
    paramName: 'Parameter',
    requestBody: 'Request body',
    requestBodySchema: 'Request body schema',
    responses: 'Responses',
    responseSchema: 'Response schema',
  },
  /** Data model */
  schema: {
    example: 'Example',
  },
  /** Error messages */
  error: {
    missingShareId: 'The link is missing a share ID',
    network: 'Network error. Please make sure the share service is running',
    autoLoginFailed: 'Automatic sign-in failed. Please enter the password manually',
    loadFailed: 'Failed to load',
    requestFailed: 'Request failed ({{status}})',
  },
}
