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

let contentFiltering;
let collapsedSelectors = new Set();

function getURLFromElement(element)
{
  if (element.localName == "object")
  {
    if (element.data)
      return element.data;

    for (let child of element.children)
    {
      if (child.localName == "param" && child.name == "movie" && child.value)
        return new URL(child.value, document.baseURI).href;
    }

    return null;
  }

  return element.currentSrc || element.src;
}

function getSelectorForBlockedElement(element)
{
  // Setting the "display" CSS property to "none" doesn't have any effect on
  // <frame> elements (in framesets). So we have to hide it inline through
  // the "visibility" CSS property.
  if (element.localName == "frame")
    return null;

  // If the <video> or <audio> element contains any <source> children,
  // we cannot address it in CSS by the source URL; in that case we
  // don't "collapse" it using a CSS selector but rather hide it directly by
  // setting the style="..." attribute.
  if (element.localName == "video" || element.localName == "audio")
  {
    for (let child of element.children)
    {
      if (child.localName == "source")
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

function hideElement(element, properties)
{
  let {style} = element;
  let actualProperties = [];

  if (element.localName == "frame")
    actualProperties = properties = [["visibility", "hidden"]];
  else if (!properties)
    actualProperties = properties = [["display", "none"]];

  for (let [key, value] of properties)
    style.setProperty(key, value, "important");

  if (!actualProperties)
  {
    actualProperties = [];
    for (let [key] of properties)
      actualProperties.push([key, style.getPropertyValue(key)]);
  }

  new MutationObserver(() =>
  {
    for (let [key, value] of actualProperties)
    {
      if (style.getPropertyValue(key) != value ||
          style.getPropertyPriority(key) != "important")
        style.setProperty(key, value, "important");
    }
  }).observe(
    element, {
      attributes: true,
      attributeFilter: ["style"]
    }
  );
}

function collapseElement(element)
{
  let selector = getSelectorForBlockedElement(element);
  if (selector)
  {
    if (!collapsedSelectors.has(selector))
    {
      contentFiltering.addSelectors([selector], "collapsing", true);
      collapsedSelectors.add(selector);
    }
  }
  else
  {
    hideElement(element);
  }
}

function startElementCollapsing()
{
  let deferred = null;

  browser.runtime.onMessage.addListener((message, sender) =>
  {
    if (message.type != "filters.collapse")
      return;

    if (document.readyState == "loading")
    {
      if (!deferred)
      {
        deferred = new Map();
        document.addEventListener("DOMContentLoaded", () =>
        {
          for (let [selector, urls] of deferred)
          {
            for (let element of document.querySelectorAll(selector))
            {
              if (urls.has(getURLFromElement(element)))
                collapseElement(element);
            }
          }

          deferred = null;
        });
      }

      let urls = deferred.get(message.selector) || new Set();
      deferred.set(message.selector, urls);
      urls.add(message.url);
    }
    else
    {
      for (let element of document.querySelectorAll(message.selector))
      {
        if (getURLFromElement(element) == message.url)
          collapseElement(element);
      }
    }
  });
}

function checkSitekey()
{
  let attr = document.documentElement.getAttribute("data-adblockkey");
  if (attr)
    browser.runtime.sendMessage({type: "filters.addKey", token: attr});
}

function ElementHidingTracer(selectors, exceptions)
{
  this.selectors = selectors;
  this.exceptions = exceptions;
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
  checkNodes(nodes)
  {
    let effectiveSelectors = [];
    let effectiveExceptions = [];

    for (let selector of this.selectors)
    {
      for (let node of nodes)
      {
        if (node.querySelector(selector))
        {
          effectiveSelectors.push(selector);
          break;
        }
      }
    }

    for (let exception of this.exceptions)
    {
      for (let node of nodes)
      {
        if (node.querySelector(exception.selector))
        {
          effectiveExceptions.push(exception.text);
          break;
        }
      }
    }

    if (effectiveSelectors.length > 0 || effectiveExceptions.length > 0)
    {
      browser.runtime.sendMessage({
        type: "hitLogger.traceElemHide",
        selectors: effectiveSelectors,
        filters: effectiveExceptions
      });
    }
  },

  onTimeout()
  {
    this.checkNodes(this.changedNodes);
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
    this.checkNodes([document]);

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
  this.cssProperties = null;
  this.elemHideEmulation = new ElemHideEmulation(this.hideElements.bind(this));
}
ContentFiltering.prototype = {
  addRulesInline(rules, groupName = "standard", appendOnly = false)
  {
    let style = this.styles.get(groupName);

    if (style && !appendOnly)
    {
      while (style.sheet.cssRules.length > 0)
        style.sheet.deleteRule(0);
    }

    if (rules.length == 0)
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

    for (let rule of rules)
      style.sheet.insertRule(rule, style.sheet.cssRules.length);
  },

  addSelectors(selectors, groupName = "standard", appendOnly = false)
  {
    browser.runtime.sendMessage({
      type: "content.injectSelectors",
      selectors,
      groupName,
      appendOnly
    }).then(rules =>
    {
      if (rules)
      {
        // Insert the rules inline if we have been instructed by the background
        // page to do so. This is rarely the case, except on platforms that do
        // not support user stylesheets via the browser.tabs.insertCSS API, i.e.
        // Firefox <53 and Chrome <66.
        // Once all supported platforms have implemented this API, we can remove
        // the code below. See issue #5090.
        // Related Chrome and Firefox issues:
        // https://bugs.chromium.org/p/chromium/issues/detail?id=632009
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1310026
        this.addRulesInline(rules, groupName, appendOnly);
      }
    });
  },

  hideElements(elements, filters)
  {
    for (let element of elements)
      hideElement(element, this.cssProperties);

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
    }).then(response =>
    {
      if (this.tracer)
      {
        this.tracer.disconnect();
        this.tracer = null;
      }

      if (response.inline)
        this.addRulesInline(response.rules);

      if (response.trace)
      {
        this.tracer = new ElementHidingTracer(
          response.selectors,
          response.exceptions
        );
      }

      this.cssProperties = response.cssProperties;
      this.elemHideEmulation.apply(response.emulatedPatterns);
    });
  }
};

if (document instanceof HTMLDocument)
{
  checkSitekey();

  contentFiltering = new ContentFiltering();
  contentFiltering.apply();

  startElementCollapsing();
}

window.collapseElement = collapseElement;
window.contentFiltering = contentFiltering;
window.getURLFromElement = getURLFromElement;
