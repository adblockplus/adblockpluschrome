/** 
 * Substitute placeholders with string values 
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
/*
sprintf = function() { 
	var sz = arguments.length; 
	var str = arguments[0];   
	for (var i = 1; i < sz; i++) { 
		var pattern = "\\{" + (i-1) + "\\}"; 
		var re = new RegExp(pattern, "g"); 
		str = str.replace(re, arguments[i]); 
	} 
	return str;
}
*/