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
    var currencyTableName = await getParameterValue(process.env.UIAPP_PRIVATE_ES_CURRENCIES_COLLECTION, process.env.AWS_REGION);
    var FOREX_API_URL_PREFIX = await getParameterValue(process.env.FOREX_API_URL_PREFIX, process.env.AWS_REGION);
    var FOREX_API_URL_POSTFIX = await getSecretMangerValue(process.env.FOREX_API_URL_ACCESS_KEY, process.env.AWS_REGION);
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

    let findQuery = {
        "size": 100,
        "query": {
            "match_all": {}
        }
    }

    let esPromise = ES.executeAPI("POST", currencyTableName, findQuery, "/_search", "?scroll=1m&pretty&filter_path=hits.hits");
    esPromise.then((body) => {
        if(body){
            body = JSON.parse(body);
            var hits = getFieldValue(body, 'hits.hits');

            if(hits && hits.length > 0) {
                var currencyList = hits.map(function(currencyData){
                    return getFieldValue(currencyData,"_source.symbol");
                });
                var currencyString = currencyList.join()
                
                var forexlink = FOREX_API_URL_PREFIX + currencyString + '&' + FOREX_API_URL_POSTFIX;
                
                request({
                    uri: forexlink,
                    method: 'GET',
                    headers: {"Content-Type": "application/json"}
                },function (error, response, body) {
                    body = JSON.parse(body);
                    
                    if (body) {
                        if(body.status){
                            var exchangePriceList = body.response 
                            if(exchangePriceList && exchangePriceList.length > 0) {
                                // insert in the elastic search
                                var promiseList = [];
                                exchangePriceList.forEach(function(exchangePrice){
                                    promiseList.push(new Promise(function (resolve, reject){
                                        let exchangePriceData = {
                                            id: exchangePrice.id,
                                            currencyPair: exchangePrice.symbol,
                                            price: parseFloat(exchangePrice.price),
                                            change: parseFloat(exchangePrice.change),
                                            changePct: parseFloat(exchangePrice.chg_per),
                                            timestamp: exchangePrice.last_changed
                                        }
                                        let updateBody = {
                                            "doc": exchangePriceData,
                                            "doc_as_upsert":true
                                        }
                                        let esPromise = ES.executeAPI("POST", tableName, updateBody, "/_update/" + exchangePriceData.id );
                                        esPromise.then((body) => {
                                            if(body){
                                                    body = JSON.parse(body);
                                                    resolve({meesage:"updated"})
                                                } else {
                                                    reject({meesage:"Error updating exchange rates"})
                                                }
                                        }).catch((error) => {
                                            reject(error);
                                        })
                                    }));
                                });
            
                                Promise.all(promiseList).then(function(values) {
                                    resolve({message:"Updated the exchange price"})
                                }).catch(function(error){
                                    reject(error)
                                }); 
                            }
                        } else {
                            reject(error)
                        } 
                        
                    } else {
                        reject(error)
                    }
                })

            } else {
                reject({message: "NO Currency Found"})
            }
        } else {
            reject({message: "Body not available"})
        }
    }).catch((error) => {
        reject(error);
    })

    return promise;
}
