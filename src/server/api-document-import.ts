import type { ApiMenuData } from '@/components/ApiMenu'

import { parseDocumentFromFile } from './document-import-utils'
import { importOpenApiDocumentToMenuItems } from './openapi'
import { importPostmanCollectionDocumentToMenuItems, isPostmanCollectionDocument } from './postman-import'
import type { ImportMergeMode } from './project-import'
import { swaggerToOpenApi } from './swagger-to-openapi'

function isOpenApiDocument(doc: Record<string, unknown>) {
  return typeof doc.openapi === 'string'
}

function isSwaggerDocument(doc: Record<string, unknown>) {
  return doc.swagger === '2.0'
}

export function importApiDocumentToMenuItems(
  fileContent: string,
  filename: string,
): { menuItems: ApiMenuData[], mergeMode: ImportMergeMode } {
  const doc = parseDocumentFromFile(fileContent, filename)

  if (isOpenApiDocument(doc)) {
    return {
      menuItems: importOpenApiDocumentToMenuItems(doc),
      mergeMode: 'openapi-upsert',
    }
  }

  if (isSwaggerDocument(doc)) {
    const openApiDoc = swaggerToOpenApi(doc)

    return {
      menuItems: importOpenApiDocumentToMenuItems(openApiDoc),
      mergeMode: 'openapi-upsert',
    }
  }

  if (isPostmanCollectionDocument(doc)) {
    return {
      menuItems: importPostmanCollectionDocumentToMenuItems(doc),
      mergeMode: 'append',
    }
  }

  throw new Error('仅支持 OpenAPI 3.x / Swagger 2.0 或 Postman Collection v2/v2.1')
}
