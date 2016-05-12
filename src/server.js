var express = require('express'),
    _config = require('../_config.js'),
    url = require('url'),
    cookie = require('cookie-parser'),
    moment = require('moment'),
    app = express(),
    mysql = require('mysql');

const util = require('util');

//use cookie 
app.use(cookie());

//use crossdomain
app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', '*');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Pass to next layer of middleware
    next();
});

//send boot.js
app.get('/boot.js', function (req, res) {

    var referer = req.get('Referrer');

    if (!referer) {

        res.send(util.format("typeof callback != 'undefined' && callback(%s)", JSON.stringify({ code: 401, msg: 'No Referrer' })));
        return;
    }

    var host = '';

    try {

        host = url.parse(referer).host;

    } catch (err) {

        res.send(util.format("typeof callback != 'undefined' && callback(%s)", JSON.stringify({ code: 500, msg: 'Referrer Not Correct' })));
        return;
    }

    if (!host) {

        res.send(util.format("typeof callback != 'undefined' && callback(%s)", JSON.stringify({ code: 500, msg: 'Referrer Not Correct' })));
        return;
    }

    //校验 referrer 中域名或ip 是否在我们需要记录的表中
    if (_config.hosts.indexOf(host) == -1) {

        res.send(util.format("typeof callback != 'undefined' && callback(%s)", JSON.stringify({ code: 500, msg: 'Referrer Not Correct' })));
        return;
    }

    var user = {},
        uid = '',
        connection = mysql.createConnection(_config.mysql_url);

    user.userName = uid = req.query.userName || '';
    user.userType = req.query.userType || '';
    user.schoolCode = req.query.schoolCode || '';
    user.campuszoneId = req.query.campuszoneId || '';
    user.classId = req.query.classId || '';

    if (!uid) {
        uid = req.cookies.lStatistic;

        if (!uid) {

            uid = (+new Date()).toString(36);
            res.cookie('lStatistic', uid, { maxAge: 31536000000, httpOnly: true });
        }

        user.cookie = uid;
    }

    connection.connect();

    //store the visitor info
    connection.query(mysql.format("select * from pv_visitor where uid = ? ", uid), function (err, data) {
        if (err) throw err;

        if (data.length == 0) {

            connection.query('insert into pv_visitor set ?', {
                uid: uid,
                host: host,
                date_created: moment().format("YYYY-MM-DD HH:mm:ss"),
                user_agent: req.get('user-agent'),
                last_visit_time: moment().format("YYYY-MM-DD HH:mm:ss"),
                active: 0
            }, function (err, rows) {

                if (err) throw err;

                connection.destroy();
            });

        }
    });

    //send js file        
    send_boot(res, user);
});

//send today info about pv
app.get('/', function (req, res) {

    var connection = mysql.createConnection(_config.mysql_url);

    connection.connect();

    //get today info about pv    
    connection.query(mysql.format("select * from pv_day where date = ? ", moment().format('YYYY-MM-DD')), function (err, rows) {

        if (err) throw err;

        var data = { online: 0, total: 0, today: 0 };

        if (rows && rows.length > 0) {
            data.online = rows[0].online;
            data.total = rows[0].total;
            data.today = rows[0].today;
        }

        res.jsonp({
            online: data.online,
            total: data.total,
            today: data.today
        });

        connection.destroy();
    });
});

//get all online user info
app.get('/users', function (req, res) {

    mongoClient.connect(_config.mongodb_url, function (err, db) {
        if (err) throw err;

        var collection = db.collection('visitor');

        collection.find({
            host: { $in: _config.hosts },
            sockets: {
                $not: { $size: 0 }
            }
        }).toArray(function (err, online) {
            var data = [];

            online.forEach(function (e) {
                data.push(e.uid);
            }, this);

            res.send(JSON.stringify(data));
        });
    });

});

//generate the boot.js
var send_boot = function (res, user) {
    var js = "var socket=io('{{url}}'),send=function(){socket.emit('message',{url:document.location.href,referrer:document.referrer,title:document.title,userId:'{{userName}}',userType:'{{userType}}',schoolCode:'{{schoolCode}}',campuszoneId:'{{campuszoneId}}',classId:'{{classId}}',cookie:'{{cookie}}',})};socket.on('connect',function(){send();window.onhashchange=send});";

    js = js.replace('{{url}}', _config.socket_url);
    js = js.replace('{{userName}}', user.userName);
    js = js.replace('{{userType}}', user.userType);
    js = js.replace('{{schoolCode}}', user.schoolCode);
    js = js.replace('{{campuszoneId}}', user.campuszoneId);
    js = js.replace('{{classId}}', user.classId);
    js = js.replace('{{cookie}}', user.cookie || '');

    res.set('Content-Type', 'text/javascript');
    res.send(js);
};

//定时取出创建时间小于当前时间3小时的用户，将其置于离线状态
// setInterval(function () {
//     mongoClient.connect(_config.mongodb_url, function (err, db) {

//         if (err) throw err;

//         var _date = new Date(),
//             _utc_date = new Date();

//         _utc_date.setUTCFullYear(_date.getUTCFullYear());
//         _utc_date.setUTCMonth(_date.getUTCMonth());
//         _utc_date.setUTCDate(_date.getUTCDate());
//         _utc_date.setUTCHours(_date.getUTCHours());
//         _utc_date.setUTCMinutes(_date.getUTCMinutes());
//         _utc_date.setUTCSeconds(_date.getUTCSeconds());

//         _utc_date.setUTCHours(_utc_date.getUTCHours() - 3);   //当前时间减去3小时

//         db.collection('visitor').update(
//             {
//                 sockets: {
//                     $not: { $size: 0 }
//                 },
//                 'datecreated': { $lte: _utc_date }
//             },
//             {
//                 $set: {
//                     sockets: [] //将sockets 置为空数组即代表离线
//                 },
//                 $currentDate: { lastModified: true }
//             }, { multi: true }, function (err, res) {

//                 db.close();
//                 console.log(moment().format("YYYY-MM-DD HH:mm:ss") + ' 共主动离线了' + res.result.nModified + '个在线用户');
//             });
//     });
// }, 1000 * 60 * 10);

module.exports = app;