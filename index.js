const path = require('path')
const sendToSlacks = require('./lib/slack').sendToSlacks
const getParametersByPath = require('./lib/parameter-store').getParametersByPath
const services = require('./services')

module.exports.webhook = async (event, context, callback) => {
  if (!event.body || !event.body.length > 0) {
    return callback(null, {statusCode: 400, body: "invalid webhook body" })
  }

  const serviceName = event.pathParameters.serviceName
  if (!services[serviceName]) {
    return callback(null, {statusCode: 405, body: "unsupported webhook provider"})
  }
  
  // Default parameters
  let parameters = {
    'webhook-endpoints': 'http://localhost/',
    'auth-type': 'none',
    'auth-api-key': null
  }

  // Load the real ones from SSM.
  try {
    parameters = Object.assign(parameters, await getParametersByPath(process.env.SSM_PREFIX))
  } catch(err) {
    console.error(err)
    return callback(null, {statusCode: 500, body: "an error occurred whilst fetching configuration"})
  }

  // Simple auth shim for protecting sensitive Slack orgs.
  if (parameters['auth-type'] !== 'none') {
    const apiKey = event.queryStringParameters ? event.queryStringParameters.apiKey : null
    if (apiKey != parameters['auth-api-key']) {
      return callback(null, {statusCode: 500, body: "an error occurred whilst fetching configuration"})
    }
  }

  // Process the webhook based on config.
  try {
    // Allow config override based on query parameter so one instance can serve multiple destinations.
    const prefix = event.queryStringParameters ? event.queryStringParameters.prefix : null
    const getEndpoints = prefix => parameters[`${prefix}/webhook-endpoints`] || parameters['webhook-endpoints']

    const body = JSON.parse(event.body)
    await sendToSlacks(
      getEndpoints(prefix),
      services[serviceName].process(body)
    )
    return callback(null, { statusCode: 200, body: 'ok' } )
  } catch(err) {
    console.error(err)
    return callback(null, {statusCode: 500, body: "an error occurred whilst processing the webhook"})
  }
}
