// Loads and inserts i18n strings into matching elements. Any inner HTML already in the
// element is parsed as JSON and used as parameters to substitute into placeholders in the
// i18n message.
function loadI18nStrings() {
    var nodes = document.querySelectorAll("[class^='i18n_']");
    for(var i = 0; i < nodes.length; i++) {
		var arguments = JSON.parse("[" + nodes[i].innerHTML + "]");
		if(arguments.length > 0)
		    nodes[i].innerHTML = chrome.i18n.getMessage(nodes[i].className.substring(5), arguments);
		else
		    nodes[i].innerHTML = chrome.i18n.getMessage(nodes[i].className.substring(5));
    }
}
