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

/** @module icon */

"use strict";

const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const browserAction = require("./browserAction");
const info = require("info");

const ANIMATION_LOOPS = 3;
const FRAME_IN_MS = 100;

let frameOpacities = calculateFrameOpacities(9, 7);
let frameOpacitiesCritical = calculateFrameOpacities(5, 3);

let stopRequested = false;
let canUpdateIcon = true;
let notRunning = Promise.resolve();
let allowlistedState = new ext.PageMap();

let icons = [null, null];

function easeOut(progress)
{
  // This is merely an approximation to the built-in ease-out timing function
  // https://css-tricks.com/emulating-css-timing-functions-javascript/
  return 1 - Math.pow(1 - progress, 1.675);
}

function calculateFrameOpacities(keyframeFrames, transitionFrames)
{
  let opacities = [];

  // Show second half of first keyframe
  // Omit first frame because it's only shown after the first timeout
  for (let i = 0; i < keyframeFrames / 2 - 1; i++)
    opacities.push(0);
  // Transition from first to second keyframe
  for (let i = 0; i < transitionFrames; i++)
    opacities.push(easeOut((i + 1) / (transitionFrames + 1)));
  // Show second keyframe
  for (let i = 0; i < keyframeFrames; i++)
    opacities.push(1);
  // Transition from second to first keyframe
  for (let i = 0; i < transitionFrames; i++)
    opacities.push(easeOut((transitionFrames - i) / (transitionFrames + 1)));
  // Show first half of first keyframe
  // Omit last frame due to an additional timeout that resets the icon
  for (let i = 0; i < keyframeFrames / 2 - 1; i++)
    opacities.push(0);

  return opacities;
}

function loadImage(url)
{
  return fetch(url).then(response => response.blob())
                   .then(blob => createImageBitmap(blob));
}

function renderIcons()
{
  let paths = [
    "icons/abp-16.png", "icons/abp-16-allowlisted.png",
    "icons/abp-32.png", "icons/abp-32-allowlisted.png"
  ];

  for (let path of paths)
  {
    loadImage(path).then(image =>
    {
      let [, size, allowlisted] = /\/abp-(16|32)(-allowlisted)?\./.exec(path);

      let canvas = new OffscreenCanvas(size, size);
      let context = canvas.getContext("2d");
      let imageData = icons[!!allowlisted | 0] || {};

      context.globalAlpha = 1;
      context.drawImage(image, 0, 0);
      imageData[size] = context.getImageData(0, 0, size, size);

      icons[!!allowlisted | 0] = imageData;
    });
  }
}

function setIcon(page, opacity, frames)
{
  opacity = opacity || 0;
  let allowlisted = !!allowlistedState.get(page);

  if (!frames)
  {
    if (opacity > 0.5)
    {
      browserAction.setIconPath(
        page.id,
        "/icons/abp-$size-notification.png"
      );
    }
    else if (icons[allowlisted | 0])
    {
      browserAction.setIconImageData(page.id, icons[allowlisted | 0]);
    }
    else
    {
      browserAction.setIconPath(
        page.id,
        "/icons/abp-$size" + (allowlisted ? "-allowlisted" : "") + ".png"
      );
    }
  }
  else
  {
    browser.browserAction.setIcon({
      tabId: page.id,
      imageData: frames["" + opacity + allowlisted]
    });
  }
}

filterNotifier.on("page.AllowlistingStateRevalidate", (page, filter) =>
{
  allowlistedState.set(page, !!filter);
  if (canUpdateIcon)
    setIcon(page);
});

function renderFrames(opacities)
{
  return Promise.all([
    loadImage("icons/abp-16.png"),
    loadImage("icons/abp-16-allowlisted.png"),
    loadImage("icons/abp-16-notification.png"),
    loadImage("icons/abp-20.png"),
    loadImage("icons/abp-20-allowlisted.png"),
    loadImage("icons/abp-20-notification.png"),
    loadImage("icons/abp-32.png"),
    loadImage("icons/abp-32-allowlisted.png"),
    loadImage("icons/abp-32-notification.png"),
    loadImage("icons/abp-40.png"),
    loadImage("icons/abp-40-allowlisted.png"),
    loadImage("icons/abp-40-notification.png")
  ]).then(images =>
  {
    opacities = new Set(opacities);
    let imageMap = {
      16: {base: [images[0], images[1]], overlay: images[2]},
      20: {base: [images[3], images[4]], overlay: images[5]},
      32: {base: [images[6], images[7]], overlay: images[8]},
      40: {base: [images[9], images[10]], overlay: images[11]}
    };

    let frames = {};
    let canvas = new OffscreenCanvas(0, 0);
    let context = canvas.getContext("2d");

    for (let allowlisted of [false, true])
    {
      for (let opacity of opacities)
      {
        let imageData = {};
        let sizes = [16, 20, 32, 40];
        for (let size of sizes)
        {
          canvas.width = size;
          canvas.height = size;
          context.globalAlpha = 1;
          context.drawImage(imageMap[size]["base"][allowlisted | 0], 0, 0);
          context.globalAlpha = opacity;
          context.drawImage(imageMap[size]["overlay"], 0, 0);
          imageData[size] = context.getImageData(0, 0, size, size);
        }
        frames["" + opacity + allowlisted] = imageData;
      }
    }

    return frames;
  });
}

function animateIcon(opacities, frames)
{
  return browser.tabs.query({active: true}).then(tabs =>
  {
    let pages = tabs.map(tab => new ext.Page(tab));

    let animationLoop = 0;
    let animationStep = 0;
    let numberOfFrames = opacities.length;
    let opacity = 0;

    let onActivated = page =>
    {
      pages.push(page);
      setIcon(page, opacity, frames);
      browserAction.toggleBadge(page.id, true);
    };
    ext.pages.onActivated.addListener(onActivated);

    canUpdateIcon = false;
    for (let page of pages)
      browserAction.toggleBadge(page.id, true);
    return new Promise((resolve, reject) =>
    {
      let interval = setInterval(() =>
      {
        let oldOpacity = opacity;
        opacity = opacities[animationStep++];

        if (opacity != oldOpacity)
        {
          for (let page of pages)
          {
            if (allowlistedState.has(page))
              setIcon(page, opacity, frames);
          }
        }

        if (animationStep > numberOfFrames)
        {
          if (++animationLoop > ANIMATION_LOOPS - 1 || stopRequested)
          {
            clearInterval(interval);
            ext.pages.onActivated.removeListener(onActivated);
            for (let page of pages)
              browserAction.toggleBadge(page.id, false);
            canUpdateIcon = true;
            resolve();
          }
          else
          {
            animationStep = 0;
          }
        }
      }, FRAME_IN_MS);
    });
  });
}

let stopIconAnimation =
/**
 * Stops to animate the browser action icon
 * after the current interval has been finished.
 *
 * @return {Promise} A promise that is fullfilled when
 *                   the icon animation has been stopped.
 */
exports.stopIconAnimation = () =>
{
  stopRequested = true;
  return notRunning.then(() =>
  {
    stopRequested = false;
  });
};

/**
 * Starts to animate the browser action icon to indicate a pending notifcation.
 * If the icon is already animated, it replaces the previous
 * animation as soon as the current interval has been finished.
 *
 * @param {string} type  The notification type (i.e: "information" or
 *                       "critical".)
 */
exports.startIconAnimation = type =>
{
  let opacities = frameOpacities;
  if (type == "critical")
    opacities = frameOpacitiesCritical;

  notRunning = Promise.all([renderFrames(opacities), stopIconAnimation()])
    .then(results =>
    {
      if (stopRequested)
        return;

      let frames = results[0];
      return animateIcon(opacities, frames);
    });
};


// Pre-render icons on Chromium (#7253).
if (info.platform == "chromium")
  renderIcons();
