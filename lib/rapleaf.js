var http = require('http');
var querystring = require('querystring');
var sys = require('sys');

var Sequencer = require('./support/sequencer/lib/sequencer').Sequencer;
var xml = require('./support/node-xml/lib/node-xml');

var RapLeaf = function(apikey)
{
    this._apikey = apikey;
};

RapLeaf.API_URL = 'api.rapleaf.com';
RapLeaf.API_VERSION = 'v3';

RapLeaf.prototype = {
    queryPersonByEmail: function(email, callback)
    {
        var seq = new Sequencer(this,
            function(seq) {
                var action = ['person','email', encodeURIComponent(seq.params.email)];
                this.request(action.join('/'), seq.next);
            },
            
            function(seq, error, data) {
                seq.params.cb(error, data);
            }
        );
        seq.params = {
            email: email,
            cb: callback
        };
        seq.run();
    },
    
    request: function(action, callback)
    {
        var requestSeq = new Sequencer(this,
            function(seq)
            {
                var api = http.createClient(80, RapLeaf.API_URL);
                var req = api.request('GET', '/' + RapLeaf.API_VERSION + '/' + action,
                    {
                        'Host': RapLeaf.API_URL,
                        'Authorization': this._apikey
                    }
                );
            
                req.on('response', seq.next);
                
                req.end();
            },
            
            function(seq, response)
            {
                seq.params.response = response;
                response.on('data', seq.nextFn());
                response.on('end', seq.next);
            },
            
            function(seq, data)
            {
                seq.params.data += data;
            },
            
            function(seq)
            {
                if (seq.params.response.statusCode == 200)
                {
                    successSeq.params = seq.params;
                    successSeq.run();
                }
                else if (seq.params.response.statusCode == 202)
                {
//                    sys.puts('rapleaf 202');
                    failureSeq.params = seq.params;
                    failureSeq.params.error = {error: 202};
                    failureSeq.run();
                }
                else if (seq.params.response.statusCode == 403)
                {
                    failureSeq.params = seq.params;
                    failureSeq.params.error = {error: 403};
                    failureSeq.run();
                }
                else
                {
                    failureSeq.params = seq.params;
                    failureSeq.params.error = {error: 0};
                    failureSeq.run();
                }
            }

        );
        
        var successSeq = new Sequencer(this,
            function(seq)
            {
                var parser = new xml.SaxParser(seq.next);

                parser.parseString(seq.params.data);
            },
            
            function(seq, parserCb)
            {
                parserCb.onEndDocument(seq.next);
                
                var rapLeafData = seq.params.rapLeafData = {};
                
                parserCb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
                    if (elem == 'membership')
                    {
                        sys.puts('membership object');
                        sys.puts(sys.inspect(attrs));

                        var membershipObj = {},
                            exists = false;

                        for (var iter = 0, attr; attr = attrs[iter]; iter++)
                        {
                            if (attr[0] == 'site')
                            {
                                switch(attr[1])
                                {
                                    case 'twitter.com':
                                        membershipObj.site = attr[1];
                                        break;
                                }
                            }
                            else if (attr[0] == 'exists')
                            {
                                if (attr[1] == 'true')
                                {
                                    exists = true;
                                }
                            }
                            else if (attr[0] == 'profile_url')
                            {
                                membershipObj.url = attr[1];
                            }
                        }
                        
                        if (exists && membershipObj.site)
                        {
                            rapLeafData[membershipObj.site] = membershipObj;
                        }
                    }
                });
            },
            
            function(seq)
            {
                seq.params.cb(null, seq.params.rapLeafData);
            }
        );
        
        var failureSeq = new Sequencer(this,
            function(seq)
            {
                seq.params.cb(seq.params.error, null);
            }
        );
        
        requestSeq.params = {
            data: '',
            cb: callback
        };
        requestSeq.run();
    }
};

exports.RapLeaf = RapLeaf;