// Warning: This is a horrible, horrible hack that I intend to remove ASAP.
// We want to use the shiny new beforeload DOM event to block page resource loads.
// Sadly, Chrome's message passing, as far as I know, is not synchronous, so the
// response from background.html does not occur in time to prevent the event from happening. 
// So we load this stupid variable as a content script so the beforeload handler
// use it.
// Presumably this is represented by the VM as a hashtable or something.
var TEMP_adservers = {
"247realmedia.com": true,
"ad.doubleclick.net": true,
"atdmt.com": true,
"cdn.undertone.com": true,
"clickintext.com": true,
"da.feedsportal.com": true,
"g.doubleclick.net": true,
"2mdn.net": true,
"adbrite.com": true,
"adfusion.com": true,
"adsonar.com": true,
"atwola.com": true,
"falkag.net": true,
"fastclick.net": true,
"intellitxt.com": true,
"kontera.com": true,
"linkworth.com": true,
"mediaclick.com": true,
"msads.net": true,
"pagead2.googlesyndication.com": true,
"pheedo.com": true,
"projectwonderful.com": true,
"googleadservices.com": true,
"pubmatic.com": true,
"vibrantmedia.com": true,
"yieldmanager.com": true,
"yieldmanager.net": true,
"zedo.com": true
};
