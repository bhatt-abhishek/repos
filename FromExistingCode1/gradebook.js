var request = require('request');
const aws = require('aws-sdk');
const sts = new aws.STS({ apiVersion: '2011-06-15' });
const awss = require('aws4');
const https = require('https');

const logLevels = { error: 4, warn: 3, info: 2, verbose: 1, debug: 0 };

// get the current log level from the current environment if set, else set to INFO
const currLogLevel = process.env.LOG_LEVEL != null ? process.env.LOG_LEVEL : 'debug';

// print the log statement, only if the requested log level is greater than the current log level
function log(logLevel, statement) {
    if (logLevels[logLevel] >= logLevels[currLogLevel]) {
        console.log(statement);
    }
}

aws.config.update({
    region: "eu-west-1"
});
const docClient = new aws.DynamoDB({ apiVersion: '2012-08-10' });

exports.handler = (event, context, callback) => {
    var userId = event.user_id;
    //var userId = 'f990ec30-19f0-11e8-80cc-efc14beec333';
    var res = {};


    function getXApiResponse() {
        const requestOptions = {
            uri: 'https://lrs-uat.oup.com/data/xAPI/statements?statementId=716f694c-473a-4e85-8572-8085a1023d86&format=exact&attachments=false',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ZmFjNzc2ZDYyYmJjNGUwZDg5NmEwNmNhNmY2ZmQ5ZGNmZWQ0YjA5MTpiM2JhMGIzMzA4YjRjNDQ1ZDg1Y2NlYmE1N2VjMTUzMTMxMTY4MmY3',
                'X-Experience-API-Version': '1.0.3'
            },

        };

        request(requestOptions, function(err, response, body) {
            if (err) { console.log(err); return; }
            console.log("Get response: " + response.statusCode);
            //console.log(JSON.parse(body));
            res["xapi"] = JSON.parse(body);
            //console.log('final result' + res);
            console.log(JSON.stringify(res));
            //getAggregateResponse();
            getDynamoDbResponse();
        });
    }

    function getAggregateResponse() {
        var queryArray = [];
        var userIdList = ['24342ac0-2e9a-11e8-89c3-0d287ba0bb72', 'f990ec30-19f0-11e8-80cc-efc14beec333'];
        queryArray.push({
            "statement.actor.account.name": {
                "$in": userIdList
            }
        });

        var propertiesObject = { pipeline: queryArray };
        const aggregateRequestOptions = {
            uri: 'https://lrs-uat.oup.com/API/statements/aggregate',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ZmFjNzc2ZDYyYmJjNGUwZDg5NmEwNmNhNmY2ZmQ5ZGNmZWQ0YjA5MTpiM2JhMGIzMzA4YjRjNDQ1ZDg1Y2NlYmE1N2VjMTUzMTMxMTY4MmY3',
                'X-Experience-API-Version': '1.0.3'
            },
            qs: propertiesObject

        };
        request(aggregateRequestOptions, function(err, response, body) {
            if (err) { console.log(err); return; }

            console.log("Get response: " + response.statusCode);
            //console.log(JSON.parse(body));
            for (var i = 0; i < JSON.parse(body).length; i++) {
                res["aggregate"] = JSON.parse(body);

            }

            console.log(JSON.stringify(res));
            getXApiResponse();
        });
    }

    function getDynamoDbResponse() {
        var table = 'GradeBookSample';
        var extId = ['OUPDIS03'];
        var keyJson = [];
        keyJson.push({ EXTERNAL_ID: { S: "OUPDIS03" } });
        var requestitems = {};
        requestitems[table] = {
            Keys: keyJson,
            ProjectionExpression: 'USER_NAME, BOOK_NAME, CEFR_LEVEL,WORDS_READ,LAST_READ,READING_TIME,READ_PERCENT'
        };

        var params = { RequestItems: requestitems };
        docClient.batchGetItem(params, function(err, data) {
            if (err) {
                console.log(err);
                return;
            }
            else {
                console.log(data.Responses[table]);
                res["dyanmo data"] = JSON.parse(data.Responses[table]);
                console.log('final result' + JSON.stringify(res));
            }
        });
        callback(null, res);
        console.log(res);
    }
    getClassDetails();

    function getClassDetails() {
        const assumeRoleParams = {
            DurationSeconds: 900,
            RoleArn: 'arn:aws:iam::488628712875:role/GradeBookSampleRole',
            RoleSessionName: 'GradeBookSample'
        };
        console.log('before assume');
        sts.assumeRole(assumeRoleParams, function(err, assumedRole) {
            if (err) callback(`Cannot assume role in CES account, check to see if role still exists: ${err}`);
            else {
                var reqBody = '{ "userId":' + userId + ' }';
                const requestOptions = {
                    hostname: '9fcx1dq63b.execute-api.eu-west-1.amazonaws.com',
                    path: '/CloudFormation/acesWebService/rest/V1-0/services/getUserAccount',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: reqBody,
                    region: 'eu-west-1',
                    service: 'execute-api'
                };
                /*console.log("check :"+assumedRole.Credentials.AccessKeyId);
                console.log("check SecretAccessKey:"+assumedRole.Credentials.SecretAccessKey);*/

                var signature = awss.sign(requestOptions, {
                    accessKeyId: assumedRole.Credentials.AccessKeyId,
                    secretAccessKey: assumedRole.Credentials.SecretAccessKey,
                    sessionToken: assumedRole.Credentials.SessionToken
                });

                console.log('sign' + JSON.stringify(signature));



                const request = https.request(signature, function(response) {
                    console.log('entered request');
                    //console.log(response.data);
                    var responseString = '';

                    response.pipe(process.stdout);
                    response.on('data', function(data) {
                        responseString += data;
                    });
                    console.log(response.body);
                    response.on('end', function() {
                        console.log('request end');
                        callback(null, responseString);
                        console.log(responseString);
                    });
                });
                //request.write(item);
                /*console.log('here out of request');
                console.log(this.httpResponse);
            console.log(this.request.httpRequest);*/

                request.on('error', function(error) {
                    console.log('request error : ');
                    callback(error);
                });

                request.end();
            }
        });
    }

}
