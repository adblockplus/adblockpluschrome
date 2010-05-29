// Loads and inserts i18n strings. Assumes jQuery is loaded.
function loadI18nStrings_jquery() {
    $("[id^='i18n_']").each(function(i) { $(this).html(chrome.i18n.getMessage(this.id.substring(5))); });
}

function loadI18nStrings() {
    var nodes = document.querySelectorAll("[class^='i18n_']");
    for(var i = 0; i < nodes.length; i++) {
		var arguments = JSON.parse("[" + nodes[i].innerHTML + "]");
		nodes[i].innerHTML = i18n_sprintf(nodes[i].className.substring(5), arguments);			
    }
}

function i18n_sprintf(msg, arr)
{ 
	return sprintf(chrome.i18n.getMessage(msg), arr);
}