/**
 * main.js
 */

import {
  getType, isObjectNotEmpty, isString, logErr,
} from "./common.js";
import {
  createTab,
} from "./browser.js";
import snsData from "./sns.js";

/* api */
const {i18n, menus, tabs} = browser;

/* constants */
import {
  CONTEXT_INFO, SHARE_LINK, SHARE_PAGE, SHARE_SNS, SHARE_TAB,
} from "./constant.js";
const {TAB_ID_NONE} = tabs;

/* sns */
export const sns = new Map();

/**
 * set sns items
 * @returns {void}
 */
export const setSnsItems = async () => {
  const items = Object.entries(snsData);
  for (const item of items) {
    const [key, value] = item;
    sns.set(key, value);
  }
};

/**
 * get sns item from menu item ID
 * @param {string} id - menu item ID
 * @returns {Object} - sns item
 */
export const getSnsItemFromId = async id => {
  if (!isString(id)) {
    throw new TypeError(`Expected String but got ${getType(id)}.`);
  }
  let item;
  if (id.startsWith(SHARE_LINK)) {
    item = sns.get(id.replace(SHARE_LINK, ""));
  } else if (id.startsWith(SHARE_TAB)) {
    item = sns.get(id.replace(SHARE_TAB, ""));
  } else {
    item = sns.get(id.replace(SHARE_PAGE, ""));
  }
  return item || null;
};

/**
 * toggle sns item
 * @param {string} id - item ID
 * @param {Object} obj - value object
 * @returns {void}
 */
export const toggleSnsItem = async (id, obj = {}) => {
  if (!isString(id)) {
    throw new TypeError(`Expected String but got ${getType(id)}.`);
  }
  const {checked, subItemOf, value} = obj;
  const item = subItemOf || id;
  const data = sns.get(item);
  if (data) {
    if (subItemOf) {
      const {subItem} = data;
      if (isObjectNotEmpty(subItem) && subItem.hasOwnProperty(id)) {
        data.subItem[id].value = value || null;
        sns.set(item, data);
      }
    } else {
      data.enabled = !!checked;
      sns.set(item, data);
    }
  }
};

/**
 * create sns item url
 * @param {string} url - url
 * @param {Object} info - sns item url info
 * @returns {string} - sns url
 */
export const createSnsUrl = async (url, info) => {
  if (!isString(url)) {
    throw new TypeError(`Expected String but got ${getType(url)}.`);
  }
  let snsUrl;
  if (isObjectNotEmpty(info)) {
    const {url: tmpl, value} = info;
    if (isString(tmpl) && isString(value)) {
      try {
        const {origin, protocol} = new URL(value.trim());
        if (/^https?:$/.test(protocol)) {
          const query = encodeURIComponent(url);
          snsUrl = tmpl.replace("%origin%", origin).replace("%query%", query);
        }
      } catch (e) {
        logErr(e);
        snsUrl = null;
      }
    }
  }
  return snsUrl || url;
};

/* context info */
export const contextInfo = {
  canonicalUrl: null,
};

/**
 * init context info
 * @returns {Object} - context info
 */
export const initContextInfo = async () => {
  contextInfo.canonicalUrl = null;
  return contextInfo;
};

/**
 * update context info
 * @param {Object} data - context info data
 * @returns {Object} - context info
 */
export const updateContextInfo = async (data = {}) => {
  const {contextInfo: info} = data;
  if (info) {
    const {canonicalUrl} = info;
    contextInfo.canonicalUrl = canonicalUrl || null;
  } else {
    await initContextInfo();
  }
  return contextInfo;
};

/**
 * extract clicked data
 * @param {Object} info - clicked menu info
 * @param {Object} tab - tabs.Tab
 * @returns {Promise.<Array>} - results of each handler
 */
export const extractClickedData = async (info = {}, tab = {}) => {
  const {
    id: tabId, index: tabIndex, title: tabTitle, url: tabUrl, windowId,
  } = tab;
  const func = [];
  if (Number.isInteger(tabId) && tabId !== TAB_ID_NONE &&
      Number.isInteger(tabIndex)) {
    const {linkText, linkUrl, menuItemId, selectionText} = info;
    const snsItem = await getSnsItemFromId(menuItemId);
    if (snsItem) {
      const {subItem, url: tmpl} = snsItem;
      const selText =
        isString(selectionText) && selectionText.replace(/\s+/g, " ") || "";
      const canonicalUrl =
        info.canonicalUrl || contextInfo.canonicalUrl || null;
      const {hash: tabUrlHash} = new URL(tabUrl);
      let shareText, shareUrl, url;
      if (menuItemId.startsWith(SHARE_LINK)) {
        shareText = encodeURIComponent(selText || linkText);
        shareUrl = encodeURIComponent(linkUrl);
      } else {
        shareText = encodeURIComponent(selText || tabTitle);
        shareUrl = encodeURIComponent(!tabUrlHash && canonicalUrl || tabUrl);
      }
      url = tmpl.replace("%url%", shareUrl).replace("%text%", shareText);
      if (subItem) {
        const items = Object.values(subItem);
        let itemInfo;
        for (const item of items) {
          if (isObjectNotEmpty(item) && item.hasOwnProperty("url")) {
            itemInfo = item;
            break;
          }
        }
        if (itemInfo) {
          url = await createSnsUrl(url, itemInfo);
        }
      }
      func.push(createTab({
        url, windowId,
        active: true,
        index: tabIndex + 1,
        openerTabId: tabId,
      }));
    }
  }
  func.push(initContextInfo());
  return Promise.all(func);
};

/* context menu */
/**
 * remove context menu
 * @returns {AsyncFunction} - results of each handler
 */
export const removeMenu = async () => menus.removeAll();

/**
 * create context menu item
 * @param {string} id - menu item ID
 * @param {string} title - menu item title
 * @param {Object} data - context data
 * @returns {?AsyncFunction} - menus.create()
 */
export const createMenuItem = async (id, title, data = {}) => {
  if (!isString(id)) {
    throw new TypeError(`Expected String but got ${getType(id)}.`);
  }
  if (!isString(title)) {
    throw new TypeError(`Expected String but got ${getType(title)}.`);
  }
  const {contexts, enabled} = data;
  let func;
  if (Array.isArray(contexts)) {
    const opt = {
      id, contexts, title,
      enabled: !!enabled,
    };
    func = menus.create(opt);
  }
  return func || null;
};

/**
 * create context menu items
 * @returns {Promise.<Array>} - results of each handler
 */
export const createMenu = async () => {
  const func = [];
  sns.forEach(value => {
    if (isObjectNotEmpty(value)) {
      const {enabled, id, menu} = value;
      const key = menu || id;
      enabled && isString(id) && isString(key) && func.push(
        createMenuItem(
          `${SHARE_PAGE}${id}`,
          i18n.getMessage(SHARE_PAGE, key),
          {
            enabled,
            contexts: ["page", "selection"],
          },
        ),
        createMenuItem(
          `${SHARE_TAB}${id}`,
          i18n.getMessage(SHARE_TAB, key),
          {
            enabled,
            contexts: ["tab"],
          },
        ),
        createMenuItem(
          `${SHARE_LINK}${id}`,
          i18n.getMessage(SHARE_LINK, key),
          {
            enabled,
            contexts: ["link"],
          },
        ),
      );
    }
  });
  return Promise.all(func);
};

/* runtime */
/**
 * handle runtime message
 * @param {Object} msg - message
 * @returns {Promise.<Array>} - results of each handler
 */
export const handleMsg = async msg => {
  const func = [];
  if (isObjectNotEmpty(msg)) {
    const items = Object.entries(msg);
    for (const item of items) {
      const [key, value] = item;
      switch (key) {
        case CONTEXT_INFO: {
          func.push(updateContextInfo(value));
          break;
        }
        case SHARE_SNS: {
          const {info, tab} = value;
          func.push(extractClickedData(info, tab));
          break;
        }
        default:
      }
    }
  }
  return Promise.all(func);
};

/* storage */
/**
 * handle stored data
 * @param {Object} data - stored data
 * @returns {Promise.<Array>} - results of each handler
 */
export const handleStoredData = async data => {
  const func = [];
  if (isObjectNotEmpty(data)) {
    const items = Object.entries(data);
    for (const item of items) {
      const [key, value] = item;
      if (isObjectNotEmpty(value)) {
        const {newValue} = value;
        func.push(toggleSnsItem(key, newValue || value));
      }
    }
  }
  return Promise.all(func);
};
