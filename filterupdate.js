// This file (c) T. Joseph <ttjoseph@gmail.com>
// Everyone can use, modify and distribute this file without restriction.

// List of suggested filter lists
var filterFiles = {
    "easylist": "http://easylist.adblockplus.org/easylist.txt", // "easylist.txt",
	"extras": "http://adthwart.appspot.com/filters?n=extras",
    "germany": "http://easylist.adblockplus.org/easylistgermany.txt", // "easylistgermany.txt",
    "russia": "http://ruadlist.googlecode.com/svn/trunk/adblock.txt",
    "china": "http://adblock-chinalist.googlecode.com/svn/trunk/adblock.txt", // "adblock.txt",
	"france": "http://adblockplus.mozdev.org/easylist/liste_fr+easylist.txt", // "liste_fr.txt",
	"korea": "http://brianyi.com/corset.txt", // "corset.txt",
	"romania": "http://www.picpoc.ro/menetzrolist.txt", // "menetzrolist.txt",
	"italy": "http://mozilla.gfsolone.com/filtri.txt", // "filtri.txt",
	"vietnam": "http://adblockplus-vietnam.googlecode.com/svn/trunk/abpvn.txt",
	"poland": "http://www.bsi.info.pl/filtrABP.txt",
	// "fanboy": "http://www.fanboy.co.nz/adblock/fanboy-adblocklist-current-expanded.txt",
	"fanboy_es": "http://www.fanboy.co.nz/adblock/fanboy-adblocklist-esp.txt"
};

// Adds entries in filterFiles for any user filters. Other functions will
// reference filterFiles directly, even though global variables are evil.
function loadUserFilterURLs() {
    // Get rid of all user_* entries; we'll restore them from localStorage
    for(key in filterFiles) {
        if(key.match(/^user_/))
            delete filterFiles[key];
    }
    // Read from localStorage
    if(typeof localStorage["userFilterURLs"] != "string")
        return; // Nothing there
    var urls = JSON.parse(localStorage["userFilterURLs"]);
    
    for(key in urls)
        filterFiles[key] = urls[key];
}

// TODO: In case of error fetching a filter list, check to see whether
// we already have a copy cached, and leave it there.
// At present the cached copy can be deleted.
function FilterListFetcher(nameOrUrl, callback) {
    this.name = nameOrUrl;
    // Accept name as URL if it starts with http
    this.url = nameOrUrl.match(/^http/) ? nameOrUrl : filterFiles[nameOrUrl];
    this.callback = callback;
    this.xhr = new XMLHttpRequest();
    this.error = false;
    var fetcher = this;
    this.xhr.onreadystatechange = function() {
        if(this.readyState != 4) return;
        if(this.status == 200) {
            // Check if it's actually a filter set
            if(this.responseText.match(/\[Adblock/)) {
                localStorage[fetcher.url] = JSON.stringify({lastUpdated: (new Date()).getTime(), text: this.responseText});
                fetcher.callback(fetcher);
                return;
            } else {
                fetcher.error = "Not a filter list";
                fetcher.callback(fetcher);
                return;
            }
        } else if(this.status == 404) {
            fetcher.error = "Not found on server";
            localStorage[fetcher.url] = JSON.stringify({lastUpdated: (new Date()).getTime(), error: fetcher.error});
            fetcher.callback(fetcher);
            return;
        }
        // TODO: Doesn't actually do anything in case of other errors
    }
    try {
        this.xhr.open("GET", this.url, true);
        this.xhr.send(null);
    } catch(e) {
        fetcher.error = "Error. Hm.";
        fetcher.callback(fetcher);        
    }
}
