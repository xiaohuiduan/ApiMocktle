use std::collections::{HashMap, HashSet};

use crate::models::ApiMenuData;

/// 参与路径拼接的目录类型。与 `exports.rs` 的导出口径保持一致。
const FOLDER_TYPE: &str = "apiDetailFolder";
/// 防御父子关系成环。
const MAX_DEPTH: usize = 32;

/// 一次遍历算出每个菜单项的目录路径（`A/B` 形态）。
///
/// - 目录：祖先目录路径 + 自身名，根级即自身名
/// - 其它类型（接口、模型等）：所在目录路径，根级为 `None`
pub fn folder_paths(items: &[ApiMenuData]) -> HashMap<String, Option<String>> {
    let by_id: HashMap<&str, &ApiMenuData> = items.iter().map(|i| (i.id.as_str(), i)).collect();
    items
        .iter()
        .map(|item| {
            let parent_path = ancestor_path(&by_id, item.parent_id.as_deref());
            let path = if item.menu_type == FOLDER_TYPE {
                Some(match parent_path {
                    Some(p) => format!("{}/{}", p, item.name),
                    None => item.name.clone(),
                })
            } else {
                parent_path
            };
            (item.id.clone(), path)
        })
        .collect()
}

/// 收集 `roots` 及其全部子孙目录的 id（含自身）。
///
/// 只沿 `apiDetailFolder` 下钻；`insert` 的幂等性同时防御父子成环。
/// 调用方拿这个集合去筛接口、或累加子树计数。
pub fn collect_subtree_ids<'a>(items: &'a [ApiMenuData], roots: &[&'a str]) -> HashSet<&'a str> {
    let mut owned: HashSet<&str> = roots.iter().copied().collect();
    let mut changed = true;
    while changed {
        changed = false;
        for i in items.iter().filter(|i| i.menu_type == FOLDER_TYPE) {
            if let Some(pid) = i.parent_id.as_deref() {
                if owned.contains(pid) && owned.insert(i.id.as_str()) {
                    changed = true;
                }
            }
        }
    }
    owned
}

/// 沿 `parent_id` 链收集目录名，拼成 `A/B`；无目录祖先返回 `None`。
fn ancestor_path(
    by_id: &HashMap<&str, &ApiMenuData>,
    start: Option<&str>,
) -> Option<String> {
    let mut names: Vec<String> = Vec::new();
    let mut current = start;
    let mut depth = 0;
    while let Some(id) = current {
        if depth >= MAX_DEPTH {
            break;
        }
        depth += 1;
        let Some(parent) = by_id.get(id) else {
            break;
        };
        if parent.menu_type == FOLDER_TYPE {
            names.push(parent.name.clone());
        }
        current = parent.parent_id.as_deref();
    }
    if names.is_empty() {
        return None;
    }
    names.reverse();
    Some(names.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, parent: Option<&str>, name: &str, menu_type: &str) -> ApiMenuData {
        ApiMenuData {
            id: id.to_string(),
            parent_id: parent.map(str::to_string),
            name: name.to_string(),
            menu_type: menu_type.to_string(),
            data_json: None,
            run_tab_json: None,
            sort_order: 0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn root_folder_path_is_its_own_name() {
        let items = vec![item("f1", None, "微信支付", "apiDetailFolder")];
        let paths = folder_paths(&items);
        assert_eq!(paths["f1"].as_deref(), Some("微信支付"));
    }

    #[test]
    fn nested_folder_and_endpoint_paths() {
        let items = vec![
            item("f1", None, "微信支付", "apiDetailFolder"),
            item("f2", Some("f1"), "服务商", "apiDetailFolder"),
            item("api1", Some("f2"), "下单", "apiDetail"),
        ];
        let paths = folder_paths(&items);
        assert_eq!(paths["f2"].as_deref(), Some("微信支付/服务商"));
        assert_eq!(paths["api1"].as_deref(), Some("微信支付/服务商"));
    }

    #[test]
    fn root_level_endpoint_has_no_path() {
        let items = vec![
            item("api1", None, "登录", "apiDetail"),
            item("api2", Some("missing"), "孤儿", "apiDetail"),
        ];
        let paths = folder_paths(&items);
        assert!(paths["api1"].is_none());
        assert!(paths["api2"].is_none());
    }

    #[test]
    fn cycle_does_not_loop_forever() {
        let items = vec![
            item("a", Some("b"), "A", "apiDetailFolder"),
            item("b", Some("a"), "B", "apiDetailFolder"),
        ];
        let paths = folder_paths(&items);
        // 只要不死循环、能返回即可；具体拼接结果不作断言
        assert!(paths.contains_key("a"));
        assert!(paths.contains_key("b"));
    }
}
