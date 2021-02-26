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
        } catch (e) {

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
        let esPromise = ES.executeAPI("POST", currencyTableName, findQuery, '/_search', '?scroll=1m&pretty&filter_path=hits.hits');
        esPromise.then((body) => {
            if (body) {
                body = JSON.parse(body);
                var hits = getFieldValue(body, 'hits.hits');

                if (hits && hits.length > 0) {

                    let promiseList = hits.map(function (currencyData) {
                        return new Promise((resolve, reject) => {
                            let currencyPairSymbol = getFieldValue(currencyData, "_source.symbol");
                            let duration = '1d'
                            let conditionString = '?symbol=' + currencyPairSymbol + '&period=' + duration
                            var forexlink = FOREX_API_URL_PREFIX + conditionString + '&' + FOREX_API_URL_POSTFIX;

                            request({
                                uri: forexlink,
                                method: 'GET',
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            }, function (error, response, body) {
                                body = JSON.parse(body);

                                if (body) {
                                    if (body.status) {
                                        var technicalIndicatorData = body.response
                                        var exchangeInfo = body.info
                                        if (technicalIndicatorData && exchangeInfo) {
                                            // update in the elastic search
                                            let docData = {
                                                volatilityIndex: parseFloat(getFieldValue(technicalIndicatorData, 'indicators.ATR14.v'))
                                            }

                                            let updateBody = {
                                                "doc": docData,
                                                "doc_as_upsert": true
                                            }
                                            let esPromise = ES.executeAPI("POST", tableName, updateBody, "/_update/" + exchangeInfo.id);
                                            esPromise.then((body) => {
                                                if (body) {
                                                    body = JSON.parse(body);
                                                    resolve({
                                                        message: "Success"
                                                    })
                                                } else {
                                                    reject({
                                                        message: "Failed to update volatility Index!"
                                                    })
                                                }
                                            }).catch((error) => {
                                                console.log("Error:", error);
                                                reject({
                                                    message: "Failed to update volatility Index!"
                                                })
                                            })
                                        }
                                    } else {
                                        reject({
                                            message: "Forex Api called failed!"
                                        })
                                    }

                                } else {
                                    reject({
                                        message: "Forex Api called failed!"
                                    })
                                }
                            })
                        })


                    });

                    Promise.all(promiseList).then(result => {
                        resolve({
                            message: "success"
                        })
                    }).catch(error => {
                        resolve({
                            message: "Failed to update volatility Index for some exchanges"
                        });
                    })

                } else {
                    resolve({
                        message: "NO Currency Found"
                    });
                }
            } else {
                resolve({
                    message: "Body not available"
                });
            }
        }).catch((error) => {
            console.log("Error:", error);
            resolve(error);
        })

    });
    return promise;
}