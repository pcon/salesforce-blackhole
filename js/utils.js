/*jslint browser: true, regexp: true */
/*global process, require, module, console */

var Q = require('q');
var lo = require('lodash');
var mysql = require('mysql');

var isEmpty = function (data) {
    'use strict';

    return (data === undefined || data === null || lo.isEmpty(data.trim()));
};

var parseDbURL = function (dbURL) {
    'use strict';

    var url = dbURL.replace(/^mysql:\/\//, ''),
        username_password = url.split('@')[0],
        username = username_password.split(':')[0],
        password = username_password.split(':')[1],
        host_port_db = url.split('@')[1],
        host_port = host_port_db.split('/')[0],
        host = host_port.split(':')[0],
        port = host_port.split(':')[1],
        db = url.split('/')[1];

    return {
        host: host,
        port: port,
        user: username,
        password: password,
        database: db
    };
};

var MYSQL_TABLE_MAP = {
    'visits': [
        'create table visits (id bigint not null auto_increment primary key, orgid varchar(18) not null, visit_time datetime not null)'
    ]
};

var MYSQL_CONNECTION_INFO = function () {
    'use strict';

    if (process.env.OPENSHIFT_MYSQL_DB_HOST !== undefined) {
        return {
            host: process.env.OPENSHIFT_MYSQL_DB_HOST,
            port: process.env.OPENSHIFT_MYSQL_DB_PORT,
            user: process.env.OPENSHIFT_MYSQL_DB_USERNAME,
            password: process.env.OPENSHIFT_MYSQL_DB_PASSWORD,
            database: process.env.OPENSHIFT_APP_NAME
        };
    }

    return parseDbURL(process.env.JAWSDB_URL);
};

var MYSQL_DBNAME = function () {
    'use strict';

    return MYSQL_CONNECTION_INFO().database;
};

var connection;

var mysql_hasMysql = function () {
    'use strict';

    return !(process.env.OPENSHIFT_MYSQL_DB_HOST === undefined && process.env.JAWSDB_URL === undefined);
};

var mysql_handle_disconnect = function () {
    'use strict';

    connection = mysql.createConnection(MYSQL_CONNECTION_INFO());
    connection.connect(function (err) {
        if (err) {
            console.log('error when connecting to db:', err);
            setTimeout(mysql_handle_disconnect, 2000);
        }
    });
};

var mysql_query = function (query) {
    'use strict';

    var deferred = Q.defer();

    connection = mysql.createConnection(MYSQL_CONNECTION_INFO());
    connection.on('error', function (err) {
        console.log('db error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            mysql_handle_disconnect();
        } else {
            throw err;
        }
    });

    /*jslint unparam: true*/
    connection.query(query, function (error, results, fields) {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(results);
        }
    });
    /*jslint unparam: false*/

    connection.end();

    return deferred.promise;
};

var mysql_createTable = function myself(table_name, index, deferred) {
    'use strict';

    if (deferred === null) {
        deferred = Q.defer();
    }

    /*jslint unparam: true*/
    mysql_query(lo.get(lo.get(MYSQL_TABLE_MAP, table_name), index))
        .then(function (result) {
            if (lo.size(lo.get(MYSQL_TABLE_MAP, table_name)) === index + 1) {
                deferred.resolve();
            } else {
                myself(table_name, index + 1, deferred);
            }
        })
        .catch(function (error) {
            deferred.reject();
        });
    /*jslint unparam: false*/

    return deferred.promise;
};

var mysql_createMissingTables = function (results) {
    'use strict';

    var promises = [],
        all_successful = true,
        errors = [],
        existing_tables = [],
        deferred = Q.defer();

    lo.each(results, function (result) {
        existing_tables.push(lo.get(result, 'Tables_in_' + process.env.OPENSHIFT_APP_NAME));
    });

    lo.each(lo.keys(MYSQL_TABLE_MAP), function (table_name) {
        if (!lo.includes(existing_tables, table_name)) {
            promises.push(mysql_createTable(table_name, 0, null));
        }
    });

    Q.allSettled(promises)
        .then(function (results) {
            lo.each(results, function (result) {
                if (result.state !== 'fulfilled') {
                    all_successful = false;
                    errors.push(result.reason);
                }
            });

            if (all_successful) {
                deferred.resolve();
            } else {
                deferred.reject(new Error(errors));
            }
        });

    return deferred.promise;
};

var mysql_checkAndCreateTables = function () {
    'use strict';

    var table_selectors = [],
        table_select = 'show tables from ' + process.env.OPENSHIFT_APP_NAME + ' where ',
        deferred = Q.defer();

    lo.each(lo.keys(MYSQL_TABLE_MAP), function (table_name) {
        table_selectors.push('Tables_in_' + process.env.OPENSHIFT_APP_NAME + ' like \'' + table_name + '\'');
    });

    table_select += table_selectors.join(' or ');

    mysql_query(table_select)
        .then(mysql_createMissingTables)
        .then(function () {
            deferred.resolve();
        })
        .catch(function (error) {
            deferred.reject(error);
        });

    return deferred.promise;
};

var mysql_logMessage = function (org_id) {
    'use strict';

    var insert_query = 'insert into visits (orgid, visit_time) values (' + mysql.escape(org_id) + ', NOW())',
        deferred = Q.defer();

    mysql_query(insert_query)
        .then(function (results) {
            deferred.resolve(results);
        })
        .catch(function (error) {
            deferred.reject(error);
        });

    return deferred.promise;
};

module.exports = {
    mysql: {
        hasMysql: mysql_hasMysql,
        checkAndCreateTables: mysql_checkAndCreateTables,
        logMessage: mysql_logMessage
    }
};