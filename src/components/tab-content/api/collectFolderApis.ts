import type { ApiMenuData } from '@/components/ApiMenu/ApiMenu.type'
import { MenuItemType } from '@/enums'

/**
 * 递归收集某个目录下所有可运行的接口（ApiDetail / HttpRequest），
 * 菜单为扁平 parentId 结构，故按 parentId 向下遍历。
 */
export function collectFolderApis(folderId: string, menuRawList: ApiMenuData[]): ApiMenuData[] {
  const result: ApiMenuData[] = []
  const direct = menuRawList.filter((m) => m.parentId === folderId)

  for (const m of direct) {
    if (m.type === MenuItemType.ApiDetail || m.type === MenuItemType.HttpRequest) {
      result.push(m)
    }
    else {
      // 子目录（文件夹）继续递归
      result.push(...collectFolderApis(m.id, menuRawList))
    }
  }

  return result
}
