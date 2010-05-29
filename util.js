/** 
 * Substitute placeholders with string values,
 * as seen in <http://www.webmasterworld.com/javascript/3484761.htm>.
 * @param {string} str The string containing the placeholders 
 * @param {Array} arr The array of values to substitute 
 */ 
function sprintf(str, arr)
{ 
	var i, pattern, re, n = arr.length; 
	for (i = 0; i < n; i++) { 
		pattern = "\\{" + i + "\\}"; 
		re = new RegExp(pattern, "g"); 
		str = str.replace(re, arr[i]); 
	} 
	return str; 
} 
