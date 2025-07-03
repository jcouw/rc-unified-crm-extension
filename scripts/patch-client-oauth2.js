const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../node_modules/client-oauth2/src/client-oauth2.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the existing getToken function by matching its start and a closing brace
const newGetToken = `
CodeFlow.prototype.getToken = function (uri, opts) {
  var self = this
  var options = Object.assign({}, this.client.options, opts)

  expects(options, 'clientId', 'accessTokenUri')

  var url = typeof uri === 'object' ? uri : new URL(uri, DEFAULT_URL_BASE)

  if (
    typeof options.redirectUri === 'string' &&
    typeof url.pathname === 'string' &&
    url.pathname !== (new URL(options.redirectUri, DEFAULT_URL_BASE)).pathname
  ) {
    return Promise.reject(
      new TypeError('Redirected path should match configured path, but got: ' + url.pathname)
    )
  }

  if (!url.search || !url.search.substr(1)) {
    return Promise.reject(new TypeError('Unable to process uri: ' + uri))
  }

  var data = typeof url.search === 'string'
    ? Querystring.parse(url.search.substr(1))
    : (url.search || {})
  var err = getAuthError(data)

  if (err) {
    return Promise.reject(err)
  }

  if (options.state != null && data.state !== options.state) {
    return Promise.reject(new TypeError('Invalid state: ' + data.state))
  }

  // Check whether the response code is set.
  if (!data.code) {
    return Promise.reject(new TypeError('Missing code, unable to request token'))
  }

  var headers = Object.assign({}, DEFAULT_HEADERS)
  var body = { code: data.code, grant_type: 'authorization_code', redirect_uri: options.redirectUri }

  // BEGIN ADDED PATCH SPECIFIC JS
  if(options.useBodyAuth) {        
    body.client_id = options.clientId
    body.client_secret = options.clientSecret
  } // END PATCH SPECIFIC JS
    else if (options.clientSecret) {
    headers.Authorization = auth(options.clientId, options.clientSecret)
  } else {
    body.client_id = options.clientId
  }

  return this.client._request(requestOptions({
    url: options.accessTokenUri,
    method: 'POST',
    headers: headers,
    body: body
  }, options))
    .then(function (data) {
      return self.client.createToken(data)
    })
}`;

const getTokenRegex = /CodeFlow\.prototype\.getToken\s*=\s*function\s*\([\s\S]+?\n\}/;

// Replace the whole function
content = content.replace(getTokenRegex, newGetToken.trim());

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched client-oauth2 getToken function');
