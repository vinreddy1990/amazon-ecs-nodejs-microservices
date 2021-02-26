var request = require('request');
const {
    getParameterValue,
    getSecretMangerValue
} = require('getSSMParams');
const ElasticSearch = require('elastic-search');

exports.handler = async function (event, context, callback) {
    const promise = new Promise(async function (resolve, reject) {
        var ElasticSearchAPIPreFix = await getParameterValue(process.env.UIAPP_PRIVATE_ES_URL, process.env.AWS_REGION);
        var tableName = await getParameterValue(process.env.UIAPP_PRIVATE_ES_EXCHANGE_PRICE_COLLECTION, process.env.AWS_REGION);
        var ElasticSearchAPIAuthorization = "";
        try {
            ElasticSearchAPIAuthorization = await getSecretMangerValue(process.env.UIAPP_PRIVATE_ES_AUTHORIZATION_TOKEN, process.env.AWS_REGION);
        } catch(e) {
            
        } 
        let ES = new ElasticSearch(ElasticSearchAPIPreFix, ElasticSearchAPIAuthorization);
       
        var getFieldValue = function (obj, key) {
            return key.split(".").reduce(function (o, x) {
                return (typeof o == "undefined" || o === null) ? o : o[x];
            }, obj);
        }

        let query = {
            "query": {
                "term": {
                    "currencyPair.keyword": event.symbol
                }
            }
        }

        let esPromise = ES.executeAPI("POST", tableName, query, '/_search', '?pretty&filter_path=hits.hits');
        esPromise.then((body) => {
            console.log("body::", body);
            if (body) {
                body = JSON.parse(body);
                var hits = getFieldValue(body, 'hits.hits');
                if (hits && hits.length > 0) {
                    resolve(hits);
                }
            }
        }).catch((error) => {
            console.log("Error:", error);
            reject(error)            
        })
    });
    return promise;
}
