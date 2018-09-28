/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

let {ElemHideEmulation} =
  require("./adblockpluscore/lib/content/elemHideEmulation");

// This variable is also used by our other content scripts.
let contentFiltering;

const typeMap = new Map([
  ["img", "IMAGE"],
  ["input", "IMAGE"],
  ["picture", "IMAGE"],
  ["audio", "MEDIA"],
  ["video", "MEDIA"],
  ["frame", "SUBDOCUMENT"],
  ["iframe", "SUBDOCUMENT"],
  ["object", "OBJECT"],
  ["embed", "OBJECT"]
]);

let collapsingSelectors = new Set();

function getURLsFromObjectElement(element)
{
  let url = element.getAttribute("data");
  if (url)
    return [url];

  for (let child of element.children)
  {
    if (child.localName != "param")
      continue;

    let name = child.getAttribute("name");
    if (name != "movie" &&  // Adobe Flash
        name != "source" && // Silverlight
        name != "src" &&    // Real Media + Quicktime
        name != "FileName") // Windows Media
      continue;

    let value = child.getAttribute("value");
    if (!value)
      continue;

    return [value];
  }

  return [];
}

function getURLsFromAttributes(element)
{
  let urls = [];

  if (element.src)
    urls.push(element.src);

  if (element.srcset)
  {
    for (let candidate of element.srcset.split(","))
    {
      let url = candidate.trim().replace(/\s+\S+$/, "");
      if (url)
        urls.push(url);
    }
  }

  return urls;
}

function getURLsFromMediaElement(element)
{
  let urls = getURLsFromAttributes(element);

  for (let child of element.children)
  {
    if (child.localName == "source" || child.localName == "track")
      urls.push(...getURLsFromAttributes(child));
  }

  if (element.poster)
    urls.push(element.poster);

  return urls;
}

function getURLsFromElement(element)
{
  let urls;
  switch (element.localName)
  {
    case "object":
      urls = getURLsFromObjectElement(element);
      break;

    case "video":
    case "audio":
    case "picture":
      urls = getURLsFromMediaElement(element);
      break;

    default:
      urls = getURLsFromAttributes(element);
      break;
  }

  for (let i = 0; i < urls.length; i++)
  {
    if (/^(?!https?:)[\w-]+:/i.test(urls[i]))
      urls.splice(i--, 1);
  }

  return urls;
}

function getSelectorForBlockedElement(element)
{
  // Microsoft Edge does not support CSS.escape(). However, it doesn't
  // support user style sheets either. So the selector would be added
  // with an author style sheet anyway, which doesn't provide any benefits.
  if (!("escape" in CSS))
    return null;

  // Setting the "display" CSS property to "none" doesn't have any effect on
  // <frame> elements (in framesets). So we have to hide it inline through
  // the "visibility" CSS property.
  if (element.localName == "frame")
    return null;

  // If the <video> or <audio> element contains any <source> or <track>
  // children, we cannot address it in CSS by the source URL; in that case we
  // don't "collapse" it using a CSS selector but rather hide it directly by
  // setting the style="..." attribute.
  if (element.localName == "video" || element.localName == "audio")
  {
    for (let child of element.children)
    {
      if (child.localName == "source" || child.localName == "track")
        return null;
    }
  }

  let selector = "";
  for (let attr of ["src", "srcset"])
  {
    let value = element.getAttribute(attr);
    if (value && attr in element)
      selector += "[" + attr + "=" + CSS.escape(value) + "]";
  }

  return selector ? element.localName + selector : null;
}

function hideElement(element)
{
  function doHide()
  {
    let propertyName = "display";
    let propertyValue = "none";
    if (element.localName == "frame")
    {
      propertyName = "visibility";
      propertyValue = "hidden";
    }

    if (element.style.getPropertyValue(propertyName) != propertyValue ||
        element.style.getPropertyPriority(propertyName) != "important")
      element.style.setProperty(propertyName, propertyValue, "important");
  }

  doHide();

  new MutationObserver(doHide).observe(
    element, {
      attributes: true,
      attributeFilter: ["style"]
    }
  );
}

function checkCollapse(element)
{
  let mediatype = typeMap.get(element.localName);
  if (!mediatype)
    return;

  let urls = getURLsFromElement(element);
  if (urls.length == 0)
    return;

  // Construct the selector here, because the attributes it relies on can change
  // between now and when we get the response from the background page.
  let selector = getSelectorForBlockedElement(element);

  browser.runtime.sendMessage(
    {
      type: "filters.collapse",
      urls,
      mediatype,
      baseURL: document.location.href
    },
    collapse =>
    {
      if (collapse)
      {
        if (selector)
        {
          if (!collapsingSelectors.has(selector))
          {
            collapsingSelectors.add(selector);
            contentFiltering.addSelectors([selector], null, "collapsing", true);
          }
        }
        else
        {
          hideElement(element);
        }
      }
    }
  );
}

function checkSitekey()
{
  let attr = document.documentElement.getAttribute("data-adblockkey");
  if (attr)
    browser.runtime.sendMessage({type: "filters.addKey", token: attr});
}

function ElementHidingTracer()
{
  this.selectors = [];
  this.changedNodes = [];
  this.timeout = null;
  this.observer = new MutationObserver(this.observe.bind(this));
  this.trace = this.trace.bind(this);

  if (document.readyState == "loading")
    document.addEventListener("DOMContentLoaded", this.trace);
  else
    this.trace();
}
ElementHidingTracer.prototype = {
  addSelectors(selectors, filters)
  {
    let pairs = selectors.map((sel, i) => [sel, filters && filters[i]]);

    if (document.readyState != "loading")
      this.checkNodes([document], pairs);

    this.selectors.push(...pairs);
  },

  checkNodes(nodes, pairs)
  {
    let selectors = [];
    let filters = [];

    for (let [selector, filter] of pairs)
    {
      nodes: for (let node of nodes)
      {
        for (let element of node.querySelectorAll(selector))
        {
          // Only consider selectors that actually have an effect on the
          // computed styles, and aren't overridden by rules with higher
          // priority, or haven't been circumvented in a different way.
          if (getComputedStyle(element).display == "none")
          {
            // For regular element hiding, we don't know the exact filter,
            // but the background page can find it with the given selector.
            // In case of element hiding emulation, the generated selector
            // we got here is different from the selector part of the filter,
            // but in this case we can send the whole filter text instead.
            if (filter)
              filters.push(filter);
            else
              selectors.push(selector);

            break nodes;
          }
        }
      }
    }

    if (selectors.length > 0 || filters.length > 0)
    {
      browser.runtime.sendMessage({
        type: "hitLogger.traceElemHide",
        selectors, filters
      });
    }
  },

  onTimeout()
  {
    this.checkNodes(this.changedNodes, this.selectors);
    this.changedNodes = [];
    this.timeout = null;
  },

  observe(mutations)
  {
    // Forget previously changed nodes that are no longer in the DOM.
    for (let i = 0; i < this.changedNodes.length; i++)
    {
      if (!document.contains(this.changedNodes[i]))
        this.changedNodes.splice(i--, 1);
    }

    for (let mutation of mutations)
    {
      let node = mutation.target;

      // Ignore mutations of nodes that aren't in the DOM anymore.
      if (!document.contains(node))
        continue;

      // Since querySelectorAll() doesn't consider the root itself
      // and since CSS selectors can also match siblings, we have
      // to consider the parent node for attribute mutations.
      if (mutation.type == "attributes")
        node = node.parentNode;

      let addNode = true;
      for (let i = 0; i < this.changedNodes.length; i++)
      {
        let previouslyChangedNode = this.changedNodes[i];

        // If we are already going to check an ancestor of this node,
        // we can ignore this node, since it will be considered anyway
        // when checking one of its ancestors.
        if (previouslyChangedNode.contains(node))
        {
          addNode = false;
          break;
        }

        // If this node is an ancestor of a node that previously changed,
        // we can ignore that node, since it will be considered anyway
        // when checking one of its ancestors.
        if (node.contains(previouslyChangedNode))
          this.changedNodes.splice(i--, 1);
      }

      if (addNode)
        this.changedNodes.push(node);
    }

    // Check only nodes whose descendants have changed, and not more often
    // than once a second. Otherwise large pages with a lot of DOM mutations
    // (like YouTube) freeze when the devtools panel is active.
    if (this.timeout == null)
      this.timeout = setTimeout(this.onTimeout.bind(this), 1000);
  },

  trace()
  {
    this.checkNodes([document], this.selectors);

    this.observer.observe(
      document,
      {
        childList: true,
        attributes: true,
        subtree: true
      }
    );
  },

  disconnect()
  {
    document.removeEventListener("DOMContentLoaded", this.trace);
    this.observer.disconnect();
    clearTimeout(this.timeout);
  }
};

function ContentFiltering()
{
  this.styles = new Map();
  this.tracer = null;
  this.inline = true;
  this.inlineEmulated = true;

  this.elemHideEmulation = new ElemHideEmulation(
    this.addSelectors.bind(this),
    this.hideElements.bind(this)
  );
}
ContentFiltering.prototype = {
  selectorGroupSize: 1024,

  addSelectorsInline(selectors, groupName, appendOnly = false)
  {
    let style = this.styles.get(groupName);

    if (style && !appendOnly)
    {
      while (style.sheet.cssRules.length > 0)
        style.sheet.deleteRule(0);
    }

    if (selectors.length == 0)
      return;

    if (!style)
    {
      // Create <style> element lazily, only if we add styles. Add it to
      // the <head> or <html> element. If we have injected a style element
      // before that has been removed (the sheet property is null), create a
      // new one.
      style = document.createElement("style");
      (document.head || document.documentElement).appendChild(style);

      // It can happen that the frame already navigated to a different
      // document while we were waiting for the background page to respond.
      // In that case the sheet property may stay null, after adding the
      // <style> element.
      if (!style.sheet)
        return;

      this.styles.set(groupName, style);
    }

    // Chromium's Blink engine supports only up to 8,192 simple selectors, and
    // even fewer compound selectors, in a rule. The exact number of selectors
    // that would work depends on their sizes (e.g. "#foo .bar" has a
    // size of 2). Since we don't know the sizes of the selectors here, we
    // simply split them into groups of 1,024, based on the reasonable
    // assumption that the average selector won't have a size greater than 8.
    // The alternative would be to calculate the sizes of the selectors and
    // divide them up accordingly, but this approach is more efficient and has
    // worked well in practice. In theory this could still lead to some
    // selectors not working on Chromium, but it is highly unlikely.
    // See issue #6298 and https://crbug.com/804179
    for (let i = 0; i < selectors.length; i += this.selectorGroupSize)
    {
      let selector = selectors.slice(i, i + this.selectorGroupSize).join(", ");
      style.sheet.insertRule(selector + "{display: none !important;}",
                             style.sheet.cssRules.length);
    }
  },

  addSelectors(selectors, filters, groupName = "emulated", appendOnly = false)
  {
    if (this.inline || this.inlineEmulated)
    {
      // Insert the style rules inline if we have been instructed by the
      // background page to do so. This is usually the case, except on platforms
      // that do support user stylesheets via the browser.tabs.insertCSS API
      // (Firefox 53 onwards for now and possibly Chrome in the near future).
      // Once all supported platforms have implemented this API, we can remove
      // the code below. See issue #5090.
      // Related Chrome and Firefox issues:
      // https://bugs.chromium.org/p/chromium/issues/detail?id=632009
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1310026
      this.addSelectorsInline(selectors, groupName, appendOnly);
    }
    else
    {
      browser.runtime.sendMessage({
        type: "content.injectSelectors",
        selectors,
        groupName,
        appendOnly
      });
    }

    // Only trace selectors that are based directly on hiding filters
    // (i.e. leave out collapsing selectors).
    if (this.tracer && groupName != "collapsing")
      this.tracer.addSelectors(selectors, filters);
  },

  hideElements(elements, filters)
  {
    for (let element of elements)
      hideElement(element);

    if (this.tracer)
    {
      browser.runtime.sendMessage({
        type: "hitLogger.traceElemHide",
        selectors: [],
        filters
      });
    }
  },

  apply(filterTypes)
  {
    browser.runtime.sendMessage({
      type: "content.applyFilters",
      filterTypes
    },
    response =>
    {
      if (this.tracer)
        this.tracer.disconnect();
      this.tracer = null;

      if (response.trace)
        this.tracer = new ElementHidingTracer();

      this.inline = response.inline;
      this.inlineEmulated = !!response.inlineEmulated;

      if (this.inline)
        this.addSelectorsInline(response.selectors, "standard");

      if (this.tracer)
        this.tracer.addSelectors(response.selectors);

      // Prefer CSS selectors for -abp-has and -abp-contains unless the
      // background page has asked us to use inline styles.
      this.elemHideEmulation.useInlineStyles = this.inline ||
                                               this.inlineEmulated;

      this.elemHideEmulation.apply(response.emulatedPatterns);
    });
  }
};

if (document instanceof HTMLDocument)
{
  checkSitekey();

  contentFiltering = new ContentFiltering();
  contentFiltering.apply();

  document.addEventListener("error", event =>
  {
    checkCollapse(event.target);
  }, true);

  document.addEventListener("load", event =>
  {
    let element = event.target;
    if (/^i?frame$/.test(element.localName))
      checkCollapse(element);
  }, true);
}

window.checkCollapse = checkCollapse;
window.contentFiltering = contentFiltering;
window.typeMap = typeMap;
window.getURLsFromElement = getURLsFromElement;
