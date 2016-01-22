/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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

const frameOpacities =  [0, 0.2, 0.4, 0.6, 0.8,
                         1, 1, 1, 1, 1,
                         0.8, 0.6, 0.4, 0.2, 0];
const numberOfFrames = frameOpacities.length;

let stopAnimation = null;
let animationPlaying = false;
let whitelistedState = new ext.PageMap();

function loadImage(path, size)
{
  if (!path)
    return Promise.resolve(null);
  if (size)
    path = path.replace("$size", size.toString());

  return new Promise(function(resolve, reject) {
    let image = new Image();
    image.src = path;
    image.addEventListener("load", function() { resolve(image); });
  });
}

function getImageData(size, baseIcon, overlayIcon, opacity,
                      animationStep, frameCache)
{
  let cacheIndex = baseIcon + size + opacity;

  if (frameCache && frameCache[cacheIndex])
    return frameCache[cacheIndex];

  let canvas = document.createElement("canvas");
  let context = canvas.getContext("2d");

  let imageData = Promise.all(
    [loadImage(baseIcon, size), loadImage(overlayIcon, size)]
  ).then(function(icons)
  {
    baseIcon = icons[0];
    overlayIcon = icons[1];

    canvas.width = baseIcon.width;
    canvas.height = baseIcon.height;

    context.globalAlpha = 1;
    context.drawImage(baseIcon, 0, 0);

    if (overlayIcon && opacity)
    {
      context.globalAlpha = opacity;
      context.drawImage(overlayIcon, 0, 0);
    }

    return context.getImageData(0, 0, canvas.width, canvas.height);
  });
  if (frameCache)
    frameCache[cacheIndex] = imageData;
  return imageData;
}

function setIcon(page, animationType, animationStep, frameCache)
{
  let safari = require("info").platform == "safari";
  let opacity = animationType ? frameOpacities[animationStep] : 0;
  let greyed = whitelistedState.get(page) && !safari;
  let blending = (animationType && opacity > 0 && opacity < 1);

  let filename = "icons/abp-$size";
  let baseIcon = filename + (greyed ? "-whitelisted" : "") + ".png";
  let overlayIcon = animationType && (filename + "-notification-" +
                                      animationType + ".png");


  // If the icon doesn't need any modifications, or the platform doesn't support
  // data URLs, we can just use the image's filename with the $size placeholder.
  if (!blending || safari)
    if (overlayIcon && opacity > 0.5)
      return page.browserAction.setIcon(overlayIcon);
    else
      return page.browserAction.setIcon(baseIcon);

  // Otherwise we must process the images using a canvas and return a data URL
  // of the result for each size that's required. (19px and 38px are required by
  // Chrome/Opera.)
  let imageData = [19, 38].map(function(size)
  {
    return getImageData(size, baseIcon, overlayIcon, opacity,
                        animationStep, frameCache);
  });
  Promise.all(imageData).then(function(imageData)
  {
    chrome.browserAction.setIcon({tabId: page._id,
                                  imageData: {19: imageData[0],
                                              38: imageData[1]}});
  });
}

function runAnimation(animationType)
{
  let frameCache = {};
  let frameInterval;

  function playAnimation()
  {
    animationPlaying = true;
    ext.pages.query({active: true}, function(pages)
    {
      let animationStep = 0;
      frameInterval = setInterval(function()
      {
        pages.forEach(function (page) {
          setIcon(page, animationType, animationStep++, frameCache);
        });
        if (animationStep >= numberOfFrames)
        {
          animationStep = 0;
          clearInterval(frameInterval);
          animationPlaying = false;
        }
      }, 100);
    });
  }

  playAnimation();
  let animationInterval = setInterval(playAnimation, 10000);
  return function()
  {
    clearInterval(frameInterval);
    clearInterval(animationInterval);
    animationPlaying = false;
  };
}

/**
 * Set the browser action icon for the given page, indicating whether
 * adblocking is active there, and considering the icon animation.
 *
 * @param {Page}    page         The page to set the browser action icon for
 * @param {Boolean} whitelisted  Whether the page has been whitelisted
 */
exports.updateIcon = function(page, whitelisted)
{
  whitelistedState.set(page, whitelisted);
  if (!animationPlaying)
    setIcon(page);
};

/**
 * Starts to animate the browser action icon to indicate a pending notifcation.
 *
 * @param {string} type  The notification type (i.e: "information" or "critical")
 */
exports.startIconAnimation = function(type)
{
  stopAnimation && stopAnimation();
  stopAnimation = runAnimation(type);
};

/**
 * Stops to animate the browser action icon.
 */
exports.stopIconAnimation = function()
{
  stopAnimation && stopAnimation();
};
