'use strict'
// environment variables specified by the user
process.env['FILESTORE_HOST'] = '172.17.0.1'; // clsi.config.env
// the user should specify the express listener
const expressListener = require('./app.js') // clsi.express.file

const owServerlessExpress = require('./owServerlessExpress.js')

exports.main = function(params){ // clsi.handler.function
  return owServerlessExpress(expressListener, params)
}